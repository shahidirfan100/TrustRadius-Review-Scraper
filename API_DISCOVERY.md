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

### Request-flow validation

The working flow is a same-origin mobile browser session:

1. `GET /api/v1/products/{slug}/reviews` with the Android Chrome user-agent, JSON `Accept`, the canonical reviews-page referrer, and same-origin fetch headers. The response is used only for `totalCount` and also establishes the session cookies.
2. `GET /products/{slug}/reviews/all` as the first HTML document request with the Android Chrome profile. The response must contain both `Review_review` and `Use Cases and Deployment Scope`.
3. Reuse the same cookie jar, user-agent, and session for the paginated HTML requests. Page requests use the preceding page as their referrer. Page 1 is serialized as the session bootstrap; pages 2+ retain the existing parallel batch behavior.

Direct validation on 2026-08-25:

| Flow | Result | Interpretation |
|---|---|---|
| Summary API with Android JSON headers | HTTP 200, 143 records, `totalCount=143` | Valid metadata request |
| Review HTML pages 1–3 with Android mobile browser headers | HTTP 200, full Next flight marker on each page | Valid review source |
| Review pages 1–5 concurrently after a session bootstrap | HTTP 200 and full review marker on every page | Existing throughput is reliable; no arbitrary slowdown is needed |
| Same requests with/without `Origin` | Identical HTTP 200 payloads | `Origin` is not required for these same-origin GETs |
| Desktop/iOS/app variants on the review HTML endpoint | Desktop/iOS also worked in direct probes; app-style `okhttp` is valid only for JSON probing, not HTML | Mobile HTML remains primary; desktop is bounded fallback; no app profile is used for HTML |

Before this change, every request created a stateless Impit client even though TrustRadius set session and Cloudflare cookies. The actor also mixed JSON, desktop, iOS, and app-style profiles against the summary endpoint and could send non-browser profiles to the HTML endpoint. The probes did not reproduce a 403, 429, or empty response, so those inconsistencies were a reliability risk rather than a confirmed local failure. The fixed pattern now preserves the valid mobile flow, cookies, request order, and normal page concurrency while adding bounded recovery for temporary failures.

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
