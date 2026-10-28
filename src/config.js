// Everything worth tuning lives here: pay-per-event names and request limits.

/**
 * Events charged from code. The names must match the events in the Actor's monetization settings
 * (.actor/pay_per_event.json). Prices live on Apify, not here.
 */
export const EVENTS = {
    listing: 'business-listing', // one business row saved; contacts from its website (when on) are included
};

/** Overture's confidence that a place exists (0-1). Below this, places are left out as likely closed or duplicates. */
export const MIN_CONFIDENCE = 0.5;

/** A place wider or taller than this is refused: it would read most of a country's data. Big metros fit. */
export const MAX_AREA_KM = 150;

export const HTTP = {
    timeoutMs: 15_000,
    slowRetryTimeoutMs: 30_000, // a page that timed out gets one retry with this much time
    robotsTimeoutMs: 8_000,
    maxAttempts: 3, // for 429s, 5xx and dropped connections; timeouts get one retry, DNS/TLS/refused none
    baseDelayMs: 1000, // backoff: 1s, 2s, 4s...
    hostGapMs: 1000, // requests to the same host start at least this far apart
    maxBytes: 3_000_000,
    userAgent: 'Mozilla/5.0 (compatible; LocalBusinessLeads/0.1; +https://apify.com/m_ctim/local-business-leads)',
    robotsAgent: 'localbusinessleads', // our token for robots.txt groups
};

/** Business websites read at the same time when enrichFromWebsite is on (each host still gets one request a second). */
export const ENRICH_CONCURRENCY = 5;

/** The search used when the input names no category and no place: the form's example. */
export const EXAMPLE_SEARCH = { category: 'dentist', location: 'Austin, TX' };
