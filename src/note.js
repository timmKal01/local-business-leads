// Rows that aren't businesses. A run never ends with an empty dataset: it says why nothing was saved, in one row that
// is never charged, so a person, script or AI agent can tell "nothing matched" from "something broke".

export const NOTE_NAME = 'No businesses saved in this run (not charged)';

/**
 * Why a search saved nothing.
 * @param {{ found: number, unnamed: number, chains: number, filteredOut: number, considered: number }} counts
 * @param {{ categoryTitle: string, place: string, includeChains: boolean, onlyWithWebsite: boolean, requireContact: boolean }} search
 */
export function emptyRunReason(counts, search) {
    const what = search.categoryTitle.toLowerCase();
    if (counts.found === 0 || counts.found === counts.unnamed) {
        return `OpenStreetMap lists no named ${what} in ${search.place}. Try a nearby bigger city or another type of business.`;
    }
    const parts = [];
    if (counts.chains && !search.includeChains) parts.push(`${counts.chains} ${counts.chains === 1 ? 'is a chain' : 'are chains'} (turn on includeChains to keep them)`);
    if (counts.filteredOut) {
        const filters = [search.onlyWithWebsite && 'onlyWithWebsite', search.requireContact && 'requireContact'].filter(Boolean).join(' and ');
        parts.push(`${counts.filteredOut} didn't pass ${filters || 'the filters'}`);
    }
    return `OpenStreetMap lists ${counts.found} ${what} in ${search.place}, but none were saved: ${parts.join(', ') || 'none matched'}.`;
}

/** The one row a run saves when it has no businesses to return. */
export function noteRow(note, search, extra = {}) {
    return { rowType: 'note', name: NOTE_NAME, note, search, ...extra, scrapedAt: new Date().toISOString() };
}

/** The row for input that can't be searched (not charged). */
export function errorRow(error, search) {
    return { rowType: 'error', name: "Couldn't run the search (not charged)", error, search, scrapedAt: new Date().toISOString() };
}
