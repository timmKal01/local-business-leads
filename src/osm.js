// Business listings of one type in one place, from OpenStreetMap: Nominatim finds the place, the Overpass API finds the
// businesses. Both are free and keyless; each run makes one request to each, with an identifying User-Agent as their
// usage policies ask. Business data © OpenStreetMap contributors, under the Open Database License (ODbL).
//
// The public Overpass servers are run by volunteers and are sometimes at capacity, so the search tries the next server
// when one is busy or down. Categories are copied from website-gap-finder's sources/osm.js; evolve independently.
import { log } from 'apify';
import { toE164 } from './phone.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OSM_USER_AGENT = 'local-business-leads/0.1 (+https://apify.com/m_ctim/local-business-leads)';
const QUERY_TIMEOUT_S = 25; // a healthy server answers in seconds; a busy one is skipped quickly (3 servers x 40 s at worst)

/** Search categories: the input's dropdown values, the OpenStreetMap tags they cover, and the label each tag gets. */
export const CATEGORIES = {
    plumber: { title: 'Plumbers', tags: [['craft', 'plumber', 'Plumber']] },
    electrician: { title: 'Electricians', tags: [['craft', 'electrician', 'Electrician']] },
    hvac: { title: 'Heating and air conditioning (HVAC)', tags: [['craft', 'hvac', 'HVAC contractor']] },
    roofer: { title: 'Roofers', tags: [['craft', 'roofer', 'Roofer']] },
    carpenter: { title: 'Carpenters and joiners', tags: [['craft', 'carpenter', 'Carpenter'], ['craft', 'joiner', 'Joiner']] },
    painter: { title: 'Painters and decorators', tags: [['craft', 'painter', 'Painter']] },
    hair: { title: 'Hair salons and barbers', tags: [['shop', 'hairdresser', 'Hair salon']] },
    beauty: { title: 'Beauty and nail salons', tags: [['shop', 'beauty', 'Beauty salon']] },
    massage: { title: 'Massage and spas', tags: [['shop', 'massage', 'Massage'], ['leisure', 'spa', 'Spa']] },
    tattoo: { title: 'Tattoo and piercing studios', tags: [['shop', 'tattoo', 'Tattoo studio']] },
    dentist: { title: 'Dentists', tags: [['amenity', 'dentist', 'Dentist'], ['healthcare', 'dentist', 'Dentist']] },
    doctor: { title: 'Doctors and clinics', tags: [['amenity', 'doctors', 'Doctor'], ['amenity', 'clinic', 'Clinic']] },
    physio: { title: 'Physiotherapists', tags: [['healthcare', 'physiotherapist', 'Physiotherapist']] },
    vet: { title: 'Veterinarians', tags: [['amenity', 'veterinary', 'Veterinarian']] },
    optician: { title: 'Opticians', tags: [['shop', 'optician', 'Optician']] },
    gym: { title: 'Gyms and fitness studios', tags: [['leisure', 'fitness_centre', 'Gym']] },
    restaurant: { title: 'Restaurants', tags: [['amenity', 'restaurant', 'Restaurant']] },
    cafe: { title: 'Cafes', tags: [['amenity', 'cafe', 'Cafe']] },
    bakery: { title: 'Bakeries', tags: [['shop', 'bakery', 'Bakery']] },
    hotel: { title: 'Hotels and guest houses', tags: [['tourism', 'hotel', 'Hotel'], ['tourism', 'guest_house', 'Guest house']] },
    car_repair: { title: 'Car repair garages', tags: [['shop', 'car_repair', 'Car repair']] },
    car_dealer: { title: 'Car dealers', tags: [['shop', 'car', 'Car dealer']] },
    lawyer: { title: 'Lawyers', tags: [['office', 'lawyer', 'Lawyer']] },
    accountant: { title: 'Accountants', tags: [['office', 'accountant', 'Accountant']] },
    estate_agent: { title: 'Real estate agents', tags: [['office', 'estate_agent', 'Real estate agent']] },
    florist: { title: 'Florists', tags: [['shop', 'florist', 'Florist']] },
    clothes: { title: 'Clothing stores', tags: [['shop', 'clothes', 'Clothing store']] },
    furniture: { title: 'Furniture stores', tags: [['shop', 'furniture', 'Furniture store']] },
    photographer: { title: 'Photographers', tags: [['craft', 'photographer', 'Photographer'], ['shop', 'photo', 'Photo studio']] },
    driving_school: { title: 'Driving schools', tags: [['amenity', 'driving_school', 'Driving school']] },
    childcare: { title: 'Nurseries and childcare', tags: [['amenity', 'kindergarten', 'Nursery'], ['amenity', 'childcare', 'Childcare']] },
    laundry: { title: 'Laundry and dry cleaning', tags: [['shop', 'laundry', 'Laundry'], ['shop', 'dry_cleaning', 'Dry cleaner']] },
};

/** Where to search: an OpenStreetMap area (a city boundary) when Nominatim found one, otherwise a radius around a point. */
export function overpassScope(place) {
    if (place.osm_type === 'relation') return `area(id:${3_600_000_000 + Number(place.osm_id)})->.searchArea;`;
    if (place.osm_type === 'way') return `area(id:${2_400_000_000 + Number(place.osm_id)})->.searchArea;`;
    return null; // a point (node): search around it instead
}

/** The Overpass query for one category in one place. `limit` caps how many elements come back. */
export function buildOverpassQuery(categoryKey, place, limit) {
    const category = CATEGORIES[categoryKey];
    if (!category) throw new Error(`Unknown search category "${categoryKey}"`);
    const scope = overpassScope(place);
    const filter = scope ? '(area.searchArea)' : `(around:5000,${Number(place.lat)},${Number(place.lon)})`;
    const parts = category.tags.map(([key, value]) => `nwr["${key}"="${value}"]["name"]${filter};`).join('');
    return `[out:json][timeout:${QUERY_TIMEOUT_S}];${scope ?? ''}(${parts});out tags center ${limit};`;
}

const first = (t, keys) => keys.map((k) => t[k]).find(Boolean)?.split(';')[0].trim() || null;
const SOCIAL_TAGS = { facebook: 'contact:facebook', instagram: 'contact:instagram', x: 'contact:twitter', linkedin: 'contact:linkedin', tiktok: 'contact:tiktok', youtube: 'contact:youtube' };

/** Social profile URLs written on the listing. Plain handles are left out: they can't be told apart from typos. */
function listedSocials(t) {
    const out = {};
    for (const [network, key] of Object.entries(SOCIAL_TAGS)) {
        const value = t[key]?.split(';')[0].trim();
        if (value && /^https?:\/\//i.test(value)) out[network] = value;
    }
    return out;
}

/** "example.com" -> "https://example.com". Anything that still isn't an http(s) URL is dropped. */
export function normalizeWebsite(raw) {
    if (!raw) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null; // mailto:, tel:, ...
    const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
    try {
        const u = new URL(value);
        return /^https?:$/.test(u.protocol) && u.hostname.includes('.') && !u.username ? u.href : null;
    } catch {
        return null;
    }
}

/**
 * One OpenStreetMap element -> a listing, or the reason it was skipped ('unnamed').
 * Chains (anything tagged with a brand:wikidata) are kept but marked, so the caller can leave them out.
 */
export function elementToListing(el, { categoryKey, city, countryCode }) {
    const t = el.tags ?? {};
    if (!t.name) return { skip: 'unnamed' };
    const match = CATEGORIES[categoryKey].tags.find(([key, value]) => t[key] === value);
    let category = match ? match[2] : CATEGORIES[categoryKey].title;
    if (category === 'Hair salon' && /barber/i.test(t.name)) category = 'Barber shop';
    const country = (t['addr:country'] ?? countryCode)?.toUpperCase() ?? null;
    const rawPhone = first(t, ['phone', 'contact:phone', 'contact:mobile', 'mobile']);
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || null;
    const listingCity = t['addr:city'] ?? city ?? null;
    return {
        listing: {
            name: t.name,
            category,
            phone: rawPhone ? (toE164(rawPhone, country) ?? rawPhone) : null,
            email: first(t, ['email', 'contact:email'])?.toLowerCase() ?? null,
            website: normalizeWebsite(first(t, ['website', 'contact:website', 'url'])),
            address: [street, t['addr:postcode'], listingCity].filter(Boolean).join(', ') || null,
            street,
            postcode: t['addr:postcode'] ?? null,
            city: listingCity,
            countryCode: country,
            openingHours: t.opening_hours ?? null,
            socialLinks: listedSocials(t),
            latitude: el.lat ?? el.center?.lat ?? null,
            longitude: el.lon ?? el.center?.lon ?? null,
            isChain: Boolean(t['brand:wikidata']),
            brand: t.brand ?? null,
            placeId: `osm:${el.type}/${el.id}`,
            osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        },
    };
}

async function fetchJson(url, init, what, timeoutMs) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': OSM_USER_AGENT, Accept: 'application/json', ...init?.headers }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok || !text.trimStart().startsWith('{') && !text.trimStart().startsWith('[')) {
        const err = new Error(`${what} answered HTTP ${res.status}${res.ok ? ' with something that isn\'t JSON' : ''}`);
        err.status = res.ok ? 502 : res.status;
        throw err;
    }
    return JSON.parse(text);
}

/** The place the user typed, via Nominatim. Returns null when OpenStreetMap doesn't know it. */
export async function geocode(location) {
    const params = new URLSearchParams({ q: location, format: 'jsonv2', limit: '1', addressdetails: '1' });
    const results = await fetchJson(`${NOMINATIM_URL}?${params}`, {}, "OpenStreetMap's place search", 30_000);
    return results[0] ?? null;
}

/** The Overpass search, trying the next public server when one is busy or down. */
async function overpass(query) {
    const failures = [];
    for (const url of OVERPASS_URLS) {
        try {
            return await fetchJson(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
                new URL(url).host, (QUERY_TIMEOUT_S + 15) * 1000);
        } catch (err) {
            const why = err.name === 'TimeoutError' ? 'timed out' : err.message;
            failures.push(`${new URL(url).host}: ${why}`);
            log.warning(`OpenStreetMap search server ${new URL(url).host} failed (${why}); trying the next one`);
        }
    }
    const err = new Error(`Every OpenStreetMap search server was busy or down (${failures.join('; ')})`);
    err.sourceDown = true;
    throw err;
}

/**
 * Listings of one category around one place (already geocoded).
 * @returns {Promise<{ listings: object[], found: number, capped: boolean, unnamed: number }>}
 */
export async function searchListings({ category, place, fetchLimit }) {
    const address = place.address ?? {};
    const city = address.city ?? address.town ?? address.village ?? address.municipality ?? address.county ?? place.name ?? null;
    const countryCode = address.country_code?.toUpperCase() ?? null;
    const data = await overpass(buildOverpassQuery(category, place, fetchLimit));
    const elements = data.elements ?? [];
    const listings = [];
    let unnamed = 0;
    for (const el of elements) {
        const { listing } = elementToListing(el, { categoryKey: category, city, countryCode });
        if (listing) listings.push(listing);
        else unnamed++;
    }
    return { listings, found: elements.length, capped: elements.length >= fetchLimit, unnamed };
}
