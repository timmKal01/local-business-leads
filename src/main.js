// Local Business Leads: businesses of one type in one place from OpenStreetMap (name, address, phone, website, hours),
// optionally enriched with the email, phones, WhatsApp and social profiles their own website publishes.
// No Google, no proxies, no login. Every row has a rowType: "business", or "note"/"error" (never charged).
import { Actor, log } from 'apify';
import { EVENTS, ENRICH_CONCURRENCY, EXAMPLE_SEARCH } from './config.js';
import { CATEGORIES, geocode, searchListings } from './osm.js';
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

// 1. The place, then the listings. If OpenStreetMap's servers are down, say so in a row instead of failing.
let place;
let result;
try {
    place = await geocode(location);
    if (!place) {
        await stop(errorRow(`OpenStreetMap couldn't find a place called "${location}". Try adding the country, e.g. "Denver, USA".`, search), 'Place not found; nothing charged.');
    }
    search.place = place.display_name;
    log.info(`Searching OpenStreetMap for ${categoryTitle.toLowerCase()} in ${place.display_name}`);
    // Tags-only output is small, so asking for plenty (filters and chains drop some) costs little.
    result = await searchListings({ category, place, fetchLimit: Math.min(10_000, Math.max(1_000, maxResults * 10)) });
} catch (err) {
    log.warning(err.message);
    await stop(noteRow(`OpenStreetMap's servers didn't answer, so nothing was searched or charged: ${err.message}. They are free public servers that are sometimes at capacity; try again in a few minutes.`, search),
        'OpenStreetMap was unavailable; nothing charged.');
}

const counts = { found: result.found, unnamed: result.unnamed, chains: 0, filteredOut: 0, considered: 0 };
const candidates = result.listings.filter((l) => {
    if (l.isChain && !includeChains) {
        counts.chains++;
        return false;
    }
    if (onlyWithWebsite && !l.website) {
        counts.filteredOut++;
        return false;
    }
    return true;
});
log.info(`OpenStreetMap: ${result.found}${result.capped ? '+' : ''} found, ${candidates.length} candidates after chains and filters`
    + `${enrich ? '; reading their websites for contact details' : ''}`);

// 2. Rows, in OpenStreetMap's order. With enrichment on, websites are read a few at a time.
let saved = 0;
let contactsCharged = 0;
let stopped = false;
const scrapedAt = new Date().toISOString();

async function toRow(listing) {
    const site = enrich ? await enrichFromWebsite(listing) : null;
    const sitePhone = site?.phones[0] ?? null;
    const row = {
        rowType: 'business',
        name: listing.name,
        category: listing.category,
        phone: listing.phone ?? sitePhone,
        phoneSource: listing.phone ? 'openstreetmap' : sitePhone ? 'website' : null,
        email: listing.email ?? site?.email ?? null,
        emailSource: listing.email ? 'openstreetmap' : site?.email ? 'website' : null,
        website: listing.website,
        address: listing.address,
        street: listing.street,
        postcode: listing.postcode,
        city: listing.city,
        countryCode: listing.countryCode,
        openingHours: listing.openingHours,
        whatsapp: site?.whatsapp ?? null,
        socialLinks: { ...(site?.socialLinks ?? {}), ...listing.socialLinks },
        websitePhones: site?.phones ?? [],
        websiteStatus: site?.websiteStatus ?? 'not_checked',
        websiteNote: site?.websiteNote ?? null,
        latitude: listing.latitude,
        longitude: listing.longitude,
        isChain: listing.isChain,
        brand: listing.brand,
        placeId: listing.placeId,
        osmUrl: listing.osmUrl,
        search,
        attribution: 'Business data © OpenStreetMap contributors (ODbL)',
        scrapedAt,
    };
    // The website contacts charge is only for something the listing didn't already have.
    const newPhone = site?.phones.some((p) => p !== listing.phone);
    const siteContacts = Boolean(site && ((site.email && site.email !== listing.email) || newPhone || site.whatsapp));
    return { row, siteContacts };
}

async function save({ row, siteContacts }) {
    if (stopped || saved >= maxResults) return;
    if (requireContact && !row.phone && !row.email && !row.whatsapp) {
        counts.filteredOut++;
        return;
    }
    saved++;
    const pushResult = await Actor.pushData(row, EVENTS.listing);
    if (pushResult?.eventChargeLimitReached) stopped = true;
    if (siteContacts && !stopped) {
        contactsCharged++;
        const chargeResult = await Actor.charge({ eventName: EVENTS.websiteContacts });
        if (chargeResult?.eventChargeLimitReached) stopped = true;
    }
    if (stopped) log.warning('The run reached its maximum cost (set by the user); stopping.');
}

// A few workers take the next listing as soon as they're free, so one slow website doesn't hold up the others.
// A worker stops once enough rows are saved or are being worked on (requireContact may need more listings than that).
let next = 0;
let inFlight = 0;
async function worker() {
    while (next < candidates.length && !stopped && saved + inFlight < maxResults) {
        const listing = candidates[next++];
        counts.considered++;
        inFlight++;
        try {
            await save(await toRow(listing));
        } finally {
            inFlight--;
        }
    }
}
await Promise.all(Array.from({ length: enrich ? ENRICH_CONCURRENCY : 1 }, worker));

if (saved === 0) {
    const note = emptyRunReason(counts, { categoryTitle, place: place.display_name, includeChains, onlyWithWebsite, requireContact });
    await stop(noteRow(note, search, { found: result.found, chains: counts.chains, filteredOut: counts.filteredOut }), note);
}

const summary = `Saved ${saved} ${categoryTitle.toLowerCase()} in ${place.display_name}`
    + `${enrich ? `, ${contactsCharged} with contact details from their website` : ''}.`;
log.info(summary);
await Actor.setStatusMessage(summary);
await Actor.exit();
