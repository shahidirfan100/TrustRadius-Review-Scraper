import { Actor, log } from 'apify';
import { Impit } from 'impit';

await Actor.init();

const REQUEST_PROFILES = [
    {
        name: 'android-html',
        headers: (slug) => ({
            'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 '
                + '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            referer: `https://www.trustradius.com/products/${slug}/reviews/all`,
        }),
    },
    {
        name: 'desktop-chrome',
        headers: (slug) => ({
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            accept: 'application/json, text/plain, text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            referer: `https://www.trustradius.com/products/${slug}/reviews/all`,
        }),
    },
    {
        name: 'ios-safari',
        headers: (slug) => ({
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 '
                + '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
            accept: 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            referer: `https://www.trustradius.com/products/${slug}/reviews/all`,
        }),
    },
    {
        name: 'android-api',
        headers: () => ({
            'user-agent': 'okhttp/4.12.0',
            accept: 'application/json',
            'accept-language': 'en-US',
        }),
    },
];

const BLOCK_PATTERN = /Access Denied|captcha|Just a moment|Cloudflare|Too Many Requests|rate limit/i;
const REVIEWS_PER_PAGE = 10;
const MAX_PAGE_CONCURRENCY = 5;

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

function createClient(proxyUrl) {
    return new Impit({
        browser: 'chrome',
        ignoreTlsErrors: true,
        ...(proxyUrl && { proxyUrl }),
    });
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

async function fetchWithRetry(url, slug, proxyConf, retries = 3) {
    let lastErr;
    const plans = [
        ...REQUEST_PROFILES.map((profile) => ({ profile, useProxy: false })),
        ...(proxyConf ? REQUEST_PROFILES.map((profile) => ({ profile, useProxy: true })) : []),
    ];
    const maxAttempts = Math.min(Math.max(retries, REQUEST_PROFILES.length), plans.length);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const plan = plans[attempt - 1];
        const proxyUrl = plan.useProxy
            ? await proxyConf.newUrl(`trustradius-${slug}-${attempt}-${Date.now()}`)
            : undefined;
        const client = createClient(proxyUrl);

        try {
            const response = await client.fetch(url, {
                headers: plan.profile.headers(slug),
            });
            const body = await response.text();

            if (isBlockedResponse(response.status, body)) {
                lastErr = new Error(`blocked or rate limited with ${plan.profile.name}${plan.useProxy ? ' proxy' : ' direct'} (HTTP ${response.status})`);
                log.warning(`${lastErr.message}; switching request profile`);
                continue;
            }
            if (response.status >= 500) {
                lastErr = new Error(`server error ${response.status} with ${plan.profile.name}${plan.useProxy ? ' proxy' : ' direct'}`);
                const wait = attempt * 1000;
                log.warning(`${lastErr.message}; retrying in ${Math.round(wait / 1000)}s`);
                await sleep(wait);
                continue;
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = JSON.parse(body);
            if (!Array.isArray(data?.records)) {
                throw new Error(`Unexpected API shape. Keys: ${Object.keys(data || {}).join(', ') || 'none'}`);
            }
            if (attempt > 1) {
                log.info(`Recovered with request profile: ${plan.profile.name}${plan.useProxy ? ' + rotated proxy' : ''}`);
            }
            return data;
        } catch (err) {
            lastErr = err;
            if (attempt === maxAttempts) break;
            const wait = attempt * 500 + Math.random() * 250;
            log.warning(`Request failed (${err.message}); retrying in ${Math.round(wait / 1000)}s`);
            await sleep(wait);
        }
    }
    throw lastErr || new Error('All retries failed');
}

async function fetchHtmlWithRetry(url, slug, proxyConf, retries = 3) {
    let lastErr;
    const htmlProfiles = REQUEST_PROFILES.filter((profile) => ['android-html', 'desktop-chrome', 'ios-safari'].includes(profile.name));
    const plans = [
        ...htmlProfiles.map((profile) => ({ profile, useProxy: false })),
        ...(proxyConf ? htmlProfiles.map((profile) => ({ profile, useProxy: true })) : []),
    ];
    const maxAttempts = Math.min(Math.max(retries, htmlProfiles.length), plans.length);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const plan = plans[attempt - 1];
        const proxyUrl = plan.useProxy
            ? await proxyConf.newUrl(`trustradius-html-${slug}-${attempt}-${Date.now()}`)
            : undefined;
        const client = createClient(proxyUrl);

        try {
            const response = await client.fetch(url, {
                headers: plan.profile.headers(slug),
            });
            const body = await response.text();
            const hasReviewPayload = body.includes('Review_review') && body.includes('Use Cases and Deployment Scope');

            if (isBlockedResponse(response.status, body) && !hasReviewPayload) {
                lastErr = new Error(`blocked with ${plan.profile.name}${plan.useProxy ? ' proxy' : ' direct'} (HTTP ${response.status})`);
                log.warning(`${lastErr.message}; switching request profile`);
                continue;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (!hasReviewPayload) throw new Error('Review payload missing from HTML response');

            if (attempt > 1) {
                log.info(`Recovered HTML reviews with profile: ${plan.profile.name}${plan.useProxy ? ' + rotated proxy' : ''}`);
            }
            return body;
        } catch (err) {
            lastErr = err;
            if (attempt === maxAttempts) break;
            log.warning(`HTML request failed (${err.message}); switching request profile`);
        }
    }
    throw lastErr || new Error('All HTML retries failed');
}

async function fetchReviewPage(slug, page, proxyConf) {
    const html = await fetchHtmlWithRetry(buildReviewsPageUrl(slug, page), slug, proxyConf, 3);
    return extractReviewArticles(html).map((article) => extractHtmlReviewRecord(article, slug));
}

async function fetchWantedReviews(slug, resultsWanted, totalAvailable, proxyConf) {
    const pagesNeeded = Math.ceil(Math.min(resultsWanted, totalAvailable || resultsWanted) / REVIEWS_PER_PAGE);
    const pages = Array.from({ length: pagesNeeded }, (_, index) => index + 1);
    const records = [];

    for (let i = 0; i < pages.length; i += MAX_PAGE_CONCURRENCY) {
        const pageBatch = pages.slice(i, i + MAX_PAGE_CONCURRENCY);
        const pageResults = await Promise.all(pageBatch.map((page) => fetchReviewPage(slug, page, proxyConf)));
        for (const pageRecords of pageResults) {
            records.push(...pageRecords);
            if (records.length >= resultsWanted) break;
        }
        if (records.length >= resultsWanted) break;
    }

    return records.slice(0, resultsWanted);
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

        let apiData;
        try {
            apiData = await fetchWithRetry(buildApiUrl(slug), slug, proxyConf, 3);
        } catch (err) {
            log.error(`Failed to fetch review API for ${slug}: ${err.message}`);
            continue;
        }

        const summaryRecords = Array.isArray(apiData?.records) ? apiData.records : [];
        const total = apiData?.totalCount ?? summaryRecords.length;
        log.info(`API returned totalCount=${total} for ${slug}`);
        if (total === 0) {
            log.warning(`No reviews found for ${slug}`);
            continue;
        }

        await Actor.pushData(stripNulls({
            recordType: 'product',
            productSlug: slug,
            productName: slug,
            reviewCount: total,
            url: `https://www.trustradius.com/products/${slug}/reviews/all`,
            source: 'api-summary',
        }));

        const reviewBatch = await fetchWantedReviews(slug, RESULTS_WANTED, total, proxyConf);
        const seen = new Set();
        const uniqueReviews = [];
        for (const record of reviewBatch) {
            const key = record.reviewSlug || JSON.stringify(record);
            if (seen.has(key)) {
                log.info(`Skipping duplicate review ${key}`);
                continue;
            }
            seen.add(key);
            uniqueReviews.push(record);
        }

        if (uniqueReviews.length > 0) {
            await Actor.pushData(uniqueReviews);
            saved += uniqueReviews.length;
        }

        log.info(`Product ${slug}: saved ${uniqueReviews.length} reviews`);
    }

    log.info(`Run complete | saved=${saved}`);
}

main().catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
}).finally(async () => {
    await Actor.exit();
});
