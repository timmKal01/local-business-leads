import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyRunReason, noteRow, errorRow, NOTE_NAME } from '../src/note.js';

const search = { categoryTitle: 'Dentists', place: 'Austin, Travis County, Texas, United States', includeChains: false, onlyWithWebsite: false, requireContact: false };

test('nothing on the map says so and suggests what to try', () => {
    const reason = emptyRunReason({ found: 0, unnamed: 0, chains: 0, filteredOut: 0 }, search);
    assert.match(reason, /OpenStreetMap lists no named dentists in Austin/);
    assert.match(reason, /nearby bigger city/);
});

test('chains and filters are named as the reasons, with the setting to change', () => {
    const reason = emptyRunReason({ found: 5, unnamed: 0, chains: 2, filteredOut: 3 }, { ...search, requireContact: true });
    assert.match(reason, /lists 5 dentists/);
    assert.match(reason, /2 are chains \(turn on includeChains/);
    assert.match(reason, /3 didn't pass requireContact/);
});

test('note and error rows carry a rowType and the search', () => {
    const s = { category: 'dentist', location: 'Austin, TX', place: null, usedExample: true };
    const note = noteRow('why', s, { found: 0 });
    assert.equal(note.rowType, 'note');
    assert.equal(note.name, NOTE_NAME);
    assert.equal(note.note, 'why');
    assert.deepEqual(note.search, s);
    assert.equal(note.found, 0);
    const err = errorRow('bad', s);
    assert.equal(err.rowType, 'error');
    assert.equal(err.error, 'bad');
});
