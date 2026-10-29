// Local Business Leads: businesses of one type in one place from Overture Maps open data (name, address, phone,
// website, email, socials), optionally enriched with the email, phones, WhatsApp and social profiles their own website
// publishes. No Google, no proxies, no login. Every row has a rowType: "business", or "note"/"error" (never charged).
import { Actor, log } from 'apify';
import { EVENTS, ENRICH_CONCURRENCY, EXAMPLE_SEARCH, MIN_CONFIDENCE, MAX_AREA_KM } from './config.js';
import { CATEGORIES, categoryMatcher } from './categories.js';
import { geocode, bboxSizeKm } from './geocode.js';
import { latestPlacesRelease, findCandidates, readDetails } from './overture.js';
import { placeToListing, isChain } from './place.js';
import { enrichFromWebsite } from './enrich.js';
import { emptyRunReason, noteRow, errorRow } from './note.js';

await Actor.init();
const input = (await Actor.getInput()) ?? {};

// An empty call (an AI agent calling with {}, or an empty API call) runs the form's example instead of failing.
// The fallback lives here, not in schema defaults, so every row can say whether the example was used.
let category = String(input.searchCategory ?? '').trim();
let location = String(input.searchLocation ?? '').trim();
const usedExample = !category && !location;
if (usedExample) {
    ({ category, location } = EXAMPLE_SEARCH);
    log.info(`No search given, so running the example: ${CATEGORIES[category].title.toLowerCase()} in ${location}.`);
}
const maxResults = Math.min(2000, Math.max(1, Math.floor(Number(input.maxResults ?? 100)) || 100));
const enrich = input.enrichFromWebsite === true;
const onlyWithWebsite = input.onlyWithWebsite === true;
const requireContact = input.requireContact === true;
const includeChains = input.includeChains === true;
const search = { category, location, place: null, usedExample };

async function stop(row, status) {
    await Actor.pushData(row);
    await Actor.setStatusMessage(status);
    await Actor.exit();
}

if (!category || !location) {
    await stop(errorRow(`Give both searchCategory and searchLocation (for example "dentist" and "Austin, TX"). Got ${category ? 'only a category' : 'only a place'}.`, search),
        'The search needs a business type and a place; nothing charged.');
}
if (!CATEGORIES[category]) {
    await stop(errorRow(`"${category}" isn't a searchCategory. Use one of: ${Object.keys(CATEGORIES).join(', ')}.`, search), 'Unknown business type; nothing searched or charged.');
}
const categoryTitle = CATEGORIES[category].title;

// 1. The place.
let place;
try {
    place = await geocode(location);
} catch (err) {
    await stop(noteRow(`${err.message}, so nothing was searched or charged. Try again in a few minutes.`, search), 'The place search was unavailable; nothing charged.');
}
if (!place) {
    await stop(errorRow(`Couldn't find a place called "${location}". Try adding the country, e.g. "Denver, USA".`, search), 'Place not found; nothing charged.');
}
search.place = place.name;
const { widthKm, heightKm } = bboxSizeKm(place.bbox);
if (widthKm > MAX_AREA_KM || heightKm > MAX_AREA_KM) {
    await stop(errorRow(`"${place.name}" covers about ${Math.round(widthKm)} x ${Math.round(heightKm)} km. Search a city, town or neighbourhood (up to ${MAX_AREA_KM} km across) instead.`, search),
        'Area too large; nothing charged.');
}

// 2. Candidates: places of the chosen type in the area that are open, likely to exist and (unless asked) not chains.
const counts = { inBox: 0, ofType: 0, closed: 0, lowConfidence: 0, chains: 0, filteredOut: 0 };
const matches = categoryMatcher(category);
let candidates;
let release;
try {
    const latest = await latestPlacesRelease();
    release = latest.release;
    log.info(`Searching Overture Maps (release ${release}) for ${categoryTitle.toLowerCase()} in ${place.name}`);
    const found = await findCandidates({
        files: latest.files,
        bbox: place.bbox,
        keep: (p) => {
            if (!matches(p)) return false;
            counts.ofType++;
            if (p.operating_status && p.operating_status !== 'open') {
                counts.closed++;
                return false;
            }
            if (typeof p.confidence === 'number' && p.confidence < MIN_CONFIDENCE) {
                counts.lowConfidence++;
                return false;
            }
            if (isChain(p) && !includeChains) {
                counts.chains++;
                return false;
            }
            return true;
        },
    });
    counts.inBox = found.inBox;
    // Most certain first, so a small maxResults gets the best-attested businesses from all over the area.
    candidates = found.candidates.sort((a, b) => (b.light.confidence ?? 0) - (a.light.confidence ?? 0));
} catch (err) {
    log.warning(err.message);
    await stop(noteRow(`Overture's data files couldn't be read, so nothing was searched or charged: ${err.message}. Try again in a few minutes.`, search),
        'The data files were unavailable; nothing charged.');
}
log.info(`${candidates.length} candidates (${counts.ofType} ${categoryTitle.toLowerCase()}, ${counts.closed} closed, ${counts.lowConfidence} low confidence, ${counts.chains} chains left out)`);

