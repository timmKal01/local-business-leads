import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementToListing, normalizeWebsite, buildOverpassQuery, CATEGORIES } from '../src/osm.js';

const ctx = { categoryKey: 'dentist', city: 'Austin', countryCode: 'US' };

test('a full listing keeps its contact fields, with the phone in E.164', () => {
    const { listing } = elementToListing({
        type: 'node', id: 42, lat: 30.27, lon: -97.74,
        tags: {
            amenity: 'dentist', name: 'Bright Smile Dental', phone: '(512) 555-0123', email: 'Hello@BrightSmile.example',
            website: 'brightsmile.example', 'addr:housenumber': '100', 'addr:street': 'Congress Ave', 'addr:postcode': '78701',
            opening_hours: 'Mo-Fr 08:00-17:00', 'contact:facebook': 'https://www.facebook.com/brightsmile', 'contact:instagram': 'brightsmile',
        },
    }, ctx);
    assert.equal(listing.name, 'Bright Smile Dental');
    assert.equal(listing.category, 'Dentist');
    assert.equal(listing.phone, '+15125550123');
    assert.equal(listing.email, 'hello@brightsmile.example');
    assert.equal(listing.website, 'https://brightsmile.example/');
    assert.equal(listing.address, '100 Congress Ave, 78701, Austin');
    assert.equal(listing.countryCode, 'US');
    assert.deepEqual(listing.socialLinks, { facebook: 'https://www.facebook.com/brightsmile' }); // a bare handle is left out
    assert.equal(listing.placeId, 'osm:node/42');
    assert.equal(listing.osmUrl, 'https://www.openstreetmap.org/node/42');
    assert.equal(listing.isChain, false);
});

test('ways use their centre point, chains are marked, unnamed elements are skipped', () => {
    const { listing } = elementToListing({ type: 'way', id: 7, center: { lat: 1, lon: 2 }, tags: { amenity: 'dentist', name: 'Aspen Dental', 'brand:wikidata': 'Q4807808', brand: 'Aspen Dental' } }, ctx);
    assert.equal(listing.latitude, 1);
    assert.equal(listing.longitude, 2);
    assert.equal(listing.isChain, true);
    assert.equal(listing.brand, 'Aspen Dental');
    assert.equal(listing.phone, null);
    assert.equal(listing.website, null);
    assert.deepEqual(elementToListing({ type: 'node', id: 8, tags: { amenity: 'dentist' } }, ctx), { skip: 'unnamed' });
});

test('a phone that cannot be parsed is kept as written; the first of several is used', () => {
    assert.equal(elementToListing({ type: 'node', id: 1, tags: { name: 'A', phone: 'call us' } }, ctx).listing.phone, 'call us');
    assert.equal(elementToListing({ type: 'node', id: 2, tags: { name: 'B', phone: '+1 512 555 0100; +1 512 555 0101' } }, ctx).listing.phone, '+15125550100');
});

test('barbers get their own label', () => {
    const { listing } = elementToListing({ type: 'node', id: 3, tags: { shop: 'hairdresser', name: "Joe's Barber Shop" } }, { ...ctx, categoryKey: 'hair' });
    assert.equal(listing.category, 'Barber shop');
});

test('normalizeWebsite adds https and rejects things that are not web addresses', () => {
    assert.equal(normalizeWebsite('example.com/about'), 'https://example.com/about');
    assert.equal(normalizeWebsite('http://example.com'), 'http://example.com/');
    assert.equal(normalizeWebsite('not a site'), null);
    assert.equal(normalizeWebsite('mailto:a@b.com'), null);
    assert.equal(normalizeWebsite(null), null);
});

test('the query searches a city area, or 5 km around a point', () => {
    const area = buildOverpassQuery('dentist', { osm_type: 'relation', osm_id: 113314 }, 500);
    assert.match(area, /area\(id:3600113314\)->\.searchArea;/);
    assert.match(area, /nwr\["amenity"="dentist"\]\["name"\]\(area\.searchArea\);/);
    assert.match(area, /nwr\["healthcare"="dentist"\]/);
    assert.match(area, /out tags center 500;$/);
    const point = buildOverpassQuery('cafe', { osm_type: 'node', osm_id: 1, lat: '51.5', lon: '-0.12' }, 100);
    assert.match(point, /\(around:5000,51\.5,-0\.12\)/);
    assert.throws(() => buildOverpassQuery('nope', { osm_type: 'node' }, 1), /Unknown search category/);
});

test('there are 32 categories, each with a title and at least one tag', () => {
    assert.equal(Object.keys(CATEGORIES).length, 32);
    for (const c of Object.values(CATEGORIES)) {
        assert.ok(c.title);
        assert.ok(c.tags.length >= 1);
    }
});
