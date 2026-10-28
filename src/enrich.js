// Contact details from a business's own website, when enrichFromWebsite is on:
//   1. robots.txt: if it disallows us, nothing else is fetched.
//   2. The homepage: emails, phone numbers, a WhatsApp link and social profiles.
//   3. The contact page, if the homepage links to one and robots.txt allows it.
// Only what the business published is kept. A named person's own mailbox is left out on purpose (see contacts.js),
// and sites behind bot protection are reported as "blocked", never worked around.
import * as cheerio from 'cheerio';
import { HTTP } from './config.js';
import { getPage } from './http.js';
import { parseRobots, isAllowed } from './robots.js';
import { visibleText, pageUrls, socialLinks, contactPageUrl } from './page.js';
import { extractEmails, pickBusinessEmail, pagePhones, whatsappNumber } from './contacts.js';

// A "website" that is really a profile on a social or listing site: nothing of the business's own to read.
const PROFILE_HOSTS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|yelp\.[a-z.]+|tripadvisor\.[a-z.]+|google\.[a-z.]+|goo\.gl|linktr\.ee|wa\.me|whatsapp\.com)$/i;

const robotsCache = new Map();

/** robots.txt rules for a host, or why the site couldn't be read at all. Cached per host. */
function robotsFor(host) {
    if (!robotsCache.has(host)) {
        robotsCache.set(host, (async () => {
            const file = await getPage(`https://${host}/robots.txt`, { timeoutMs: HTTP.robotsTimeoutMs, retryTimeoutMs: HTTP.robotsTimeoutMs, maxAttempts: 2, accept: 'text/plain,*/*;q=0.5' });
            if (file.category === 'blocked') return { blocked: true };
            if (file.category === 'network_error' && /ENOTFOUND|EAI_AGAIN/.test(file.errorCode ?? '')) return { unreachable: "domain doesn't resolve" };
            const rules = file.ok && !/<html/i.test(String(file.body ?? '').slice(0, 500)) ? parseRobots(file.body, HTTP.robotsAgent) : [];
            return { rules };
        })());
    }
    return robotsCache.get(host);
}

function describeFailure(page) {
    if (page.category === 'blocked') return 'site blocks automated checks (bot protection)';
    if (page.category === 'network_error') {
        if (/TIMEOUT/.test(page.errorCode ?? '')) return 'site not responding (timed out)';
        if (/CERT|SSL|TLS/i.test(page.errorCode ?? '')) return `site has a certificate problem (${page.errorCode})`;
        return /^[A-Z_]+$/.test(page.errorCode ?? '') ? `site unreachable (${page.errorCode})` : 'site unreachable';
    }
    return `site answered HTTP ${page.status}`;
}

const empty = (websiteStatus, websiteNote = null) => ({ websiteStatus, websiteNote, email: null, phones: [], whatsapp: null, socialLinks: {} });

/**
 * @param {{ name: string, website: string|null, countryCode: string|null }} listing
 * @returns {Promise<{ websiteStatus: string, websiteNote: string|null, email: string|null, phones: string[], whatsapp: string|null, socialLinks: object }>}
 *   websiteStatus: ok | no_website | profile_page | robots_disallowed | blocked | unreachable
 */
export async function enrichFromWebsite(listing) {
    if (!listing.website) return empty('no_website');
    const target = new URL(listing.website);
    if (PROFILE_HOSTS.test(target.hostname)) return empty('profile_page', 'the website listed is a social or listing profile, not a site of its own');

    const robots = await robotsFor(target.host);
    if (robots.blocked) return empty('blocked', 'site blocks automated checks (bot protection)');
    if (robots.unreachable) return empty('unreachable', robots.unreachable);
    if (!isAllowed(robots.rules, target.pathname)) return empty('robots_disallowed', "the site's robots.txt asks tools like this not to read it");

    const page = await getPage(target.href);
    if (!page.ok) return empty(page.category === 'blocked' ? 'blocked' : 'unreachable', describeFailure(page));

    const $ = cheerio.load(page.body);
    let text = visibleText($);
    let urls = pageUrls($, page.finalUrl);
    const mailtos = $('a[href^="mailto:" i]').map((_, el) => $(el).attr('href')).get();
    const tels = $('a[href^="tel:" i]').map((_, el) => $(el).attr('href')).get();

    const contactUrl = contactPageUrl($, page.finalUrl);
    if (contactUrl && isAllowed(robots.rules, new URL(contactUrl).pathname)) {
        const contactPage = await getPage(contactUrl);
        if (contactPage.ok) {
            const $c = cheerio.load(contactPage.body);
            text = `${text} ${visibleText($c)}`;
            urls = [...urls, ...pageUrls($c, contactPage.finalUrl)];
            mailtos.push(...$c('a[href^="mailto:" i]').map((_, el) => $c(el).attr('href')).get());
            tels.push(...$c('a[href^="tel:" i]').map((_, el) => $c(el).attr('href')).get());
        }
    }

    return {
        websiteStatus: 'ok',
        websiteNote: null,
        email: pickBusinessEmail(extractEmails(text, mailtos), { name: listing.name, siteUrl: page.finalUrl }),
        phones: pagePhones(tels, text, listing.countryCode).slice(0, 3),
        whatsapp: whatsappNumber(urls),
        socialLinks: socialLinks(urls),
    };
}
