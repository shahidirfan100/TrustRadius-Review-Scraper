import { Actor, log } from 'apify';
import { Impit } from 'impit';
import { CookieJar } from 'tough-cookie';

await Actor.init();

const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const REQUEST_PROFILES = {
    summary: {
        name: 'android-json',
        headers: (slug) => ({
            'user-agent': MOBILE_USER_AGENT,
            accept: 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            referer: `https://www.trustradius.com/products/${slug}/reviews/all`,
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': 'Android',
        }),
    },
    reviews: {
        name: 'android-html',
        headers: (slug, page) => ({
            'user-agent': MOBILE_USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            referer: page > 1
                ? `https://www.trustradius.com/products/${slug}/reviews/all?page=${page - 1}`
                : `https://www.trustradius.com/products/${slug}/reviews/all`,
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-user': '?1',
            'sec-fetch-dest': 'document',
            'upgrade-insecure-requests': '1',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': 'Android',
        }),
    },
    desktopReviews: {
        name: 'desktop-chrome-fallback',
        headers: (slug, page) => ({
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            referer: page > 1
                ? `https://www.trustradius.com/products/${slug}/reviews/all?page=${page - 1}`
                : `https://www.trustradius.com/products/${slug}/reviews/all`,
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-user': '?1',
            'sec-fetch-dest': 'document',
            'upgrade-insecure-requests': '1',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': 'Windows',
        }),
    },
};

const BLOCK_PATTERN = /Pardon Our Interruption|<title[^>]*>\s*(?:Access Denied|Just a moment|Too Many Requests|rate limit)/i;
const MAX_PAGE_CONCURRENCY = 5;
const MAX_RETRY_DELAY_MS = 4000;

function extractSlug(url) {
    const m = url.match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
}

function buildApiUrl(slug) {
    return `https://www.trustradius.com/api/v1/products/${slug}/reviews`;
}

function buildReviewsPageUrl(slug, page) {
    const baseUrl = `https://www.trustradius.com/products/${slug}/reviews/all`;
    return page > 1 ? `${baseUrl}?page=${page}` : baseUrl;
}

function toTitleCase(value) {
    return value
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function extractProductName(html, slug) {
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1];
    const productName = title
        ?.replace(/\s+Reviews from Real Users\s*\|\s*TrustRadius$/i, '')
        .replace(/\s+Reviews\s*\|\s*TrustRadius$/i, '')
        .trim();
    return productName || toTitleCase(slug);
}

function extractTotalReviews(html) {
    const totals = [...html.matchAll(/(?:\\?"totalReviews\\?":)(\d+)/g)]
        .map((match) => Number(match[1]))
        .filter((value) => Number.isFinite(value) && value > 0);
    return totals.length ? Math.max(...totals) : null;
}

function stripNulls(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    );
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function createRequestSession(proxyUrl) {
    const cookieJar = new CookieJar();
    return {
        client: new Impit({
            browser: 'chrome',
            ignoreTlsErrors: true,
            timeout: 45000,
            cookieJar,
            ...(proxyUrl && { proxyUrl }),
        }),
        proxyUrl,
    };
}

function retryDelay(attempt, retryAfterSeconds = null) {
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        return Math.min(MAX_RETRY_DELAY_MS, retryAfterSeconds * 1000);
    }
    return Math.min(MAX_RETRY_DELAY_MS, 500 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
}

