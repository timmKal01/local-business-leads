// Local Business Leads: businesses of one type in one place, from Google Maps (rating, reviews, hours) or Overture
// Maps open data, with name, address, phone and website, optionally enriched with the email, phones, WhatsApp and
// social profiles their own website publishes. If Google Maps doesn't answer, the run falls back to Overture.
// Every row has a rowType: "business", or "note"/"error" (never charged).
import { Actor, log } from 'apify';
import { EVENTS, ENRICH_CONCURRENCY, EXAMPLE_SEARCH, MIN_CONFIDENCE, MAX_AREA_KM } from './config.js';
import { CATEGORIES, categoryMatcher } from './categories.js';
import { geocode, bboxSizeKm } from './geocode.js';
import { latestPlacesRelease, findCandidates, readDetails } from './overture.js';
import { GOOGLE_TERMS, GoogleMapsError, searchGoogleMaps } from './googleMaps.js';
import { placeToListing, googlePlaceToListing, isChain } from './place.js';
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
const wantedSource = input.dataSource === 'overture' ? 'overture' : 'google_maps';
const search = { category, location, place: null, usedExample, source: wantedSource };

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

// The run's time limit (set by whoever started it). New businesses stop this long before it, so the run finishes with
// what it has instead of being cut off as "timed out".
const DEADLINE_MARGIN_MS = 45_000;
const timeoutAt = Actor.getEnv().timeoutAt;
let timeRanOut = false;
const nearDeadline = () => {
    if (timeoutAt && Date.now() > new Date(timeoutAt).getTime() - DEADLINE_MARGIN_MS) timeRanOut = true;
    return timeRanOut;
};

const counts = { inBox: 0, ofType: 0, outside: 0, closed: 0, lowConfidence: 0, chains: 0, filteredOut: 0 };
let saved = 0;
let stopped = false;
let release = null;
const scrapedAt = new Date().toISOString();
const filtersOn = onlyWithWebsite || requireContact;
const attribution = (listing) => (listing.googleMapsUrl
    ? 'Google Maps listing'
    : `Overture Maps Foundation (overturemaps.org)${listing.sources.length ? `, data from ${listing.sources.join(', ')}` : ''}. CDLA Permissive 2.0, Apache 2.0 (Foursquare) or CC0.`);

async function toRow(listing) {
    const site = enrich ? await enrichFromWebsite(listing) : null;
    const phones = [...new Set([...listing.phones, ...(site?.phones ?? [])])];
    const sitePhone = site?.phones.find((p) => !listing.phones.includes(p)) ?? null;
    return {
        rowType: 'business',
        name: listing.name,
        category: listing.category,
        categories: listing.categories ?? (listing.category ? [listing.category] : []),
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
        rating: listing.rating ?? null,
        reviewCount: listing.reviewCount ?? null,
        hours: listing.hours ?? null,
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
        googleMapsUrl: listing.googleMapsUrl ?? null,
        googlePlaceId: listing.googlePlaceId ?? null,
        overtureId: listing.overtureId,
        dataSource: listing.googleMapsUrl ? 'google_maps' : 'overture',
        search,
        attribution: attribution(listing),
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

/** Rows for these listings. With website contacts on, websites are read a few at a time. */
async function saveListings(listings) {
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

const keepListing = (l) => {
    if (!l.name || (onlyWithWebsite && !l.website)) {
        counts.filteredOut++;
        return false;
    }
    return true;
};

// 2a. Google Maps: current listings with rating, reviews and hours. Through Apify's residential proxy on the platform.
async function runGoogleMaps() {
    const proxyConfiguration = Actor.isAtHome() ? await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'], countryCode: 'US' }) : null;
    const g = {};
    const listings = [];
    // Read more when filters will drop some.
    const want = Math.min(1000, filtersOn ? maxResults * 3 : maxResults);
    log.info(`Searching Google Maps for "${GOOGLE_TERMS[category]}" in ${place.name}`);
    for await (const p of searchGoogleMaps({
        term: GOOGLE_TERMS[category], bbox: place.bbox, countryCode: place.countryCode, maxPlaces: want, proxyConfiguration, counts: g,
        shouldStop: () => nearDeadline(),
    })) {
        counts.ofType++;
        if (p.status !== 'open') {
            counts.closed++;
            continue;
        }
        const listing = googlePlaceToListing(p, { countryCode: place.countryCode });
        if (keepListing(listing)) listings.push(listing);
    }
    counts.inBox = g.read ?? 0;
    counts.outside = g.outside ?? 0;
    log.info(`Google Maps: ${counts.ofType} ${categoryTitle.toLowerCase()} in the area (${g.pages} pages, ${g.outside} outside it, ${g.retries} retries), ${counts.closed} closed left out`);
    await saveListings(listings);
}

// 2b. Overture Maps: places of the chosen type in the area that are open, likely to exist and (unless asked) not chains.
async function runOverture() {
    const matches = categoryMatcher(category);
    let candidates;
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

    let taken = 0;
    while (taken < candidates.length && saved < maxResults && !stopped && !nearDeadline()) {
        // Read details for as many as are still needed, more when filters will drop some.
        const want = Math.max(10, (maxResults - saved) * (filtersOn ? 3 : 1));
        const batch = candidates.slice(taken, taken + want);
        taken += batch.length;
        const listings = (await readDetails(batch)).map((p) => placeToListing(p, { countryCode: place.countryCode })).filter(keepListing);
        await saveListings(listings);
    }
}

let fellBack = null;
if (wantedSource === 'google_maps') {
    try {
        await runGoogleMaps();
    } catch (err) {
        if (!(err instanceof GoogleMapsError) || saved > 0) throw err;
        // Nothing was saved from Google, so the whole search runs again on Overture's open data.
        fellBack = err.message;
        log.warning(`${err.message}. Searching Overture Maps instead.`);
        search.source = 'overture';
        Object.assign(counts, { inBox: 0, ofType: 0, outside: 0, closed: 0, lowConfidence: 0, chains: 0, filteredOut: 0 });
    }
}
if (search.source === 'overture') await runOverture();

const sourceLabel = search.source === 'google_maps' ? 'Google Maps' : `Overture Maps ${release}`;
if (saved === 0) {
    const note = timeRanOut
        ? `The run's time limit was reached before any business was saved (${counts.ofType} were found). Run again with a longer time limit.`
        : emptyRunReason(counts, { categoryTitle, place: place.name, includeChains, onlyWithWebsite, requireContact, source: search.source });
    await stop(noteRow(note, search, { ...counts, release, fellBackFromGoogle: fellBack }), note);
}

const summary = `Saved ${saved} ${categoryTitle.toLowerCase()} in ${place.name} (${sourceLabel}).`
    + `${fellBack ? ' Google Maps didn\'t answer, so this run used Overture Maps open data.' : ''}`
    + `${timeRanOut ? " Stopped early to finish within the run's time limit; run again with a longer limit for more." : ''}`;
log.info(summary);
await Actor.setStatusMessage(summary);
await Actor.exit();
