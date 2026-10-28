import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeToListing, normalizeWebsite, isChain } from '../src/place.js';
import { CATEGORIES, categoryMatcher, categoryLabel } from '../src/categories.js';
import { rowGroupBox, boxesOverlap } from '../src/overture.js';
import { bboxSizeKm } from '../src/geocode.js';

// Shaped like a real record from the 2026-10-21.0 release (values made up).
const place = {
    id: '08f1a2b3c4d5e6f7',
    names: { primary: 'Bright Smile Dental' },
    basic_category: 'dental_clinic',
    taxonomy: { primary: 'general_dentistry', hierarchy: ['health_care', 'outpatient_care_facility', 'dental_clinic', 'general_dentistry'] },
    confidence: 0.9512,
    websites: ['brightsmile.example', 'https://brightsmile.example/'],
    socials: ['https://www.facebook.com/brightsmile', 'https://www.instagram.com/brightsmile'],
    emails: ['Hello@BrightSmile.example', 'not an email'],
    phones: ['(512) 555-0123', '+15125550123'],
    brand: null,
    addresses: [{ freeform: '100 Congress Ave', locality: 'Austin', region: 'TX', postcode: '78701', country: 'US' }],
    operating_status: 'open',
    sources: [{ dataset: 'meta' }, { dataset: 'Foursquare' }, { dataset: 'meta' }],
    bbox: { xmin: -97.75, xmax: -97.74, ymin: 30.26, ymax: 30.27 },
};

test('an Overture place becomes a listing with clean contacts', () => {
    const l = placeToListing(place, { countryCode: 'US' });
    assert.equal(l.name, 'Bright Smile Dental');
    assert.equal(l.category, 'General dentistry');
    assert.equal(l.phone, '+15125550123');
    assert.deepEqual(l.phones, ['+15125550123']); // the same number written two ways counts once
    assert.equal(l.email, 'hello@brightsmile.example');
    assert.deepEqual(l.emails, ['hello@brightsmile.example']);
    assert.equal(l.website, 'https://brightsmile.example/');
    assert.equal(l.address, '100 Congress Ave, Austin, TX, 78701');
    assert.equal(l.city, 'Austin');
    assert.equal(l.countryCode, 'US');
    assert.deepEqual(l.socialLinks, { facebook: 'https://www.facebook.com/brightsmile', instagram: 'https://www.instagram.com/brightsmile' });
    assert.equal(l.latitude, 30.265);
    assert.equal(l.confidence, 0.951);
    assert.deepEqual(l.sources, ['meta', 'Foursquare']);
    assert.equal(l.isChain, false);
});

test('missing fields come back as null or empty, not undefined', () => {
    const l = placeToListing({ names: { primary: 'X' } }, { countryCode: null });
    assert.equal(l.phone, null);
    assert.deepEqual(l.phones, []);
    assert.equal(l.email, null);
    assert.equal(l.website, null);
    assert.equal(l.address, null);
    assert.equal(l.latitude, null);
    assert.deepEqual(l.socialLinks, {});
});

test('chains are places with a brand', () => {
    assert.equal(isChain({ brand: { wikidata: 'Q4807808', names: { primary: 'Aspen Dental' } } }), true);
    assert.equal(isChain({ brand: null }), false);
});

test('normalizeWebsite adds https and rejects things that are not web addresses', () => {
    assert.equal(normalizeWebsite('example.com/about'), 'https://example.com/about');
    assert.equal(normalizeWebsite('not a site'), null);
    assert.equal(normalizeWebsite('mailto:a@b.com'), null);
    assert.equal(normalizeWebsite('https://user:pw@example.com'), null);
});

test('a type matches on basic category, primary category or any level of the hierarchy', () => {
    const dentist = categoryMatcher('dentist');
    assert.equal(dentist(place), true);
    assert.equal(dentist({ basic_category: 'restaurant', taxonomy: { primary: 'pizza_restaurant', hierarchy: ['food', 'restaurant', 'pizza_restaurant'] } }), false);
    assert.equal(categoryMatcher('restaurant')({ basic_category: 'restaurant', taxonomy: { primary: 'pizza_restaurant' } }), true);
    assert.equal(categoryMatcher('hair')({ basic_category: 'personal_or_beauty_service', taxonomy: { primary: 'barber' } }), true);
    assert.equal(Object.keys(CATEGORIES).length, 32);
    assert.equal(categoryLabel('hvac_service'), 'Hvac service');
});

test('row group boxes come from bbox statistics, and overlap is checked on both axes', () => {
    const stat = (path, min, max) => ({ meta_data: { path_in_schema: path.split('.'), statistics: { min_value: min, max_value: max } } });
    const rg = { columns: [stat('bbox.xmin', -98, -97.5), stat('bbox.xmax', -97.9, -97.4), stat('bbox.ymin', 30, 30.4), stat('bbox.ymax', 30.1, 30.5)] };
    assert.deepEqual(rowGroupBox(rg), { xmin: -98, xmax: -97.4, ymin: 30, ymax: 30.5 });
    assert.equal(rowGroupBox({ columns: [] }), null);
    const austin = { xmin: -97.94, xmax: -97.56, ymin: 30.1, ymax: 30.52 };
    assert.equal(boxesOverlap(rowGroupBox(rg), austin), true);
    assert.equal(boxesOverlap({ xmin: 0, xmax: 1, ymin: 30, ymax: 31 }, austin), false);
});

test('bbox size in km', () => {
    const { widthKm, heightKm } = bboxSizeKm({ xmin: -97.94, xmax: -97.56, ymin: 30.1, ymax: 30.52 });
    assert.ok(widthKm > 35 && widthKm < 38, `width ${widthKm}`);
    assert.ok(heightKm > 45 && heightKm < 48, `height ${heightKm}`);
});

test('row numbers are grouped into short runs for detail reads', async () => {
    const { rowRuns } = await import('../src/overture.js');
    assert.deepEqual(rowRuns([3, 10, 60, 500, 530, 9000]), [{ start: 3, end: 60 }, { start: 500, end: 530 }, { start: 9000, end: 9000 }]);
    assert.deepEqual(rowRuns([]), []);
});
