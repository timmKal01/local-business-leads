// Rows that aren't businesses. A run never ends with an empty dataset: it says why nothing was saved, in one row that
// is never charged, so a person, script or AI agent can tell "nothing matched" from "something broke".

export const NOTE_NAME = 'No businesses saved in this run (not charged)';

/**
 * Why a search saved nothing.
 * @param {{ inBox: number, ofType: number, closed: number, lowConfidence: number, chains: number, filteredOut: number }} counts
 * @param {{ categoryTitle: string, place: string, includeChains: boolean, onlyWithWebsite: boolean, requireContact: boolean }} search
 */
export function emptyRunReason(counts, search) {
    const what = search.categoryTitle.toLowerCase();
    if (counts.ofType === 0 && search.source === 'google_maps') {
        return `Google Maps listed no ${what} in ${search.place}${counts.outside ? ` (${counts.outside} found were outside the area)` : ''}. Try a nearby bigger city or another type of business.`;
    }
    if (counts.ofType === 0) {
        return `No ${what} found in ${search.place} (${counts.inBox} places of other kinds are listed there). Try a nearby bigger city or another type of business.`;
    }
    const parts = [];
    if (counts.closed) parts.push(`${counts.closed} ${counts.closed === 1 ? 'is' : 'are'} marked closed`);
    if (counts.lowConfidence) parts.push(`${counts.lowConfidence} ${counts.lowConfidence === 1 ? 'has' : 'have'} too little evidence it still exists`);
    if (counts.chains && !search.includeChains) parts.push(`${counts.chains} ${counts.chains === 1 ? 'is a chain' : 'are chains'} (turn on includeChains to keep them)`);
    if (counts.filteredOut) {
        const filters = [search.onlyWithWebsite && 'onlyWithWebsite', search.requireContact && 'requireContact'].filter(Boolean).join(' and ');
        parts.push(`${counts.filteredOut} didn't pass ${filters || 'the filters'}`);
    }
    return `${counts.ofType} ${what} found in ${search.place}, but none were saved: ${parts.join(', ') || 'none matched'}.`;
}

/** The one row a run saves when it has no businesses to return. */
export function noteRow(note, search, extra = {}) {
    return { rowType: 'note', name: NOTE_NAME, note, search, ...extra, scrapedAt: new Date().toISOString() };
}

/** The row for input that can't be searched (not charged). */
export function errorRow(error, search) {
    return { rowType: 'error', name: "Couldn't run the search (not charged)", error, search, scrapedAt: new Date().toISOString() };
}
