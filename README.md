# Google Maps Leads: Local Businesses with Phones & Emails

Pick a type of business and a place anywhere in the world. You get one row per business from Google Maps, with its name, address, phone, website, rating, review count and opening hours. Turn on website contacts and each business's own site is read for an email, more phones, WhatsApp and social profiles. No Google account or API key needed.

**Who it's for:** agencies and freelancers building a prospect list, sales teams opening a new city, and anyone who needs the dentists, plumbers, cafes or salons in a place with a way to reach each one.

## Example output

A real row from a search for dentists in Austin, TX on 2026-11-01, with website contacts on. All 20 businesses came back with a phone, a website and a rating, and 9 with an email.

```json
{
    "rowType": "business",
    "name": "Swish Dental Downtown",
    "category": "Dentist",
    "categories": [
        "Dentist",
        "Cosmetic dentist",
        "Dental clinic",
        "Dental hygienist",
        "Dental implants provider",
        "Denture care center",
        "Emergency dental service",
        "Oral surgeon",
        "Orthodontist",
        "Teeth whitening service"
    ],
    "phone": "+15127131099",
    "phones": [
        "+15127131099",
        "+15126476045"
    ],
    "email": "downtown@swishsmiles.com",
    "emailSource": "website",
    "website": "https://www.swishsmiles.com/location/downtown",
    "address": "201 W 5th St Ste 175, Austin, TX 78701",
    "street": "201 W 5th St Ste 175",
    "city": "Austin",
    "region": "TX",
    "postcode": "78701",
    "countryCode": "US",
    "rating": 4.5,
    "reviewCount": 987,
    "hours": [
        "Saturday: Closed",
        "Sunday: Closed",
        "Monday: 9 AM–6 PM",
        "Tuesday: 8 AM–5:30 PM",
        "Wednesday: 8 AM–5:30 PM",
        "Thursday: 8 AM–5:30 PM",
        "Friday: 8 AM–5:30 PM"
    ],
    "whatsapp": null,
    "socialLinks": {
        "facebook": "https://www.facebook.com/SwishDentalTX",
        "instagram": "https://www.instagram.com/swishdental",
        "tiktok": "https://www.tiktok.com/@swishdental"
    },
    "websiteStatus": "ok",
    "latitude": 30.2674035,
    "longitude": -97.7451433,
    "operatingStatus": "open",
    "googleMapsUrl": "https://www.google.com/maps?cid=12405761024353107434",
    "googlePlaceId": "ChIJdWgENLS1RIYReos4IrRuTmQ",
    "dataSource": "google_maps"
}
```

`rowType` is `"business"` for every business. A run that saves no businesses returns one uncharged `"note"` row saying why, and input that can't be searched returns one uncharged `"error"` row.

## What you get in each row

| Field | What it is |
|---|---|
| `name`, `category`, `categories` | The business and its types, e.g. "Dentist" |
| `phone`, `phones` | The main phone number in international format, and every number found |
| `email`, `emailSource` | A business email, and whether it came from the `listing` or the business's own `website` |
| `website`, `socialLinks` | The business's site, and its Facebook, Instagram, LinkedIn, X, TikTok or YouTube profiles |
| `address`, `street`, `city`, `region`, `postcode`, `countryCode` | Where it is |
| `rating`, `reviewCount`, `hours` | The Google rating, how many reviews it has, and its opening hours (Google Maps rows) |
| `googleMapsUrl`, `googlePlaceId` | A link to the listing on Google Maps, and its Google place ID |
| `whatsapp` | A WhatsApp number, when the website links one |
| `websiteStatus`, `websiteNote` | Whether the website was read: `ok`, `no_website`, `profile_page`, `robots_disallowed`, `blocked`, `unreachable`, or `not_checked` when website contacts are off |
| `latitude`, `longitude`, `operatingStatus` | The location, and whether it's open |
| `dataSource` | `google_maps` or `overture` |
| `confidence`, `isChain`, `brand`, `overtureId` | Overture Maps rows only: how sure the data is that the business exists, chain detection and the Overture ID |
| `attribution` | Where the row's data came from |

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
- `dataSource`: `google_maps` (the default) or `overture` (Overture Maps open data, with more listing emails, a confidence score and chain detection, but no ratings or hours).
- `maxResults`: stop after this many businesses (up to 2,000). Google Maps lists its most prominent businesses first.
- `enrichFromWebsite`: also read each business's own website for an email, phones, WhatsApp and social profiles.
- `requireContact`: only keep businesses with a phone, email or WhatsApp. Skipped businesses aren't charged.
- `onlyWithWebsite`, `includeChains`: narrow or widen the list.

An empty input runs the example above (dentists in Austin, TX), and every row's `search.usedExample` says so.

## Pricing

**$0.02 per business lead** ($20 per 1,000), with website contacts included. Notes, errors, and businesses left out by your filters or by closed, uncertain and chain checks are free.

## How it works

1. **The place** is turned into an area with OpenStreetMap's place search (Nominatim), or Photon if that doesn't answer.
2. **The businesses** come from Google Maps: the same results list the Maps page shows for that search, read through Apify's residential proxy. If Google Maps doesn't answer, the run uses [Overture Maps](https://overturemaps.org) open data instead, and says so. Overture is also there as an option (`dataSource`), read straight from Overture's public files for your area. Businesses marked closed are left out either way.
3. **Website contacts** (when on): the business's homepage and contact page, only where the site's `robots.txt` allows it, one request a second per site. Sites behind bot protection are reported as `blocked` and skipped, never worked around. These requests identify this tool by name.

Nothing needs a login.

## Good to know

- **Coverage varies by place.** In tests on 2026-11-01 with website contacts on, a phone came back for 100% of Austin dentists, 100% of 50 Chicago plumbers and 95% of hair salons in Westlands, Nairobi. Websites: 100%, 72% and 50%. Emails, which come from the businesses' own sites: 45%, 20% and 10%.
- **More emails:** Overture Maps listings often carry an email themselves. If emails matter more than ratings, try `dataSource: "overture"`.
- **Chains:** Google Maps listings don't say whether a business is a chain branch, so `includeChains` only applies to Overture Maps.
- **Only business contacts.** Emails found on a website that look like a named person's own mailbox are left out on purpose.

## Data and license

Google Maps rows: business details as listed on Google Maps, with a link to each listing. Overture Maps rows: data from the Overture Maps Foundation (overturemaps.org), from sources under CDLA Permissive 2.0 (Meta, Microsoft and others), Apache 2.0 (Foursquare) and CC0 (AllThePlaces). Each row's `attribution` names its source. Place search © OpenStreetMap contributors.

## Related tools

- [Website Gap Finder](https://apify.com/m_ctim/website-gap-finder): audit local businesses' websites and score them as web design leads.
- [Website Email & Phone Extractor](https://apify.com/m_ctim/website-lead-extractor): contact details from a list of websites you already have.
- [Website Tech Stack Detector](https://apify.com/m_ctim/website-tech-stack-detector): what each business's site is built on.

Questions, or a business type you need? Open an issue on the Issues tab.
