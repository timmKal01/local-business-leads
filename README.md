# Local Business Leads: Phones, Emails & Websites by City

Pick a type of business and a place anywhere in the world. You get one row per business with its name, address, phone, website and opening hours, plus the business email, phone numbers, WhatsApp and social profiles its own website lists. No Google account, no API key, no proxy.

**Who it's for:** agencies and freelancers building a prospect list, sales teams covering a new city, and anyone who needs a list of dentists, plumbers, cafes or salons in a place, with a way to reach each one.

## Example output

<!-- EXAMPLE: replace with a real row from the first test run before publishing -->

## What you get in each row

| Field | What it is |
|---|---|
| `name`, `category` | The business and its type (e.g. "Dentist", "Barber shop") |
| `phone`, `phoneSource` | The best phone number, in international format, and where it came from: `openstreetmap` or `website` |
| `email`, `emailSource` | A business email, from the listing or the business's own website |
| `website` | The business's own site |
| `address`, `street`, `postcode`, `city`, `countryCode` | Where it is |
| `openingHours` | As listed, e.g. `Mo-Fr 08:00-17:00` |
| `whatsapp`, `socialLinks` | A WhatsApp number and Facebook, Instagram, LinkedIn, X, TikTok or YouTube profiles |
| `websitePhones` | Every phone number the website lists (up to 3) |
| `websiteStatus`, `websiteNote` | Whether the website was read: `ok`, `no_website`, `profile_page`, `robots_disallowed`, `blocked`, `unreachable`, or `not_checked` when website contacts are off |
| `latitude`, `longitude`, `osmUrl`, `placeId` | The map location and the listing on openstreetmap.org |
| `isChain`, `brand` | Branch of a chain or franchise (left out unless `includeChains` is on) |
| `rowType` | `"business"` for every business. A run that saves no businesses returns one uncharged `"note"` row saying why, and input that can't be searched returns one uncharged `"error"` row. |

## Input

```json
{
    "searchCategory": "dentist",
    "searchLocation": "Austin, TX",
    "maxResults": 20,
    "enrichFromWebsite": true,
    "requireContact": true
}
```

- `searchCategory`: one of 32 types, from plumbers and electricians to dentists, salons, restaurants, lawyers and hotels.
- `searchLocation`: a city, town or neighbourhood, in any country. Adding the country helps ("Manchester, UK").
- `maxResults`: stop after this many businesses (up to 2,000).
- `enrichFromWebsite`: read each business's own website for contact details.
- `requireContact`: only keep businesses with a phone, email or WhatsApp. Skipped businesses aren't charged.
- `onlyWithWebsite`, `includeChains`: narrow or widen the list.

An empty input runs the example above (dentists in Austin, TX), and every row's `search.usedExample` says so.

## Pricing

You pay per result, with no subscription:

| Event | Price |
|---|---|
| Business lead (one saved business) | $0.002 |
| Contacts from website (the business's site listed an email, phone or WhatsApp the listing didn't have) | $0.003 |

1,000 leads cost $2, or up to $5 with website contacts. Notes, errors, and businesses left out by your filters are free.

## How it works

1. **The place** is found with OpenStreetMap's place search (Nominatim).
2. **The businesses** come from OpenStreetMap through the Overpass API. If one public server is busy, the next one is tried.
3. **Website contacts** (when on): the business's homepage and contact page, only where the site's `robots.txt` allows it, one request a second per site. Sites behind bot protection are reported as `blocked` and skipped, never worked around.

Requests identify this tool by name. Nothing needs a login, and no proxy is used.

## Good to know

- **Coverage depends on the map.** OpenStreetMap is edited by volunteers, so some cities list far more businesses, phones and websites than others. A missing phone or website often means nobody added it, not that the business has none. Turn on `requireContact` to only pay for businesses you can reach.
- **No reviews or ratings.** OpenStreetMap doesn't have them.
- **Only business contacts.** Emails that look like a named person's own mailbox are left out on purpose.
- **The map servers are free public services** run by volunteers and are sometimes at capacity. When none answer, the run saves one note saying so and charges nothing, so you can simply run it again.

## Data and license

Business data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). Each row carries this attribution and a link to its listing. If you publish the data, credit OpenStreetMap the same way.

## Related tools

- [Website Gap Finder](https://apify.com/m_ctim/website-gap-finder): audit local businesses' websites and score them as web design leads.
- [Website Email & Phone Extractor](https://apify.com/m_ctim/website-lead-extractor): contact details from a list of websites you already have.
- [Website Tech Stack Detector](https://apify.com/m_ctim/website-tech-stack-detector): what each business's site is built on.

Questions or a business type you need? Open an issue on the Issues tab.
