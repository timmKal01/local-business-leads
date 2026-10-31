// One Overture place record -> the listing fields a row is built from.
import { categoryLabel } from './categories.js';
import { socialLinks } from './page.js';
import { toE164 } from './phone.js';

const unique = (values) => [...new Set(values.filter(Boolean))];

/** "example.com" -> "https://example.com/". Anything that isn't an http(s) web address is dropped. */
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

/** A place is a chain branch when Overture links it to a brand. */
export const isChain = (place) => Boolean(place.brand?.wikidata || place.brand?.names?.primary);

/**
 * @param {object} place an Overture place (DETAIL_COLUMNS)
 * @param {{ countryCode: string|null }} context the searched place's country, for phone numbers written without one
 */
export function placeToListing(place, { countryCode }) {
    const address = place.addresses?.[0] ?? {};
    const country = (address.country ?? countryCode ?? '').toUpperCase() || null;
    const phones = unique((place.phones ?? []).map((p) => toE164(p, country) ?? p));
    const websites = unique((place.websites ?? []).map(normalizeWebsite));
    const emails = unique((place.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)));
    const b = place.bbox ?? {};
    const datasets = unique((place.sources ?? []).map((s) => s.dataset));
    return {
        name: place.names?.primary ?? null,
        category: categoryLabel(place.taxonomy?.primary ?? place.basic_category),
        phone: phones[0] ?? null,
        phones,
        email: emails[0] ?? null,
        emails,
        website: websites[0] ?? null,
        address: address.freeform ? [address.freeform, address.locality, address.region, address.postcode].filter(Boolean).join(', ') : null,
        street: address.freeform ?? null,
        city: address.locality ?? null,
        region: address.region ?? null,
        postcode: address.postcode ?? null,
        countryCode: country,
        socialLinks: socialLinks((place.socials ?? []).map(String)),
        latitude: Number.isFinite(b.ymin) ? (b.ymin + b.ymax) / 2 : null,
        longitude: Number.isFinite(b.xmin) ? (b.xmin + b.xmax) / 2 : null,
        isChain: isChain(place),
        brand: place.brand?.names?.primary ?? null,
        operatingStatus: place.operating_status ?? null,
        confidence: typeof place.confidence === 'number' ? Math.round(place.confidence * 1000) / 1000 : null,
        overtureId: place.id ?? null,
        sources: datasets,
    };
}

/**
 * One Google Maps place (googleMaps.js parsePlace) -> the same listing fields, plus rating, reviews, hours and links.
 * Google gives one formatted address, so the street is its first part and the city comes from Google's locality.
 * @param {object} place
 * @param {{ countryCode: string|null }} context the searched place's country, for phone numbers written without one
 */
export function googlePlaceToListing(place, { countryCode }) {
    const country = (place.countryCode ?? countryCode ?? '').toUpperCase() || null;
    const phone = place.phone ? (toE164(place.phone, country) ?? place.phone) : null;
    const [cityPart, regionPart] = (place.locality ?? '').split(',').map((s) => s.trim());
    const postcode = place.address?.match(/\b(\d{5})(?:-\d{4})?$/)?.[1] ?? null;
    return {
        name: place.name,
        category: place.categories[0] ?? null,
        categories: place.categories,
        phone,
        phones: phone ? [phone] : [],
        email: null,
        emails: [],
        website: normalizeWebsite(place.website),
        address: place.address,
        street: place.address?.split(',')[0]?.trim() ?? null,
        city: cityPart || null,
        region: regionPart?.replace(/\s*\d.*$/, '') || null,
        postcode,
        countryCode: country,
        socialLinks: {},
        latitude: place.latitude,
        longitude: place.longitude,
        isChain: null, // Google doesn't say; Overture does
        brand: null,
        operatingStatus: place.status,
        confidence: null,
        overtureId: null,
        sources: ['Google Maps'],
        rating: place.rating,
        reviewCount: place.reviewCount,
        hours: place.hours,
        googleMapsUrl: place.mapsUrl,
        googlePlaceId: place.placeId,
    };
}
