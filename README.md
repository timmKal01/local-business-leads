# Local Business Leads: Phones, Emails & Websites by City

Pick a type of business and a place anywhere in the world. You get one row per business with its name, address, phone, email, website and social profiles. Turn on website contacts and each business's own site is read for more. No Google account, no API key, no proxy.

**Who it's for:** agencies and freelancers building a prospect list, sales teams opening a new city, and anyone who needs the dentists, plumbers, cafes or salons in a place with a way to reach each one.

## Example output

A real row from a search for dentists in Austin, TX (2026-10-28). The 20 businesses that run returned all had a phone and an address. 19 had an email, a website and social profiles.

```json
{
    "rowType": "business",
    "name": "Balcones Family Dental",
    "category": "General dentistry",
    "phone": "+15125408738",
    "phones": ["+15125408738", "+15123319088"],
    "email": "info@balconesfamilydental.com",
    "emailSource": "listing",
    "website": "https://balconesfamilydental.com/",
    "address": "9000 Anderson Mill Rd, Austin, TX, 78729",
    "street": "9000 Anderson Mill Rd",
    "city": "Austin",
    "region": "TX",
    "postcode": "78729",
    "countryCode": "US",
    "whatsapp": null,
    "socialLinks": {
        "facebook": "https://www.facebook.com/135504283176325",
        "instagram": "https://www.instagram.com/balcones_family_dental"
    },
    "websiteStatus": "ok",
    "websiteNote": null,
    "latitude": 30.453369140625,
    "longitude": -97.7769775390625,
    "isChain": false,
    "brand": null,
    "operatingStatus": "open",
    "confidence": 1,
    "overtureId": "45ac34d4-57d0-47c0-88f1-29ceb35c6d45",
    "search": { "category": "dentist", "location": "Austin, TX", "place": "Austin, Travis County, Texas, United States", "usedExample": false },
    "attribution": "Overture Maps Foundation (overturemaps.org), data from meta, Overture, Overture-signals. CDLA Permissive 2.0, Apache 2.0 (Foursquare) or CC0."
}
```

`rowType` is `"business"` for every business. A run that saves no businesses returns one uncharged `"note"` row saying why, and input that can't be searched returns one uncharged `"error"` row.

## What you get in each row

| Field | What it is |
|---|---|
| `name`, `category` | The business and its type, e.g. "General dentistry" or "Barber" |
| `phone`, `phones` | The main phone number in international format, and every number found |
| `email`, `emailSource` | A business email, and whether it came from the `listing` or the business's own `website` |
| `website`, `socialLinks` | The business's site, and its Facebook, Instagram, LinkedIn, X, TikTok or YouTube profiles |
| `address`, `street`, `city`, `region`, `postcode`, `countryCode` | Where it is |
| `whatsapp` | A WhatsApp number, when the website links one |
| `websiteStatus`, `websiteNote` | Whether the website was read: `ok`, `no_website`, `profile_page`, `robots_disallowed`, `blocked`, `unreachable`, or `not_checked` when website contacts are off |
| `latitude`, `longitude` | The location |
| `confidence`, `operatingStatus` | How sure the data is that the business exists (0 to 1), and whether it's open |
| `isChain`, `brand` | Branch of a chain or franchise (left out unless `includeChains` is on) |
| `overtureId`, `attribution` | The place's ID in Overture Maps, and where its data came from |

## Input

```json
{
    "searchCategory": "dentist",
    "searchLocation": "Austin, TX",
    "maxResults": 20,
    "enrichFromWebsite": true
}
```

- `searchCategory`: one of 32 types, from plumbers, electricians and roofers to dentists, salons, restaurants, lawyers and hotels.
- `searchLocation`: a city, town or neighbourhood, in any country. Adding the country helps ("Manchester, UK"). Areas up to 150 km across work; a whole state or country doesn't.
- `maxResults`: stop after this many businesses (up to 2,000). The best-attested businesses come first.
- `enrichFromWebsite`: also read each business's own website for an email, phones, WhatsApp and social profiles.
- `requireContact`: only keep businesses with a phone, email or WhatsApp. Skipped businesses aren't charged.
- `onlyWithWebsite`, `includeChains`: narrow or widen the list.

An empty input runs the example above (dentists in Austin, TX), and every row's `search.usedExample` says so.

## Pricing

**$0.02 per business lead** ($20 per 1,000), with website contacts included. Notes, errors, and businesses left out by your filters or by closed, uncertain and chain checks are free.

## How it works

1. **The place** is turned into an area with OpenStreetMap's place search (Nominatim), or Photon if that doesn't answer.
2. **The businesses** come from [Overture Maps](https://overturemaps.org), open map data published by the Overture Maps Foundation, whose members include Amazon, Meta, Microsoft and TomTom. The data is read straight from Overture's public files, only the part that covers your area. Businesses marked closed, ones with little evidence they still exist, and chains (unless you want them) are left out.
3. **Website contacts** (when on): the business's homepage and contact page, only where the site's `robots.txt` allows it, one request a second per site. Sites behind bot protection are reported as `blocked` and skipped, never worked around.

Requests identify this tool by name. Nothing needs a login, and no proxy is used.

## Good to know

- **Coverage varies by place.** In tests on 2026-10-28, a phone number came back for 100% of Austin dentists, 95% of Manchester cafes and 95% of hair salons in Westlands, Nairobi. Emails ranged from 60% to 95%. Smaller towns have fewer listings.
- **No reviews or ratings.** The data has none.
- **Only business contacts.** Emails found on a website that look like a named person's own mailbox are left out on purpose.
- **The data updates monthly**, when Overture publishes a release. Each run uses the newest one.

## Data and license

Business data from Overture Maps Foundation (overturemaps.org), from sources available under CDLA Permissive 2.0 (Meta, Microsoft and others), Apache 2.0 (Foursquare) and CC0 (AllThePlaces). Each row's `attribution` names its sources. Place search © OpenStreetMap contributors.

## Related tools

- [Website Gap Finder](https://apify.com/m_ctim/website-gap-finder): audit local businesses' websites and score them as web design leads.
- [Website Email & Phone Extractor](https://apify.com/m_ctim/website-lead-extractor): contact details from a list of websites you already have.
- [Website Tech Stack Detector](https://apify.com/m_ctim/website-tech-stack-detector): what each business's site is built on.

Questions, or a business type you need? Open an issue on the Issues tab.