function getRetryAfterSeconds(response) {
    const value = Number(response?.headers?.get('retry-after'));
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function createRetryError(message, response = null) {
    const error = new Error(message);
    error.retryable = true;
    error.retryAfterSeconds = getRetryAfterSeconds(response);
    error.rotateSession = response?.status === 403 || response?.status === 429;
    return error;
}

function decodeHtml(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function walkTree(node, callback) {
    callback(node);
    if (Array.isArray(node)) {
        for (const value of node) walkTree(value, callback);
    } else if (node && typeof node === 'object') {
        for (const value of Object.values(node)) walkTree(value, callback);
    }
}

function isFlightElement(node) {
    return Array.isArray(node) && node[0] === '$' && node.length >= 4 && node[3] && typeof node[3] === 'object';
}

function findFirst(node, predicate) {
    let found;
    walkTree(node, (current) => {
        if (found === undefined && predicate(current)) found = current;
    });
    return found;
}

function textContent(node) {
    if (typeof node === 'string') return node.startsWith('$') ? '' : node;
    const parts = [];
    walkTree(node, (current) => {
        if (typeof current === 'string' && !current.startsWith('$')) parts.push(current);
    });
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseFlightRoots(html) {
    const roots = [];
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    for (const script of scripts) {
        if (!script.includes('self.__next_f.push')) continue;
        const match = script.match(/self\.__next_f\.push\((\[.*\])\)$/s);
        if (!match) continue;
        try {
            const pushed = JSON.parse(match[1]);
            const payload = typeof pushed[1] === 'string' ? pushed[1] : '';
            const flightJson = payload.replace(/^[0-9a-z]+:/i, '');
            roots.push(JSON.parse(flightJson));
        } catch {
            // Ignore non-review flight chunks.
        }
    }
    return roots;
}

function extractReviewArticles(html) {
    const articles = [];
    for (const root of parseFlightRoots(html)) {
        walkTree(root, (node) => {
            if (isFlightElement(node) && node[1] === 'article' && /Review_review/.test(node[3].className || '')) {
                articles.push(node);
            }
        });
    }
    return articles;
}

function extractAnswerBlocks(article) {
    const answerBlocks = [];
    walkTree(article, (node) => {
        if (isFlightElement(node) && node[1] === 'div' && /ReviewAnswer_reviewAnswer/.test(node[3].className || '')) {
            answerBlocks.push(node);
        }
    });
    return answerBlocks;
}

function extractHtmlReviewRecord(article, slug) {
    const answerKeyByHeading = {
        'Use Cases and Deployment Scope': 'useCases',
        Pros: 'pros',
        Cons: 'cons',
        'Likelihood to Recommend': 'likelihoodToRecommend',
    };

    const link = findFirst(article, (node) => (
        isFlightElement(node) && node[1] === 'a' && node[3].href?.startsWith('/reviews/')
    ));
    const rating = findFirst(article, (node) => (
        isFlightElement(node) && node[3].id?.endsWith('_rating') && node[3].value != null
    ));
    const trustBadge = findFirst(article, (node) => (
        isFlightElement(node) && node[3].source && (node[3].trusted !== undefined || node[3].incentive !== undefined)
    ));
    const time = findFirst(article, (node) => isFlightElement(node) && node[1] === 'time');
    const reviewer = findFirst(article, (node) => isFlightElement(node) && node[3].reviewer)?.[3].reviewer || {};

    const reviewSlug = link?.[3].href?.split('/').pop() || null;
    const record = {
        recordType: 'review',
        productSlug: slug,
        reviewSlug,
        title: link ? textContent(link[3].children) : null,
        rating: rating?.[3].value != null ? `${rating[3].value}/10` : null,
        ratingNormalized: rating?.[3].value ?? null,
        publishedDate: time?.[3].dateTime || null,
        publishedDateText: time ? textContent(time[3].children) : null,
        trusted: trustBadge?.[3].trusted ?? null,
        incentive: trustBadge?.[3].incentive || null,
        reviewSource: trustBadge?.[3].source || null,
        author: reviewer.fullName || null,
        authorFirst: reviewer.firstName || null,
        authorLast: reviewer.lastName || null,
        reviewerJobTitle: reviewer.title || null,
        reviewerJobType: reviewer.jobType || null,
        reviewerDepartment: reviewer.department || null,
        companyName: reviewer.companyName || null,
        companyIndustry: reviewer.industryType || null,
        companySize: reviewer.companySize || null,
        yearsExperience: reviewer.yearsExperience ?? null,
        authorPublic: reviewer.authorPublic ?? null,
        linkedInProfileUrl: reviewer.linkedInProfileUrl || null,
        isVerified: reviewer.verification?.isVerified ?? null,
        verifiedBy: reviewer.verification?.verifiedBy || null,
        url: reviewSlug ? `https://www.trustradius.com/reviews/${reviewSlug}` : null,
        source: 'html-flight',
    };

    for (const block of extractAnswerBlocks(article)) {
        const headingNode = findFirst(block, (node) => (
            isFlightElement(node)
            && typeof node[3].children === 'string'
            && Object.hasOwn(answerKeyByHeading, node[3].children)
        ));
        const heading = headingNode?.[3].children;
        if (!heading) continue;

        const htmlNode = findFirst(block, (node) => (
            isFlightElement(node) && Reflect.get(node[3].dangerouslySetInnerHTML || {}, '__html')
        ));
        const listNode = findFirst(block, (node) => isFlightElement(node) && Array.isArray(node[3].items));
        record[answerKeyByHeading[heading]] = htmlNode
            ? decodeHtml(Reflect.get(htmlNode[3].dangerouslySetInnerHTML, '__html'))
            : listNode?.[3].items || null;
    }

    return stripNulls(record);
}

function isBlockedResponse(status, body) {
    return status === 403 || status === 429 || BLOCK_PATTERN.test(body);
}

function isBlockedHtmlResponse(status, body) {
    const title = body.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '';
    return status === 403
        || status === 429
        || /Access Denied|captcha|Just a moment|Too Many Requests|rate limit/i.test(title)
        || /Pardon Our Interruption|Access Denied|captcha/i.test(body);
}

async function fetchWithRetry(url, slug, proxyConf, sessionState, retries = 3) {
    let lastErr;
    const maxAttempts = Math.max(1, retries);
    const profile = REQUEST_PROFILES.summary;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await sessionState.current.client.fetch(url, {
                headers: profile.headers(slug),
            });
            const body = await response.text();

            if (isBlockedResponse(response.status, body)) {
                throw createRetryError(
                    `blocked or rate limited with ${profile.name} (HTTP ${response.status})`,
                    response,
                );
            }
            if (response.status >= 500) {
                throw createRetryError(`server error ${response.status} with ${profile.name}`, response);
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            let data;
            try {
                data = JSON.parse(body);
            } catch {
                throw createRetryError('Summary API returned invalid JSON', response);
            }
            if (!Array.isArray(data?.records)) {
                throw createRetryError(
                    `Unexpected API shape. Keys: ${Object.keys(data || {}).join(', ') || 'none'}`,
                    response,
                );
            }
            if (attempt > 1) log.info(`Recovered summary API with ${profile.name}`);
            return data;
        } catch (err) {
            lastErr = err;
            const isTransient = err.retryable || !/^HTTP 4\d\d$/.test(err.message);
            if (attempt === maxAttempts || !isTransient) break;

            if (err.rotateSession) {
                const proxyUrl = proxyConf
                    ? await proxyConf.newUrl(`trustradius-summary-${slug}-${attempt}-${Date.now()}`)
                    : undefined;
                Object.assign(sessionState, { current: createRequestSession(proxyUrl) });
            }

            const wait = retryDelay(attempt, err.retryAfterSeconds);
            log.warning(`Summary request failed (${err.message}); retrying in ${Math.ceil(wait / 1000)}s`);
            await sleep(wait);
        }
    }
    throw lastErr || new Error('All summary API retries failed');
}

async function fetchHtmlWithRetry(url, slug, page, proxyConf, sessionState, retries = 3) {
    let lastErr;
    let profile = REQUEST_PROFILES.reviews;
    const maxAttempts = Math.max(1, retries);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await sessionState.current.client.fetch(url, {
                headers: profile.headers(slug, page),
            });
            const body = await response.text();
            const hasReviewPayload = body.includes('Review_review') && body.includes('Use Cases and Deployment Scope');

            if (isBlockedHtmlResponse(response.status, body) && !hasReviewPayload) {
                const error = createRetryError(
                    `blocked with ${profile.name} (HTTP ${response.status})`,
                    response,
                );
                error.useFallbackProfile = profile === REQUEST_PROFILES.reviews;
                throw error;
            }
            if (!hasReviewPayload) {
                const error = createRetryError(`review payload missing with ${profile.name}`, response);
                error.useFallbackProfile = profile === REQUEST_PROFILES.reviews;
                throw error;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            if (attempt > 1) {
                log.info(`Recovered HTML reviews with profile: ${profile.name}${sessionState.current.proxyUrl ? ' + rotated proxy' : ''}`);
            }
            return body;
        } catch (err) {
            lastErr = err;
            const isTransient = err.retryable || !/^HTTP 4\d\d$/.test(err.message);
            if (attempt === maxAttempts || !isTransient) break;

            if (err.rotateSession || err.useFallbackProfile) {
                if (err.rotateSession && proxyConf) {
                    const proxyUrl = await proxyConf.newUrl(`trustradius-html-${slug}-${page}-${attempt}-${Date.now()}`);
                    Object.assign(sessionState, { current: createRequestSession(proxyUrl) });
                } else {
                    Object.assign(sessionState, { current: createRequestSession() });
                }
                if (err.useFallbackProfile && !proxyConf) profile = REQUEST_PROFILES.desktopReviews;
            }

            const wait = retryDelay(attempt, err.retryAfterSeconds);
            log.warning(`HTML request failed (${err.message}); retrying in ${Math.ceil(wait / 1000)}s`);
            await sleep(wait);
        }
    }
    throw lastErr || new Error('All HTML retries failed');
}

async function fetchReviewPage(slug, page, proxyConf, sessionState) {
    const html = await fetchHtmlWithRetry(buildReviewsPageUrl(slug, page), slug, page, proxyConf, sessionState, 3);
    return {
        productName: extractProductName(html, slug),
        totalReviews: extractTotalReviews(html),
        page,
        records: extractReviewArticles(html).map((article) => extractHtmlReviewRecord(article, slug)),
    };
}

async function fetchWantedReviews(slug, resultsWanted, apiReviewCount, proxyConf, sessionState) {
    const records = [];
    const seen = new Set();
    let productName = toTitleCase(slug);
    let reviewCount = apiReviewCount || null;
    let stopReason = 'requested_count_reached';

    const processBatch = async (startPage, batchSize) => {
        const pageBatch = Array.from({ length: batchSize }, (_, index) => startPage + index);
        const settledResults = await Promise.allSettled(
            pageBatch.map((pageNumber) => fetchReviewPage(slug, pageNumber, proxyConf, sessionState)),
        );
        let newRecordsInBatch = 0;
        let successfulPages = 0;

        for (const result of settledResults) {
            if (result.status === 'rejected') {
                log.warning(`Review page request failed: ${result.reason.message}`);
                continue;
            }

            successfulPages++;
            const pageResult = result.value;
            if (pageResult.productName) productName = pageResult.productName;
            if (pageResult.totalReviews) reviewCount = Math.max(reviewCount || 0, pageResult.totalReviews);

            for (const record of pageResult.records) {
                const key = record.reviewSlug || JSON.stringify(record);
                if (seen.has(key)) continue;
                seen.add(key);
                records.push(record);
                newRecordsInBatch++;
                if (records.length >= resultsWanted) break;
            }
            if (records.length >= resultsWanted) break;
        }

        log.info(`Fetched review pages ${startPage}-${pageBatch.at(-1)} | saved=${records.length}/${resultsWanted}`);
        return { newRecordsInBatch, successfulPages, lastPage: pageBatch.at(-1) };
    };

    // Bootstrap the browser-like session before parallel pagination so cookies set by
    // the first document request are available to every subsequent page request.
    const bootstrap = await processBatch(1, 1);
    if (records.length >= resultsWanted) {
        return {
            productName,
            reviewCount: reviewCount || records.length,
            records: records.slice(0, resultsWanted),
            stopReason,
        };
    }
    if (bootstrap.successfulPages > 0 && bootstrap.newRecordsInBatch === 0) {
        stopReason = 'no_more_reviews';
    } else {
        const parallelBatchSize = Math.max(1, MAX_PAGE_CONCURRENCY - 1);
        let page = 2;
        while (records.length < resultsWanted) {
            const batch = await processBatch(page, parallelBatchSize);
            if (records.length >= resultsWanted) break;
            if (batch.successfulPages === 0) {
                stopReason = 'request_failures';
                break;
            }
            if (batch.newRecordsInBatch === 0) {
                stopReason = 'no_more_reviews';
                break;
            }
            page = batch.lastPage + 1;
        }
    }

    return {
        productName,
        reviewCount: reviewCount || records.length,
        records: records.slice(0, resultsWanted),
        stopReason,
    };
}

async function main() {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl, url, startUrls = [],
        results_wanted: RESULTS_WANTED_RAW,
        proxyConfiguration,
    } = input;

    const RESULTS_WANTED = Number.isFinite(Number(RESULTS_WANTED_RAW)) ? Math.max(1, Number(RESULTS_WANTED_RAW)) : 20;

    const initialUrls = [];
    if (Array.isArray(startUrls) && startUrls.length) initialUrls.push(...startUrls.map((u) => (typeof u === 'string' ? u : u.url)).filter(Boolean));
    if (startUrl) initialUrls.push(startUrl);
    if (url) initialUrls.push(url);
    if (!initialUrls.length) {
        throw new Error('Please provide a TrustRadius product URL (e.g. https://www.trustradius.com/products/apify/reviews/all)');
    }

    const isApifyCloud = Actor.isAtHome();
    const hasProxyUrls = Array.isArray(proxyConfiguration?.proxyUrls) && proxyConfiguration.proxyUrls.length > 0;
    const shouldUseProxy = Boolean(proxyConfiguration?.useApifyProxy || hasProxyUrls);
    const proxyConf = shouldUseProxy && isApifyCloud
        ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
        : null;
    if (shouldUseProxy && !isApifyCloud) {
        log.info('Local run: skipping Apify Proxy (not on cloud)');
    }

    let saved = 0;

    for (const entryUrl of initialUrls) {
        const slug = extractSlug(entryUrl);
        if (!slug) {
            log.warning(`Could not extract product slug from URL: ${entryUrl}`);
            continue;
        }
        log.info(`Processing product: ${slug}`);
        const sessionState = { current: createRequestSession() };

        let apiData = null;
        try {
            apiData = await fetchWithRetry(buildApiUrl(slug), slug, proxyConf, sessionState, 3);
        } catch (err) {
            log.warning(`Summary API failed for ${slug}: ${err.message}. Continuing with review pages.`);
        }

        const summaryRecords = Array.isArray(apiData?.records) ? apiData.records : [];
        const total = apiData?.totalCount ?? summaryRecords.length;
        log.info(`API returned totalCount=${total} for ${slug}`);
        if (total === 0) {
            log.warning(`Summary API returned no reviews for ${slug}; checking review pages anyway`);
        }

        const reviewPageData = await fetchWantedReviews(slug, RESULTS_WANTED, total, proxyConf, sessionState);
        const seen = new Set();
        const uniqueReviews = [];
        for (const record of reviewPageData.records) {
            const key = record.reviewSlug || JSON.stringify(record);
            if (seen.has(key)) {
                log.info(`Skipping duplicate review ${key}`);
                continue;
            }
            seen.add(key);
            uniqueReviews.push(stripNulls({
                productName: reviewPageData.productName,
                reviewCount: reviewPageData.reviewCount,
                ...record,
            }));
        }

        if (uniqueReviews.length > 0) {
            await Actor.pushData(uniqueReviews);
            saved += uniqueReviews.length;
        }

        log.info(`Product ${slug}: saved ${uniqueReviews.length} reviews | stop_reason=${reviewPageData.stopReason}`);
    }

    log.info(`Run complete | saved=${saved}`);
}

main().catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
}).finally(async () => {
    await Actor.exit();
});