// 3. Rows. Details are read in batches; with website contacts on, websites are read a few at a time.
// The run's time limit (set by whoever started it). New businesses stop this long before it, so the run finishes with
// what it has instead of being cut off as "timed out".
const DEADLINE_MARGIN_MS = 45_000;
const timeoutAt = Actor.getEnv().timeoutAt;
let timeRanOut = false;
const nearDeadline = () => {
    if (timeoutAt && Date.now() > new Date(timeoutAt).getTime() - DEADLINE_MARGIN_MS) timeRanOut = true;
    return timeRanOut;
};

let saved = 0;
let stopped = false;
const scrapedAt = new Date().toISOString();
const attribution = (sources) => `Overture Maps Foundation (overturemaps.org)${sources.length ? `, data from ${sources.join(', ')}` : ''}. CDLA Permissive 2.0, Apache 2.0 (Foursquare) or CC0.`;

async function toRow(listing) {
    const site = enrich ? await enrichFromWebsite(listing) : null;
    const phones = [...new Set([...listing.phones, ...(site?.phones ?? [])])];
    const sitePhone = site?.phones.find((p) => !listing.phones.includes(p)) ?? null;
    return {
        rowType: 'business',
        name: listing.name,
        category: listing.category,
        phone: listing.phone ?? sitePhone,
        phones,
        email: listing.email ?? site?.email ?? null,
        emailSource: listing.email ? 'listing' : site?.email ? 'website' : null,
        website: listing.website,
        address: listing.address,
        street: listing.street,
        city: listing.city,
        region: listing.region,
        postcode: listing.postcode,
        countryCode: listing.countryCode,
        whatsapp: site?.whatsapp ?? null,
        socialLinks: { ...(site?.socialLinks ?? {}), ...listing.socialLinks },
        websiteStatus: site?.websiteStatus ?? 'not_checked',
        websiteNote: site?.websiteNote ?? null,
        latitude: listing.latitude,
        longitude: listing.longitude,
        isChain: listing.isChain,
        brand: listing.brand,
        operatingStatus: listing.operatingStatus,
        confidence: listing.confidence,
        overtureId: listing.overtureId,
        search,
        attribution: attribution(listing.sources),
        scrapedAt,
    };
}

async function save(row) {
    if (stopped || saved >= maxResults) return;
    if (requireContact && !row.phone && !row.email && !row.whatsapp) {
        counts.filteredOut++;
        return;
    }
    saved++;
    const pushResult = await Actor.pushData(row, EVENTS.listing);
    if (pushResult?.eventChargeLimitReached) {
        stopped = true;
        log.warning('The run reached its maximum cost (set by the user); stopping.');
    }
}

const filtersOn = onlyWithWebsite || requireContact;
let taken = 0;
while (taken < candidates.length && saved < maxResults && !stopped && !nearDeadline()) {
    // Read details for as many as are still needed, more when filters will drop some.
    const want = Math.max(10, (maxResults - saved) * (filtersOn ? 3 : 1));
    const batch = candidates.slice(taken, taken + want);
    taken += batch.length;
    const listings = (await readDetails(batch))
        .map((p) => placeToListing(p, { countryCode: place.countryCode }))
        .filter((l) => {
            if (!l.name || (onlyWithWebsite && !l.website)) {
                counts.filteredOut++;
                return false;
            }
            return true;
        });

    // A few workers take the next listing as soon as they're free, so one slow website doesn't hold up the others.
    let next = 0;
    let inFlight = 0;
    const worker = async () => {
        while (next < listings.length && !stopped && saved + inFlight < maxResults && !nearDeadline()) {
            const listing = listings[next++];
            inFlight++;
            try {
                await save(await toRow(listing));
            } finally {
                inFlight--;
            }
        }
    };
    await Promise.all(Array.from({ length: enrich ? ENRICH_CONCURRENCY : 1 }, worker));
}

if (saved === 0) {
    const note = timeRanOut
        ? `The run's time limit was reached before any business was saved (${candidates.length} candidates were found). Run again with a longer time limit.`
        : emptyRunReason(counts, { categoryTitle, place: place.name, includeChains, onlyWithWebsite, requireContact });
    await stop(noteRow(note, search, { ...counts, release }), note);
}

const summary = `Saved ${saved} ${categoryTitle.toLowerCase()} in ${place.name} (Overture Maps ${release}).`
    + `${timeRanOut ? " Stopped early to finish within the run's time limit; run again with a longer limit for more." : ""}`;
log.info(summary);
await Actor.setStatusMessage(summary);
await Actor.exit();
