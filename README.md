## What does TrustRadius Review Scraper do?

TrustRadius Review Scraper collects public B2B software reviews from TrustRadius product pages and returns each review as a structured dataset item. Provide a TrustRadius product or reviews URL, set the maximum number of reviews, and collect ratings, review text, pros, cons, recommendation notes, publication dates, reviewer details, and company context for research and analysis.

This TrustRadius scraper is useful for product teams, market researchers, sales teams, content analysts, and data professionals who need a repeatable way to study software feedback. The results can be exported from Apify as JSON, CSV, Excel, or XML, or connected to a downstream workflow through the dataset API, webhooks, and integrations.

## Why use TrustRadius Review Scraper?

- **Competitive intelligence** - Compare software ratings, recurring strengths, common complaints, and recommendation patterns across competing products.
- **B2B market research** - Build datasets of user feedback with reviewer job titles, departments, industries, company sizes, and years of product experience.
- **Product research** - Identify the features users value, the use cases they describe, and the issues that appear repeatedly in customer feedback.
- **Sales and marketing research** - Understand how customers describe a product in their own words and use that context for positioning, enablement, and content planning.
- **Repeatable collection** - Run the same product URL on demand or schedule recurring runs to compare new and existing review data over time.
- **Workflow-ready output** - Download structured records or send them to Google Sheets, Airtable, Make, Zapier, webhooks, or your own application.

## What data can you extract from TrustRadius?

Each dataset item represents one TrustRadius review. Empty fields are omitted when the source does not provide the information.

| Field | Type | Description |
|-------|------|-------------|
| `recordType` | String | Record type, normally `review`. |
| `productName` | String | Display name of the reviewed software product. |
| `productSlug` | String | TrustRadius product identifier from the URL. |
| `reviewCount` | Integer | Total number of reviews reported for the product. |
| `reviewSlug` | String | Unique TrustRadius review identifier. |
| `title` | String | Review title or headline. |
| `rating` | String | Review rating in display format, such as `10/10`. |
| `ratingNormalized` | Integer | Numeric rating on the TrustRadius 0 to 10 scale. |
| `publishedDateText` | String | Human-readable publication date. |
| `publishedDate` | String | Review publication date in ISO format when available. |
| `trusted` | Boolean | Trust badge value when published by TrustRadius. |
| `incentive` | String | Incentive disclosure shown with the review. |
| `reviewSource` | String | Review source classification. |
| `author` | String | Reviewer full name when public. |
| `authorFirst` | String | Reviewer first name when public. |
| `authorLast` | String | Reviewer last name when public. |
| `reviewerJobTitle` | String | Reviewer position or job title. |
| `reviewerJobType` | String | Reviewer job type or role classification. |
| `reviewerDepartment` | String | Reviewer department. |
| `companyName` | String | Reviewer company name when public. |
| `companyIndustry` | String | Reviewer company industry. |
| `companySize` | String | Reviewer company size. |
| `yearsExperience` | Integer | Years of experience using the product. |
| `authorPublic` | Boolean | Whether the reviewer profile is marked public. |
| `linkedInProfileUrl` | String | LinkedIn profile URL when published in the source data. |
| `isVerified` | Boolean | Whether reviewer verification is present. |
| `verifiedBy` | String | Verification source when available. |
| `useCases` | String | Use cases and deployment scope described by the reviewer. |
| `pros` | Array or String | Positive points listed by the reviewer. |
| `cons` | Array or String | Negative points listed by the reviewer. |
| `likelihoodToRecommend` | String | Reviewer recommendation statement. |
| `url` | String | Direct URL of the TrustRadius review. |
| `source` | String | Source label for the collected record. |

## How to scrape TrustRadius reviews

1. Open TrustRadius Review Scraper in Apify Console.
2. Enter a public TrustRadius product or reviews URL, such as `https://www.trustradius.com/products/slack/reviews/all`.
3. Set `results_wanted` to the maximum number of reviews you want from each URL.
4. Optionally configure Apify Proxy settings for repeated or higher-volume runs.
5. Start the Actor and review the dataset preview.
6. Download the results or connect the dataset to your research, reporting, or automation workflow.

The Actor accepts product URLs containing a TrustRadius product slug. It also supports multiple URL inputs when you want to collect separate product datasets in one run.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No* | - | One TrustRadius product or reviews URL. |
| `startUrls` | Array | No* | `[]` | Multiple TrustRadius product URLs to process in one run. Use strings or objects containing a `url` value. |
| `url` | String | No* | - | Alternative single URL input accepted by the Actor. |
| `results_wanted` | Integer | No | `20` | Maximum number of unique reviews to save for each product URL. |
| `proxyConfiguration` | Object | No | Disabled | Optional Apify Proxy configuration for the run. |

\* Provide at least one of `startUrl`, `startUrls`, or `url`.

## Usage Examples

### Basic TrustRadius review extraction

Collect up to 50 reviews from a TrustRadius product page:

```json
{
  "startUrl": "https://www.trustradius.com/products/slack/reviews/all",
  "results_wanted": 50
}
```

### Collect reviews for multiple products

Process several TrustRadius product pages in one run. The result limit applies to each product URL:

```json
{
  "startUrls": [
    "https://www.trustradius.com/products/slack/reviews/all",
    "https://www.trustradius.com/products/asana/reviews/all",
    "https://www.trustradius.com/products/miro/reviews/all"
  ],
  "results_wanted": 100
}
```

