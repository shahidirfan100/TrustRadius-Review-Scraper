# TrustRadius Review Scraper

Extract verified B2B software reviews from TrustRadius product pages with pagination support. Collect detailed user reviews including ratings, pros and cons, reviewer information, and structured product data for market research and competitive analysis.

## Features

- **Product Data Extraction** - Pull structured product information including total review count and product slug
- **Full Review Collection** - Extract review text, use cases, pros, cons, recommendation notes, ratings, and publication dates
- **Rich Reviewer Firmographics** - Capture reviewer name, country, job title, department, company industry, company size, and years of experience for B2B analysis
- **Reliable Collection** - Uses fast HTTP requests with mobile-style headers and fallback profiles
- **Reviewer Insights** - Capture author names, dates, experience, and detailed feedback for each review

## Use Cases

### Competitive Intelligence
Track how competing products are rated on TrustRadius. Compare review sentiment, common pros and cons, and overall satisfaction scores across similar software categories.

### Market Research
Build comprehensive datasets of user feedback for specific software categories. Analyze trends in user satisfaction, feature requests, and common complaints to identify market opportunities.

### Content Analysis
Study authentic user feedback to understand what users value most in different software categories. Extract common themes, use cases, and deployment scenarios from detailed B2B reviews.

### Sales Intelligence
Equip sales teams with real user feedback data. Understand competitor weaknesses and strengths through authentic review content to refine positioning and messaging.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | Yes | - | Full TrustRadius product or reviews URL (e.g. `https://www.trustradius.com/products/slack/reviews/all`) |
| `results_wanted` | Integer | No | `20` | Maximum number of reviews to collect |
| `proxyConfiguration` | Object | No | Disabled | Optional proxy fallback for reliable scraping |

---

## Output Data

Each item in the dataset contains a `recordType` field distinguishing between product information and individual reviews.

### Product Record

| Field | Type | Description |
|-------|------|-------------|
| `recordType` | String | Always `"product"` |
| `productName` | String | Name of the software product |
| `productSlug` | String | Product identifier from URL |
| `reviewCount` | Integer | Total number of reviews available for the product |
| `url` | String | Product page URL |

### Review Record

| Field | Type | Description |
|-------|------|-------------|
| `recordType` | String | Always `"review"` |
| `productSlug` | String | Product identifier |
| `reviewSlug` | String | Unique review slug |
| `title` | String | Review title |
| `rating` | String | Review rating on a 1-10 scale |
| `ratingNormalized` | Integer | Normalized rating value (0-10) |
| `publishedDateText` | String | Human-readable publication date |
| `trusted` | Boolean | Trust badge value |
| `incentive` | String | Incentive disclosure |
| `reviewSource` | String | Review source classification |
| `author` | String | Reviewer full name |
| `authorFirst` | String | Reviewer first name |
| `authorLast` | String | Reviewer last name |
| `reviewerJobTitle` | String | Reviewer position title |
| `reviewerJobType` | String | Reviewer job type |
| `reviewerDepartment` | String | Reviewer department |
| `companyName` | String | Reviewer company name |
| `companyIndustry` | String | Reviewer company industry |
| `companySize` | String | Reviewer company size |
| `yearsExperience` | Integer | Years of experience using the product |
| `isVerified` | Boolean | Whether reviewer verification is present |
| `verifiedBy` | String | Verification source |
| `useCases` | String | Full use case and deployment scope text |
| `pros` | Array | Pros listed by the reviewer |
| `cons` | Array | Cons listed by the reviewer |
| `likelihoodToRecommend` | String | Full recommendation text |
| `publishedDate` | String | Review publication date (ISO) |
| `url` | String | Direct review URL |

---

## Usage Examples

### Basic Review Extraction

Extract reviews from any TrustRadius product page:

```json
{
  "startUrl": "https://www.trustradius.com/products/slack/reviews/all",
  "results_wanted": 50
}
```

### Using a Different Product

```json
{
  "startUrl": "https://www.trustradius.com/products/asana/reviews/all",
  "results_wanted": 100
}
```

### With Proxy Configuration

```json
{
  "startUrl": "https://www.trustradius.com/products/miro/reviews",
  "results_wanted": 30,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

---

## Sample Output

```json
{
  "recordType": "review",
  "productSlug": "apify",
  "reviewSlug": "apify-2026-05-25-10-50-41",
  "title": "highly recommended for web scraping",
  "rating": "10/10",
  "ratingNormalized": 10,
  "publishedDate": "2026-05-29T17:01:22.186Z",
  "publishedDateText": "May 29, 2026",
  "trusted": false,
  "incentive": "No",
  "reviewSource": "VendorSourced",
  "author": "Matthias Werner",
  "authorFirst": "Matthias",
  "authorLast": "Werner",
  "reviewerJobTitle": "CRM Specialist",
  "reviewerJobType": "Engineer",
  "reviewerDepartment": "Other",
  "companySize": "1-10 employees",
  "yearsExperience": 1,
  "useCases": "Web scraping of social data for a data product. It makes it easy to scrape data without the need of cumbersome and extensive maintenance.",
  "pros": ["Scraping data from YouTube", "Scraping data from Facebook", "Scraping data from Tiktok"],
  "cons": ["Pricing could be a bit more intuitive or pure pay-as-you-go"],
  "likelihoodToRecommend": "I think Apify is very well suited for standardized data scraping or data extraction use cases.",
  "url": "https://www.trustradius.com/reviews/apify-2026-05-25-10-50-41",
  "source": "html-flight"
}
```

---

## Tips for Best Results

### Choose Valid Product URLs
- Use direct product review URLs like `https://www.trustradius.com/products/{slug}/reviews/all`
- Verify the product page exists and has reviews before running at scale
- Product slugs are typically the URL-friendly version of the product name

### Optimize Collection Size
- Start with small test runs of 10-20 reviews to verify extraction quality
- Increase `results_wanted` for production data collection
- Increase `results_wanted` to collect additional review pages

### Proxy Configuration
- Use Apify Residential proxies for reliable access to TrustRadius
- Higher concurrency may require more proxy rotation
- Default proxy configuration uses datacenter proxies for cost efficiency

---

## Integrations

Connect your data with:

- **Google Sheets** - Export review data for collaborative analysis
- **Airtable** - Build searchable review databases
- **Slack** - Get notifications when new review data is collected
- **Make** - Create automated workflows with review data
- **Zapier** - Trigger actions based on collection results

### Export Formats

- **JSON** - For developers and API integration
- **CSV** - For spreadsheet analysis and reporting
- **Excel** - For business reporting and presentations
- **XML** - For system integrations

---

## Frequently Asked Questions

### How many reviews can I collect?
You can collect all available reviews for any product by increasing `results_wanted`.

### Can I scrape multiple products?
Yes, provide each product URL in separate runs or configure multiple runs through Apify schedules. Each run processes one product URL at a time.

### Why use TrustRadius review data?
TrustRadius hosts in-depth B2B software reviews (400+ words) with rich reviewer firmographics including company size, industry, job title, and years of experience.

### What data fields are extracted?
The actor extracts product information and review details including title, use cases, pros, cons, recommendation text, rating, author, company details, and date.

### Does this actor require a browser?
No. The actor uses HTTP requests and parses TrustRadius's structured page payload, so it stays fast and lightweight. A proxy is optional and only used when you provide one.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/schedules)

---

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring compliance with TrustRadius terms of service and applicable laws. Use data responsibly and respect rate limits.
