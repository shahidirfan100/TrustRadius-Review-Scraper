# API Discovery - TrustRadius Review Scraper

**Goal:** Find a fast, non-browser source that returns actual TrustRadius review text, not only summary metadata.

**Target domain:** `www.trustradius.com`
**Test product slug:** `apify`

---

## Selected Sources

### 1. Product Summary API

- **Endpoint:** `https://www.trustradius.com/api/v1/products/{slug}/reviews`
- **Method:** GET
- **Auth:** None required
- **Use:** Product-level `totalCount` and run planning.
- **Limitation:** Does not expose full review prose. Fields such as `verbatims` and `synopsis` are usually empty, so this endpoint alone is not enough.

### 2. Review Text Payload

- **Endpoint:** `https://www.trustradius.com/products/{slug}/reviews/all?page={page}`
- **Method:** GET
- **Header profile:** Android mobile Chrome HTML profile.
- **Auth:** None required.
- **Pagination:** `page=2`, `page=3`, etc. Each page exposes 10 reviews.
- **Payload:** Next.js flight stream in `self.__next_f.push(...)` scripts.
- **Response marker:** `Review_review` plus `Use Cases and Deployment Scope`.
- **Fields available:** title, rating, publication date, use cases, pros, cons, likelihood to recommend, reviewer name, job title, job type, department, company, company size, years of experience, verification status, incentive/source metadata, and direct review URL.

**Decision:** Use the summary API only for review count, then fetch the mobile HTML review pages and parse the Next.js flight payload for real review data. This keeps the actor HTTP-only and fast while restoring review text extraction.

---

## Candidate Matrix

| Candidate | Header profile | Status / body | Fields | Pagination | Decision |
|---|---|---:|---:|---|---|
| `/products/{slug}/reviews/all?page=N` | Android mobile Chrome | 200 HTML with Next flight payload | Full review text + reviewer metadata | `page=N`, 10 per page | **SELECTED** |
| `/api/v1/products/{slug}/reviews` | desktop / iOS / okhttp | 200 JSON | Summary metadata only | all summaries in one response | selected for total count only |
| `/products/{slug}/reviews/all` | desktop / iOS | sometimes 403 challenge | inconsistent | `page=N` | fallback only |
| `/api/v2/products/{slug}/reviews` | any | 404 NotFound | 0 | n/a | rejected |
| `/api/reviews?product={slug}` | any | 404 | 0 | n/a | rejected |
| `/api/v1/reviews/{id}` | any | 404 | 0 | n/a | rejected |
| `api.trustradius.com/...` | any | 403 Forbidden | 0 | n/a | rejected |

---

## Implementation Notes

- The actor first calls `/api/v1/products/{slug}/reviews` to get `totalCount`.
- The API `totalCount` is treated as metadata only, not as a pagination cap. User input wins: if
  `results_wanted` is 300, the actor keeps fetching review pages until 300 unique reviews are saved or
  review pages stop returning new review slugs.
- It fetches review pages in batches and stops on either the requested count or `no_more_reviews`.
- Page requests use the Android mobile Chrome profile first because it returned the full Apify review payload when desktop/iOS sometimes returned Cloudflare challenge HTML.
- The actor validates HTML responses before parsing. A response is accepted only when it contains `Review_review` and `Use Cases and Deployment Scope`.
- The actor parses `self.__next_f.push(...)` chunks as JSON and extracts review `article` nodes from the React server component tree.
- Proxy support remains a fallback. If enabled on Apify Cloud, blocked retries rotate session IDs instead of reusing the same identity.
- Playwright is not required.

### Final Review Fields

The actor emits one dataset item per review. It does not push a separate product summary row, because that appears as an empty review in review-only exports.

`recordType, productName, productSlug, reviewCount, reviewSlug, title, rating, ratingNormalized, publishedDate, publishedDateText, trusted, incentive, reviewSource, author, authorFirst, authorLast, reviewerJobTitle, reviewerJobType, reviewerDepartment, companyName, companyIndustry, companySize, yearsExperience, authorPublic, linkedInProfileUrl, isVerified, verifiedBy, useCases, pros, cons, likelihoodToRecommend, url, source`
