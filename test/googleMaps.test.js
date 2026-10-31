import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPlaceRecords, parsePlace, cleanWebsite, GOOGLE_TERMS } from '../src/googleMaps.js';
import { googlePlaceToListing } from '../src/place.js';
import { CATEGORIES } from '../src/categories.js';

// A place record laid out like the tbm=map responses seen on 2026-11-01 (values made up, positions real).
function record(overrides = {}) {
    const p = new Array(260).fill(null);
    p[4] = [null, null, null, ['https://search.google.com/local/reviews?placeid=ChIJtest', '1,234 reviews'], null, null, null, 4.7, 1234];
    p[7] = ['https://www.example-plumbing.com/?utm_source=gmb&utm_medium=organic&page=2', 'example-plumbing.com'];
    p[9] = [null, null, 39.75, -105.0];
    p[10] = '0x1:0x2';
    p[11] = 'Example Plumbing';
    p[13] = ['Plumber', 'Drainage service'];
    p[14] = 'Sloan Lake';
    p[39] = '5000 W 29th Ave, Denver, CO 80212';
    p[78] = 'ChIJtest';
    p[166] = 'Denver, CO';
    p[178] = [['(303) 555-0100', [['(303) 555-0100', 1]], null, '+13035550100']];
    p[181] = [null, null, null, null, null, '1234567890'];
    p[203] = [[['Monday', 1, [2026, 11, 2], [['8 AM–5 PM', [[8], [17]]]]], ['Sunday', 7, [2026, 11, 1], []]]];
    p[243] = 'US';
    return Object.assign(p, overrides);
}

test('records are found anywhere in the response', () => {
    const json = [['query'], [[null, record()], [null, record({ 11: 'Second Plumber' })]]];
    assert.deepEqual(findPlaceRecords(json).map((r) => r[11]), ['Example Plumbing', 'Second Plumber']);
    assert.deepEqual(findPlaceRecords([['no places here']]), []);
});

test('a record becomes plain fields: contacts, rating, links and hours', () => {
    const p = parsePlace(record());
    assert.equal(p.name, 'Example Plumbing');
    assert.equal(p.phone, '+13035550100');
    assert.equal(p.website, 'https://www.example-plumbing.com/?page=2'); // utm_* removed, other params kept
    assert.equal(p.rating, 4.7);
    assert.equal(p.reviewCount, 1234);
    assert.equal(p.mapsUrl, 'https://www.google.com/maps?cid=1234567890');
    assert.equal(p.placeId, 'ChIJtest');
    assert.deepEqual(p.hours, ['Monday: 8 AM–5 PM', 'Sunday: Closed']);
    assert.equal(p.status, 'open');
    assert.equal(parsePlace(record({ 88: [null, 'Permanently closed'] })).status, 'permanently_closed');
});

test('missing fields come back empty, not wrong', () => {
    const p = parsePlace(record({ 7: null, 178: null, 4: null, 181: null, 203: null }));
    assert.equal(p.website, null);
    assert.equal(p.phone, null);
    assert.equal(p.rating, null);
    assert.equal(p.mapsUrl, 'https://www.google.com/maps/place/?q=place_id:ChIJtest');
    assert.deepEqual(p.hours, []);
    assert.equal(cleanWebsite('not a url'), 'not a url');
});

test('a Google place becomes a listing with the same columns as an Overture one', () => {
    const l = googlePlaceToListing(parsePlace(record()), { countryCode: 'US' });
    assert.equal(l.street, '5000 W 29th Ave');
    assert.equal(l.city, 'Denver');
    assert.equal(l.region, 'CO');
    assert.equal(l.postcode, '80212');
    assert.deepEqual(l.phones, ['+13035550100']);
    assert.equal(l.isChain, null);
    assert.equal(l.googleMapsUrl, 'https://www.google.com/maps?cid=1234567890');
});

test('every business type has a Google search term', () => {
    assert.deepEqual(Object.keys(GOOGLE_TERMS).sort(), Object.keys(CATEGORIES).sort());
});
