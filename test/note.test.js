import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyRunReason, noteRow, errorRow, NOTE_NAME } from '../src/note.js';

const search = { categoryTitle: 'Dentists', place: 'Austin, Travis County, Texas, United States', includeChains: false, onlyWithWebsite: false, requireContact: false };
const zero = { inBox: 0, ofType: 0, closed: 0, lowConfidence: 0, chains: 0, filteredOut: 0 };

test('no businesses of the type says so and suggests what to try', () => {
    const reason = emptyRunReason({ ...zero, inBox: 812 }, search);
    assert.match(reason, /No dentists found in Austin/);
    assert.match(reason, /812 places of other kinds/);
    assert.match(reason, /nearby bigger city/);
});

test('closed, uncertain, chain and filtered businesses are named as the reasons', () => {
    const reason = emptyRunReason({ ...zero, inBox: 50, ofType: 9, closed: 1, lowConfidence: 2, chains: 3, filteredOut: 3 }, { ...search, requireContact: true });
    assert.match(reason, /9 dentists found/);
    assert.match(reason, /1 is marked closed/);
    assert.match(reason, /2 have too little evidence/);
    assert.match(reason, /3 are chains \(turn on includeChains/);
    assert.match(reason, /3 didn't pass requireContact/);
});

test('note and error rows carry a rowType and the search', () => {
    const s = { category: 'dentist', location: 'Austin, TX', place: null, usedExample: true };
    const note = noteRow('why', s, { inBox: 0 });
    assert.equal(note.rowType, 'note');
    assert.equal(note.name, NOTE_NAME);
    assert.equal(note.note, 'why');
    assert.deepEqual(note.search, s);
    assert.equal(note.inBox, 0);
    const err = errorRow('bad', s);
    assert.equal(err.rowType, 'error');
    assert.equal(err.error, 'bad');
});
