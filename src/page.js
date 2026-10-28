// Pure helpers on one fetched page (a cheerio `$`): visible text, every URL on it, social profile links and the
// contact page link. Copied from website-gap-finder's audit/checks.js; evolve independently.

/** Visible text: scripts, styles and templates removed, whitespace collapsed. */
export function visibleText($) {
    const $$ = $.root().clone();
    $$.find('script, style, noscript, template, svg').remove();
    return $$.find('body').find('*').addBack().contents()
        .filter((_, n) => n.type === 'text').map((_, n) => $(n).text()).get()
        .join(' ').replace(/\s+/g, ' ').trim();
}

/** Absolute URLs of links, scripts, iframes and forms on the page, plus URLs written in inline code. */
export function pageUrls($, base) {
    const out = new Set();
    const add = (raw) => {
        if (!raw || /^(mailto|tel|javascript|data):/i.test(raw)) return;
        try {
            out.add(new URL(raw, base).href);
        } catch { /* not a URL */ }
    };
    $('a[href], link[href]').each((_, el) => add($(el).attr('href')));
    $('script[src], iframe[src], img[src]').each((_, el) => add($(el).attr('src')));
    $('form[action]').each((_, el) => add($(el).attr('action')));
    $('script:not([src])').each((_, el) => {
        for (const m of ($(el).html() ?? '').matchAll(/https?:\/\/[^\s"'<>)\\]+/g)) add(m[0]);
    });
    return [...out];
}

const SOCIALS = {
    facebook: /^https?:\/\/([a-z]{2,3}\.|www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|tr\?|login|profile\.php\?id=0)[^?#]+/i,
    instagram: /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)[A-Za-z0-9_.]+\/?(?:[?#].*)?$/i,
    tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+/i,
    x: /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent|share|home|search|hashtag|i\/)[A-Za-z0-9_]{1,15}\/?(?:[?#].*)?$/i,
    linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|school)\/[^/?#]+/i,
    youtube: /^https?:\/\/(www\.)?youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)/i,
    pinterest: /^https?:\/\/([a-z]{2,3}\.|www\.)?pinterest\.[a-z.]+\/(?!pin\/)[\w-]+\/?$/i,
};

/** First profile link per network. Share buttons, posts and intent links are ignored. */
export function socialLinks(urls) {
    const out = {};
    for (const url of urls) {
        for (const [network, re] of Object.entries(SOCIALS)) {
            if (!out[network] && re.test(url)) out[network] = url.replace(/[?#].*$/, '').replace(/\/$/, '');
        }
    }
    return out;
}

const CONTACT_LABEL_RE = /^(contact( us)?|contacts|get in touch|reach us|find us|kontakt(ieren)?|contacto|contáctanos|contactenos|contato|fale conosco|contatti|contattaci|nous contacter|contactez[- ]nous|iletişim|wasiliana nasi|kontak( kami)?)$/i;
const CONTACT_PATH_RE = /\/(contact(o|s|ez|-us|us|anos|-nous)?|kontakt|contatti|contato|iletisim|wasiliana[-\w]*)\/?$/i;

/** The site's own contact page, if the homepage links to one. */
export function contactPageUrl($, base) {
    const baseHost = new URL(base).hostname.replace(/^www\./, '');
    let hit = null;
    $('a[href]').each((_, el) => {
        if (hit) return;
        const label = $(el).text().replace(/\s+/g, ' ').trim();
        let u;
        try {
            u = new URL($(el).attr('href'), base);
        } catch {
            return;
        }
        if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== baseHost || u.pathname === '/') return;
        if (CONTACT_PATH_RE.test(u.pathname) || (label.length <= 30 && CONTACT_LABEL_RE.test(label))) {
            u.hash = '';
            hit = u.href;
        }
    });
    return hit;
}