### Use proxy settings for repeated collection

Enable Apify Proxy when collecting larger datasets or scheduling repeat runs:

```json
{
  "startUrl": "https://www.trustradius.com/products/hubspot/reviews/all",
  "results_wanted": 200,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": [
      "RESIDENTIAL"
    ]
  }
}
```

## Sample Output

The following example shows one review record. Fields can be omitted when TrustRadius does not publish them for a specific review.

```json
{
  "recordType": "review",
  "productName": "Slack",
  "productSlug": "slack",
  "reviewCount": 1450,
  "reviewSlug": "slack-2026-05-25-10-50-41",
  "title": "Effective team communication platform",
  "rating": "9/10",
  "ratingNormalized": 9,
  "publishedDateText": "May 29, 2026",
  "publishedDate": "2026-05-29T17:01:22.186Z",
  "trusted": true,
  "incentive": "No",
  "reviewSource": "CommunitySourced",
  "author": "Example Reviewer",
  "authorFirst": "Example",
  "authorLast": "Reviewer",
  "reviewerJobTitle": "Operations Manager",
  "reviewerJobType": "Manager",
  "reviewerDepartment": "Operations",
  "companyIndustry": "Software",
  "companySize": "51-200 employees",
  "yearsExperience": 3,
  "isVerified": true,
  "verifiedBy": "TrustRadius",
  "useCases": "Internal team communication, project coordination, and notifications.",
  "pros": [
    "Easy team communication",
    "Useful integrations",
    "Searchable conversation history"
  ],
  "cons": [
    "Notification settings can take time to configure"
  ],
  "likelihoodToRecommend": "I would recommend Slack to teams that need a central place for daily communication.",
  "url": "https://www.trustradius.com/reviews/slack-2026-05-25-10-50-41",
  "source": "html-flight"
}
```

## Tips for best results

- Use the complete public TrustRadius product URL, preferably the `/reviews/all` page.
- Confirm that the product page exists and contains reviews before starting a large run.
- Begin with `results_wanted: 10` or `20` to verify the product and output before increasing the limit.
- Use `startUrls` to compare a defined group of products, then keep the product URL in each record for joining and analysis.
- Review the dataset preview because some reviewer, company, or recommendation fields may be unavailable for individual reviews.
- Use scheduled runs to create periodic snapshots when monitoring product reputation or competitor feedback.

## Integrations and export formats

- **Google Sheets** - Review and compare software feedback in a shared spreadsheet.
- **Airtable** - Build a searchable review library with filters for product, rating, industry, or company size.
- **Make or Zapier** - Trigger review processing, notifications, or enrichment workflows.
- **Webhooks** - Send completed run information to another service.
- **API** - Read dataset records from your own application.

Apify supports common dataset exports including JSON, CSV, Excel, XML, and other formats available in the Console.

## Frequently Asked Questions

### Can I collect reviews for more than one software product?

Yes. Use `startUrls` with multiple TrustRadius product URLs, or run the Actor separately for each product. The `results_wanted` limit is applied per URL.

### What happens when a product has fewer reviews than requested?

The Actor saves the unique reviews available and stops when no additional review records are found. A run can therefore return fewer records than `results_wanted`.

### Are reviewer names and company details always available?

No. TrustRadius controls which reviewer and company fields are public. The Actor omits unavailable values rather than treating them as complete data.

### Can I export TrustRadius reviews to CSV or Excel?

Yes. Open the completed dataset in Apify Console and choose CSV, Excel, JSON, XML, or another supported export format.

### Can I schedule TrustRadius review collection?

Yes. Create an Apify schedule for hourly, daily, weekly, or custom recurring runs. Scheduled collection is useful for tracking newly published reviews and changes in product feedback.

### Is TrustRadius Review Scraper suitable for non-technical users?

Yes. You can configure the Actor from Apify Console, run it with form-based inputs, preview the dataset, and download the results without writing code.

### What should I do if some fields are missing?

Check several records and confirm that the source review publishes the missing information. Missing reviewer, company, or recommendation fields usually reflect the source page. If expected fields are missing across all records, report the issue through the Actor's Issues tab.

### Is it legal to collect TrustRadius reviews?

Public data collection can be subject to website terms, privacy requirements, and applicable laws. You are responsible for using the data lawfully, respecting TrustRadius policies, and limiting use of personal information to an appropriate purpose.

## Related Actors

- [App Store Reviews Scraper](https://apify.com/shahidirfan/app-store-reviews-scraper) - Collect iOS App Store ratings, review text, author details, app versions, and timestamps.
- [Google Play Store Reviews Scraper](https://apify.com/shahidirfan/google-play-store-reviews-scraper) - Collect Android app reviews, ratings, user feedback, and app metadata.
- [Tripadvisor Reviews Scraper](https://apify.com/shahidirfan/tripadvisor-reviews-scraper) - Collect hotel and travel reviews for reputation monitoring and customer feedback analysis.

## Support

For issues, feature requests, or questions about a run, use the Issues tab on the Actor's Apify page. Include the input URL, relevant run details, and a small example of the unexpected output when reporting a problem.

## Legal Notice

This Actor is intended for legitimate research, analysis, monitoring, and data workflow use cases involving publicly available information. Users are responsible for complying with TrustRadius terms, applicable laws, privacy rules, and any restrictions that apply to their intended use of the collected data.
