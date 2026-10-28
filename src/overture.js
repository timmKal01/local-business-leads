// Business places from Overture Maps (overturemaps.org): open data published as GeoParquet files on Amazon S3,
// readable without a key. The files are sorted by location, so a city only touches a few row groups. Each row group
// carries min/max statistics for the bbox columns, and those groups are read in two passes:
//   1. location, category, status, confidence and brand only, to find the candidates;
//   2. full details, only for the candidates chosen.
// Licenses: CDLA Permissive 2.0 (Meta, Microsoft and others), Apache 2.0 (Foursquare), CC0 (AllThePlaces).
import { log } from 'apify';
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const BUCKET = 'https://overturemaps-us-west-2.s3.amazonaws.com';
const LIGHT_COLUMNS = ['bbox', 'basic_category', 'taxonomy', 'operating_status', 'confidence', 'brand'];
const DETAIL_COLUMNS = ['id', 'names', 'basic_category', 'taxonomy', 'confidence', 'websites', 'socials', 'emails', 'phones', 'brand', 'addresses', 'operating_status', 'sources', 'bbox'];

/** fetch with retries, reading the whole body inside each attempt so a connection dropped mid-download is retried too. */
async function steadyFetch(url, init = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
            if (res.status >= 500 || res.status === 429) throw new Error(`S3 answered HTTP ${res.status}`);
            const body = await res.arrayBuffer();
            return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
        } catch (err) {
            lastErr = err;
            if (attempt < 4) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        }
    }
    throw lastErr;
}

const listXml = async (params) => (await steadyFetch(`${BUCKET}/?${new URLSearchParams({ 'list-type': '2', ...params })}`)).text();

/** The newest release that has places files: { release, files: [{ url, size }] }. */
export async function latestPlacesRelease() {
    const prefixes = [...(await listXml({ prefix: 'release/', delimiter: '/' })).matchAll(/<Prefix>(release\/[^<]+\/)<\/Prefix>/g)]
        .map((m) => m[1]).sort().reverse();
    for (const prefix of prefixes.slice(0, 3)) {
        const xml = await listXml({ prefix: `${prefix}theme=places/type=place/` });
        const files = [...xml.matchAll(/<Contents>.*?<Key>([^<]+\.parquet)<\/Key>.*?<Size>(\d+)<\/Size>.*?<\/Contents>/gs)]
            .map((m) => ({ url: `${BUCKET}/${m[1]}`, size: Number(m[2]) }));
        if (files.length) return { release: prefix.split('/')[1], files };
    }
    throw new Error('No Overture places release found on S3');
}

export const boxesOverlap = (a, b) => a.xmin <= b.xmax && a.xmax >= b.xmin && a.ymin <= b.ymax && a.ymax >= b.ymin;

/** A row group's bbox, from its column statistics. Null when the statistics are missing (then it must be read). */
export function rowGroupBox(rowGroup) {
    const stat = (name) => rowGroup.columns.find((c) => c.meta_data?.path_in_schema.join('.') === name)?.meta_data.statistics;
    const box = { xmin: stat('bbox.xmin')?.min_value, xmax: stat('bbox.xmax')?.max_value, ymin: stat('bbox.ymin')?.min_value, ymax: stat('bbox.ymax')?.max_value };
    return Object.values(box).every((v) => typeof v === 'number') ? box : null;
}

/**
 * Pass 1: every place in the box that passes `keep`, across all files, as candidates.
 * @param {{ files: {url: string, size: number}[], bbox: object, keep: (light: object) => boolean }} options
 * @returns {Promise<{ candidates: object[], inBox: number, bytes: number }>}
 */
export async function findCandidates({ files, bbox, keep }) {
    const candidates = [];
    let inBox = 0;
    for (const [fileIndex, { url, size }] of files.entries()) {
        // No byte cache: a city reads tens of MB, and keeping it all would double the memory a run needs.
        const file = await asyncBufferFromUrl({ url, byteLength: size, fetch: steadyFetch });
        const metadata = await parquetMetadataAsync(file);
        let start = 0;
        for (const [groupIndex, rowGroup] of metadata.row_groups.entries()) {
            const rows = Number(rowGroup.num_rows);
            const box = rowGroupBox(rowGroup);
            if (!box || boxesOverlap(box, bbox)) {
                const light = await parquetReadObjects({ file, metadata, compressors, columns: LIGHT_COLUMNS, rowStart: start, rowEnd: start + rows });
                light.forEach((place, i) => {
                    if (!place.bbox || !boxesOverlap(place.bbox, bbox)) return;
                    inBox++;
                    if (keep(place)) candidates.push({ file, metadata, group: `${fileIndex}:${groupIndex}`, rowIndex: start + i, light: place });
                });
            }
            start += rows;
        }
    }
    log.info(`Overture: ${inBox} places in the area, ${candidates.length} of the chosen type`);
    return { candidates, inBox };
}

/**
 * Split sorted row numbers into runs whose neighbours are at most `maxGap` apart, so each run is one small read.
 * @param {number[]} sorted
 */
export function rowRuns(sorted, maxGap = 64) {
    const runs = [];
    for (const row of sorted) {
        const last = runs[runs.length - 1];
        if (last && row - last.end <= maxGap) last.end = row;
        else runs.push({ start: row, end: row });
    }
    return runs;
}

/**
 * Pass 2: full details for some candidates. Candidates are spread over the area, so each row group is read as a few
 * short runs around them, not as one range from the first to the last (that read whole row groups and ran out of
 * memory on Apify). Returns the places in the same order as `chosen`.
 */
export async function readDetails(chosen) {
    const byGroup = new Map();
    for (const c of chosen) {
        if (!byGroup.has(c.group)) byGroup.set(c.group, []);
        byGroup.get(c.group).push(c);
    }
    const details = new Map();
    for (const group of byGroup.values()) {
        const { file, metadata } = group[0];
        const byRow = new Map(group.map((c) => [c.rowIndex, c]));
        for (const { start, end } of rowRuns([...byRow.keys()].sort((a, b) => a - b))) {
            const read = await parquetReadObjects({ file, metadata, compressors, columns: DETAIL_COLUMNS, rowStart: start, rowEnd: end + 1 });
            read.forEach((place, i) => {
                const c = byRow.get(start + i);
                if (c) details.set(c, place);
            });
        }
    }
    return chosen.map((c) => details.get(c));
}
