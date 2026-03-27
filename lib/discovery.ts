import { performSerperSearch, performSerperJobsSearch, fetchCompanyNews } from './serper';
import { getKey, STORAGE_KEYS } from './storage';
import pLimit from 'p-limit';
import type { CompanyNewsSnippet } from './ai';

export interface RawSignal {
    id: string;
    source: string;
    url: string;
    title: string;
    snippet: string;
    clean_snippet?: string; // NEW: Sanitized version for LLM scoring
    timestamp: string;
    company?: string;
    salary?: string;
    location?: string;
    metadata?: {
        query: string;
        rank: number;
    }
}

type LogCallback = (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

export interface DiscoveryProgress {
    found: number;
    filtered: number;
    currentQuery?: string;
}

type ProgressCallback = (p: DiscoveryProgress) => void;

// --- CONSTANTS FOR VISIBILITY & DENSITY ---
export const DEFAULT_ATS_TARGETS = [
    'boards.greenhouse.io',
    'jobs.lever.co',
    'jobs.ashbyhq.com',
    'myworkdayjobs.com',
    'jobs.smartrecruiters.com',
    'apply.workable.com',
    'breezy.hr',
    'careers.jobscore.com'
];

// NEW: Aggregator domains to deprioritize in favor of direct ATS links
export const AGGREGATOR_DOMAINS = [
    'indeed.com',
    'glassdoor.com',
    'ziprecruiter.com',
    'monster.com',
    'simplyhired.com',
    'careerbuilder.com',
    'dice.com'
];

// NEW: Get ATS targets from storage (user-configurable) or use defaults
export const getATSTargets = (): string[] => {
    const customATS = getKey(STORAGE_KEYS.CUSTOM_ATS_DOMAINS);
    if (customATS) {
        try {
            const parsed = JSON.parse(customATS);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Merge custom with defaults, deduplicate
                return [...new Set([...DEFAULT_ATS_TARGETS, ...parsed])];
            }
        } catch (e) {
            console.warn("Failed to parse custom ATS domains", e);
        }
    }
    return DEFAULT_ATS_TARGETS;
};

// Legacy export for backward compatibility
export const GLOBAL_ATS_TARGETS = DEFAULT_ATS_TARGETS;

export const GLOBAL_NETWORKS = [
    'linkedin.com/jobs/view'
];

// Centralized Logic to extract Company Name from URL
export const extractCompanyFromUrl = (url: string): string | null => {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const path = u.pathname;

        // 1. ATS Systems (High Confidence)
        if (host.includes('greenhouse.io') || host.includes('lever.co') || host.includes('ashbyhq.com') || host.includes('workable.com') || host.includes('smartrecruiters.com')) {
            const parts = path.split('/').filter(p => p);
            if (parts.length > 0) return capitalize(parts[0]);
        }

        // 2. Subdomains (careers.company.com)
        if (host.startsWith('careers.') || host.startsWith('jobs.') || host.startsWith('join.')) {
            const parts = host.split('.');
            if (parts.length >= 3) return capitalize(parts[1]);
        }

        // 3. Workday
        if (host.includes('myworkdayjobs.com')) {
            const company = host.split('.')[0];
            return capitalize(company);
        }

        return null;
    } catch (e) {
        return null;
    }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Assigns a quality score to the source URL.
 * Higher is better. Used to resolve duplicates.
 * IMPROVED: Now deprioritizes aggregator domains.
 */
const getSourceAuthority = (url: string, snippet: string, regionalBoards: string[] = []): number => {
    const u = url.toLowerCase();
    let score = 1;

    // Check if this is an aggregator (lowest priority)
    if (AGGREGATOR_DOMAINS.some(agg => u.includes(agg))) {
        return 0.5; // Aggregators get lowest score
    }

    // Rank 3: Direct ATS (Source of Truth - Highest Priority)
    const atsTargets = getATSTargets();
    if (atsTargets.some(ats => u.includes(ats.replace('boards.', '').replace('jobs.', '')))) score = 10;
    // Rank 2: High Quality Platforms (Deep Links)
    else if (u.includes('linkedin.com') || u.includes('wellfound.com') || u.includes('ycombinator.com')) score = 5;
    // Rank 2.5: Dynamic Regional Portals (Identified by AI)
    else if (regionalBoards.some(board => u.includes(board))) score = 4;

    // Recency Bonus (0.1 per day fresh)
    const daysOldMatch = snippet.match(/(\d+)\s+day/);
    if (daysOldMatch) {
        const days = parseInt(daysOldMatch[1]);
        if (days < 5) score += 0.5;
    } else if (snippet.toLowerCase().includes('hour')) {
        score += 0.8;
    }

    return score;
};

/**
 * Helper: Extracts a Deterministic Job ID from the URL if possible.
 */
const extractJobId = (url: string): string | null => {
    try {
        const u = new URL(url);
        const path = u.pathname;
        const search = new URLSearchParams(u.search);

        // Greenhouse: /company/jobs/12345 or ?gh_jid=12345
        if (u.hostname.includes('greenhouse.io')) {
            if (search.get('gh_jid')) return search.get('gh_jid');
            const parts = path.split('/').filter(p => p);
            const last = parts[parts.length - 1];
            if (last && /^\d+$/.test(last)) return last;
        }

        // Lever: /company/id
        if (u.hostname.includes('lever.co')) {
            const parts = path.split('/').filter(p => p);
            return parts.length >= 2 ? parts[parts.length - 1] : null;
        }

        // Ashby: /company/id
        if (u.hostname.includes('ashbyhq.com')) {
            const parts = path.split('/').filter(p => p);
            return parts.length >= 2 ? parts[parts.length - 1] : null;
        }

        // LinkedIn: /jobs/view/ID or ?currentJobId=ID
        if (u.hostname.includes('linkedin.com')) {
            if (path.includes('/jobs/view/')) {
                const parts = path.split('/jobs/view/');
                if (parts[1]) {
                    const id = parts[1].split('/')[0].replace(/\D/g, '');
                    if (id) return id;
                }
            }
            if (search.get('currentJobId')) return search.get('currentJobId');
        }

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * CLEAN SNIPPET (Heuristic DOM Stripping)
 * Removes common boilerplate from Google Search snippets (cookie banners, header navs, etc.)
 * This ensures the LLM's context window isn't polluted with "We use cookies" when evaluating culture fit.
 */
export const cleanSnippet = (snippet: string): string => {
    let clean = snippet;
    
    // Common boilerplate phrases to strip out completely
    const blocklists = [
        /we use cookies.*?agree/gi,
        /cookie policy/gi,
        /manage preferences/gi,
        /skip to main content/gi,
        /return to careers/gi,
        /view all openings/gi,
        /apply for this job/gi,
        /browse jobs/gi,
        /privacy policy/gi,
        /terms of service/gi
    ];

    blocklists.forEach(regex => {
        clean = clean.replace(regex, '');
    });

    // Strip out generic menu bar nav items often captured in snippets
    clean = clean.replace(/home\s*\|\s*about\s*\|\s*contact/gi, '');
    clean = clean.replace(/careers\s*>\s*engineering/gi, '');

    // Cleanup extra whitespace left behind by regex replacements
    return clean.replace(/\s{2,}/g, ' ').trim();
};

/**
 * CANONICAL COMPANY NORMALIZATION
 * Removes common corporate suffixes so "Stripe Inc." matches "Stripe" across different platforms.
 */
export const normalizeCompanyName = (company: string): string => {
    let norm = company.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // remove punctuation
        .trim();
        
    // Standard corporate suffixes to strip
    const suffixes = [
        /\binc\b/i, 
        /\bllc\b/i, 
        /\bltd\b/i, 
        /\bcorporation\b/i, 
        /\bcorp\b/i, 
        /\bcompany\b/i,
        /\bglobal\b/i,
        /\btechnologies\b/i
    ];

    suffixes.forEach(suffix => {
        norm = norm.replace(suffix, '');
    });

    return norm.replace(/\s+/g, '-').trim(); // e.g. "deutsche bank" -> "deutsche-bank"
};

const normalizeString = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

const extractTeamContext = (text: string): string => {
    const teams = ['payments', 'infrastructure', 'infra', 'growth', 'platform', 'security', 'trust', 'data', 'ml', 'ai', 'mobile', 'web', 'backend', 'frontend', 'fullstack', 'consumer', 'enterprise', 'b2b', 'b2c'];
    const lower = text.toLowerCase();
    return teams.find(t => lower.includes(t)) || '';
};

/**
 * Creates a semantic fingerprint.
 * IMPROVED V3: Includes Team Context & Snippet Hash (150 chars) to reduce collisions.
 * V4: Uses structured company/location if available from Jobs API.
 */
const generateFingerprint = (item: RawSignal): string => {
    // 1. Prefer Clean Structure if available (Jobs API)
    let company = item.company;

    // 2. Fallback to extracting from URL or Title
    if (!company) {
        company = extractCompanyFromUrl(item.url);
        if (!company) {
            try {
                // Attempt to extract from Title (e.g., "Product Manager at Stripe")
                const atSplit = item.title.toLowerCase().split(' at ');
                if (atSplit.length > 1) {
                    company = atSplit[atSplit.length - 1];
                } else {
                    const hostname = new URL(item.url).hostname;
                    company = hostname.replace('www.', '').split('.')[0];
                }
            } catch (e) {
                company = 'unknown';
            }
        }
    }

    // Normalize Company Name across sources (e.g. "Stripe Inc" and "stripe.com" -> "stripe")
    const cleanCompany = normalizeCompanyName(company || 'unknown');

    // 1. Deterministic ID Check (The Gold Standard)
    const jobId = extractJobId(item.url);
    if (jobId) {
        return `ID:${cleanCompany}:${jobId}`;
    }

    // 2. URL-path dedup: same hostname + path = same job regardless of query params
    try {
        const u = new URL(item.url);
        const cleanPath = u.hostname + u.pathname.replace(/\/$/, '');
        // If URL path is specific enough (more than just homepage), use it
        if (u.pathname.length > 5) {
            return `URL:${normalizeString(cleanPath)}`;
        }
    } catch (e) { /* fall through to fuzzy */ }

    // 3. Fuzzy Matching V4 — title-based only (no snippet hash)
    // Snippets vary wildly between search queries for the same job. 
    // Use first 40 normalized chars of title + company + team context.
    let title = normalizeString(item.title);

    // Remove "at Company" from title for hash if present
    if (company && title.includes(cleanCompany)) {
        title = title.replace(cleanCompany, '');
    }

    // Extract Context (Team/Dept) to differentiate "Stripe PM (Payments)" from "Stripe PM (Growth)"
    const team = extractTeamContext(item.title) || extractTeamContext(item.snippet);

    // Use title (first 40 chars) + company + team. No snippet hash — too fragile.
    return `FUZZY_V4:${cleanCompany}:${title.slice(0, 40)}:${team}`;
};

// --- STRATEGY: URL VALIDATOR ---
const isHighQualityJobLink = (url: string): boolean => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();
        const search = u.search.toLowerCase();
        const hostname = u.hostname.toLowerCase();

        // REJECT GENERIC PAGES
        if (path === '/' || path === '/jobs' || path === '/jobs/' || path === '/careers') return false;
        if (path.includes('/search') && !hostname.includes('linkedin.com')) return false;
        if (path.includes('/tags/') || path.includes('/category/') || path.includes('/archive/')) return false;
        if (path.includes('/blog/') || path.includes('/news/')) return false;

        // TARGETED: LinkedIn
        if (hostname.includes('linkedin.com')) {
            if (path.includes('/jobs/view/') || path.includes('/jobs/collections/')) return true;
            if (path.includes('/jobs/search') && search.includes('currentjobid=')) return true;
            return false;
        }

        // ACCEPT: Naukri and iimjobs (India boards)
        if (hostname.includes('naukri.com') || hostname.includes('iimjobs.com') || hostname.includes('in.indeed.com')) {
            return true;
        }

        return true;
    } catch (e) {
        return false;
    }
}

/**
 * CLIENT-SIDE "BOUNCER" (Layer 2)
 * IMPROVED: More aggressive pre-filtering to reduce AI scoring costs.
 * Uses domain-based stop words to reject obviously unrelated roles.
 */
const normalizeForMatch = (s: string) =>
    (s || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s/-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const tokenize = (s: string) =>
    normalizeForMatch(s)
        .split(/[\s/-]+/)
        .map(w => w.trim())
        .filter(Boolean);

const hasAnyPhrase = (haystack: string, phrases: string[]) => {
    const h = normalizeForMatch(haystack);
    return phrases.some(p => {
        const pp = normalizeForMatch(p);
        return pp.length > 0 && h.includes(pp);
    });
};

/**
 * CLIENT-SIDE "BOUNCER" (Layer 2)
 * IMPROVED: Adds a hard "semantic-ish" role gate using expanded roles, and
 * avoids false positives from generic tokens like "manager" or "analyst".
 */
const passesRoleGuard = (
    title: string,
    snippet: string,
    targetRoles: string[],
    expandedRoles?: string[]
): boolean => {
    let t = title.toLowerCase();

    // Handle Naukri-style titles: "Role - X Years - Company" → extract role part
    if (t.includes(' - ') && (t.includes('years') || t.includes('yrs'))) {
        t = t.split(' - ')[0].trim();
    }

    // 1. Safe Pass: Generic Titles
    if (t.includes('careers') || t.includes('jobs at') || t.includes('join our team') || t.includes('openings')) {
        return true;
    }

    // 2. Comprehensive Stop Words by Domain
    const universalStopWords = [
        'account executive', 'sales representative', 'sales manager', 'business development rep', 'bdr', 'sdr',
        'customer support', 'customer service', 'customer success manager', 'support specialist',
        'recruiter', 'hr manager', 'human resources', 'office manager', 'administrative assistant', 'receptionist',
        'legal counsel', 'paralegal', 'accountant', 'auditor', 'tax specialist',
        'nurse', 'physician', 'medical assistant', 'pharmacist', 'dental',
        'cashier', 'barista', 'server', 'retail associate', 'store manager', 'shift supervisor',
        'electrician', 'plumber', 'mechanic', 'driver', 'warehouse associate', 'forklift operator',
        'teacher', 'tutor', 'professor', 'teaching assistant',
    ];

    const techRoles = ['engineer', 'developer', 'designer', 'product', 'data', 'analyst', 'manager', 'architect', 'devops', 'sre', 'qa', 'scientist'];

    const userIsLookingForStopWord = targetRoles.some(r =>
        universalStopWords.some(sw => r.toLowerCase().includes(sw.split(' ')[0]))
    );

    if (!userIsLookingForStopWord) {
        const hasStopWord = universalStopWords.some(sw => t.includes(sw));
        const hasTechKeyword = techRoles.some(tk => t.includes(tk));

        if (hasStopWord && !hasTechKeyword) {
            return false;
        }
    }

    // 3. Hard semantic-ish gate: require match against expanded role phrases OR meaningful token overlap.
    const rolePhrases = (expandedRoles && expandedRoles.length > 0 ? expandedRoles : targetRoles)
        .filter(Boolean)
        .slice(0, 40);

    const combined = `${title} ${snippet}`;

    // Common "too generic" tokens that cause false positives across role types.
    const genericRoleTokens = new Set([
        'manager', 'management', 'lead', 'leader', 'specialist', 'associate', 'executive',
        'analyst', 'consultant', 'officer', 'director', 'head', 'principal', 'senior', 'sr', 'jr', 'staff',
        'intern', 'internship', 'contract', 'fulltime', 'full', 'time', 'part', 'remote', 'hybrid', 'onsite', 'on', 'site'
    ]);

    // If we can match a concrete expanded role phrase, accept immediately.
    if (rolePhrases.length > 0 && hasAnyPhrase(title, rolePhrases)) {
        return true;
    }

    // Otherwise, fall back to token overlap with non-generic tokens.
    const significantTokens = new Set<string>();
    rolePhrases.forEach(role => {
        tokenize(role).forEach(word => {
            if (word.length >= 3 && !genericRoleTokens.has(word)) significantTokens.add(word);
        });
    });

    if (significantTokens.size === 0) return true;

    // LEADERSHIP BYPASS
    // If user's target roles contain leadership keywords, and the job title contains leadership keywords, we drop the exact token matching requirement to avoid dropping specialized variations (e.g. "Head of AI" vs "Principal ML Director").
    const leadershipTokens = ['head', 'director', 'vp', 'vice president', 'principal', 'chief', 'founder'];
    const userWantsLeadership = targetRoles.some(r => leadershipTokens.some(lt => r.toLowerCase().includes(lt)));
    const jobIsLeadership = leadershipTokens.some(lt => t.includes(lt));
    
    if (userWantsLeadership && jobIsLeadership) {
        return true; 
    }

    const allWords = [...tokenize(title), ...tokenize(snippet)];
    const overlapCount = allWords.reduce((acc, w) => acc + (significantTokens.has(w) ? 1 : 0), 0);
    if (overlapCount === 0) return false;

    return true;
}

/**
 * STRICT LOCATION ADHERENCE (Phase 2)
 * Applies a hard filter before LLM scoring.
 */
const passesLocationGuard = (item: RawSignal, config: any): boolean => {
    const workMode: string = (config?.work_mode || 'any').toLowerCase();
    const userLocs: string[] = [
        ...(config?.expanded_locations?.length ? config.expanded_locations : []),
        ...(config?.locations || [])
    ].filter(Boolean);

    // No location preference => accept (unless work_mode enforces remote/hybrid/onsite).
    const userHasLocConstraint = userLocs.length > 0;

    const flexibleSignals = ['flexible', 'anywhere', 'worldwide', 'global', 'any'];
    const isFlexible = userLocs.some(l => flexibleSignals.some(sig => normalizeForMatch(l).includes(sig)));

    const locRaw = item.location || '';
    const combined = `${item.title} ${item.snippet} ${locRaw} ${item.url}`;
    const combinedN = normalizeForMatch(combined);

    const hasRemote = /\b(remote|work from home|wfh|distributed|virtual)\b/i.test(combined);
    const hasHybrid = /\b(hybrid)\b/i.test(combined);
    const hasOnsite = /\b(on[-\s]?site|in[-\s]?office|in office|office[-\s]?based)\b/i.test(combined);

    // Work mode is always treated as strict (per Phase 2).
    if (workMode === 'remote') {
        if (!hasRemote) return false;
        if (config?.remote_base_country) {
            const base = normalizeForMatch(config.remote_base_country);
            const restricted = /\b(us only|usa only|uk only|eu only|canada only|india only|germany only)\b/i.test(combined);
            if (restricted && !combinedN.includes(base)) return false;
        }
        return true;
    }

    if (workMode === 'hybrid') {
        if (!hasHybrid) return false;
        // Also require a location match unless user explicitly flexible.
        if (!userHasLocConstraint || isFlexible) return true;
    }

    if (workMode === 'onsite') {
        if (!hasOnsite) return false;
        if (!userHasLocConstraint || isFlexible) return true;
    }

    // If user has no location constraints and work_mode is 'any', accept.
    if (!userHasLocConstraint) return true;
    if (isFlexible) return true;

    // If user explicitly wants remote via locations list, allow remote.
    const userWantsRemoteViaLoc = userLocs.some(l => normalizeForMatch(l).includes('remote'));
    if (userWantsRemoteViaLoc && hasRemote) return true;

    // Otherwise require that at least one user location appears in the combined text.
    // We match phrases (city/country names) rather than individual tokens to reduce false positives.
    const match = userLocs.some(l => {
        const ll = normalizeForMatch(l);
        if (!ll || ll === 'remote') return false;
        // Avoid matching tiny tokens like "in"
        if (ll.length < 3) return false;
        return combinedN.includes(ll);
    });

    return match;
};

/**
 * INTELLIGENT LOCATION NORMALIZATION
 * Basic cleanup only. The AI now handles dynamic expansion in `expandLocations`.
 */
const normalizeLocationInput = (input: string): string => {
    const raw = input.trim();
    if (!raw) return "";

    // Split CamelCase (e.g. "HongKong" -> "Hong Kong") to ensure basic readability
    const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2');

    // We quote it to be safe, but the heavy lifting is done by the expanded list.
    return `"${spaced}"`;
}

export interface BuiltQueries {
    highSignal: { name: string; q: string; tbs?: string }[];
    expansion: { name: string; q: string; tbs?: string }[];
}

export const buildSearchQueries = (config: any): BuiltQueries => {
    if (!config || !config.target_roles) {
        throw new Error("Search Configuration is missing.");
    }

    // MAP LOOKBACK TO API TBS
    const lookbackRaw = config.search_lookback || '14d';
    let tbs = 'qdr:w';
    if (lookbackRaw === '24h') tbs = 'qdr:d';
    if (lookbackRaw === '7d' || lookbackRaw === '14d') tbs = 'qdr:w';
    if (lookbackRaw === '30d') tbs = 'qdr:m';

    // Basic Negative Filters
    const baseNegatives = ['-intitle:resume', '-intitle:cv', '-inurl:blog'];
    const userNegatives = (config.avoid_keywords || []).map((k: string) => `-"${k}"`);
    const negativeFilters = [...baseNegatives, ...userNegatives].join(' ');

    // SMART LOCATION INJECTION
    let locationsQuery = '';
    if (config.expanded_locations && config.expanded_locations.length > 0) {
        locationsQuery = `(${config.expanded_locations.map((l: string) => `"${l}"`).join(' OR ')})`;
    } else if (config.locations && config.locations.length > 0) {
        locationsQuery = `(${config.locations.map(normalizeLocationInput).join(' OR ')})`;
    }

    const industriesQuery = config.industries && config.industries.length > 0
        ? `(${config.industries.map((i: string) => `"${i}"`).join(' OR ')})`
        : '';

    // WORK MODE INJECTION
    let workModeQuery = '';
    if (config.work_mode === 'remote') {
        workModeQuery = '("remote" OR "work from home" OR "distributed" OR "work from anywhere")';
        if (config.remote_base_country) {
            workModeQuery += ` "${config.remote_base_country}"`;
        }
    } else if (config.work_mode === 'hybrid') {
        workModeQuery = '"hybrid"';
    } else if (config.work_mode === 'onsite') {
        workModeQuery = '("onsite" OR "in-office" OR "on-site")';
    }

    const highSignal: { name: string, q: string, tbs?: string }[] = [];
    const expansion: { name: string, q: string, tbs?: string }[] = [];
    
    // Cap to top 3 roles to prevent API explosion in discovery. 
    // The full expanded list is still used perfectly for semantic filtering downstream.
    const queryRoles = (config.target_roles || []).slice(0, 3);

    const atsTargets = getATSTargets();
    const atsQueryPart = atsTargets.map(t => `site:${t}`).join(' OR ');

    // ATOMIC ROLE QUERIES: Instead of massive OR clusters, we create specific queries per role.
    queryRoles.forEach((role: string) => {
        const suffix = ` - ${role}`;

        // 1. ATS Direct (Strict) - high signal
        highSignal.push({
            name: `ATS Direct${suffix}`,
            q: `(${atsQueryPart}) "${role}" ${industriesQuery} ${locationsQuery} ${workModeQuery} ${negativeFilters}`,
            tbs
        });

        // 2. Deep LinkedIn (Strict) - high signal
        highSignal.push({
            name: `LinkedIn${suffix}`,
            q: `site:linkedin.com/jobs/view "${role}" ${industriesQuery} ${locationsQuery} ${workModeQuery} ${negativeFilters}`,
            tbs
        });

        // 3. Dynamic Regional Portals (Loose - For Local Language Support)
        if (config.regional_boards && config.regional_boards.length > 0) {
            const siteOperators = config.regional_boards.map((domain: string) => `site:${domain}`).join(' OR ');
            expansion.push({
                name: `Regional Portals${suffix}`,
                q: `(${siteOperators}) "${role}" ${locationsQuery} ${workModeQuery} ${negativeFilters}`,
                tbs
            });
        }

        // 4. Broad Web (Loose - For Synonym Matching) - expansion tier
        expansion.push({
            name: `Web Discovery${suffix}`,
            q: `(site:careers.* OR site:jobs.* OR site:join.*) -site:linkedin.com "${role}" ${industriesQuery} ${locationsQuery} ${workModeQuery} "apply" ${negativeFilters}`,
            tbs
        });
    });

    return { highSignal, expansion };
};

// India location detection helper
const INDIA_KEYWORDS = [
    'india', 'bengaluru', 'bangalore', 'mumbai', 'hyderabad', 'pune',
    'delhi', 'chennai', 'bhubaneswar', 'gurugram', 'noida', 'kolkata',
    'remote india', 'gurgaon', 'new delhi'
];

const hasIndiaLocation = (config: any): boolean => {
    const allLocs: string[] = [
        ...(config.locations || []),
        ...(config.expanded_locations || [])
    ];
    return allLocs.some(loc => 
        INDIA_KEYWORDS.some(kw => loc.toLowerCase().includes(kw))
    );
};

const buildIndiaQueries = (config: any, tbs: string): { name: string; q: string; tbs?: string }[] => {
    const queries: { name: string; q: string; tbs?: string }[] = [];
    const queryRoles = (config.target_roles || []).slice(0, 3);
    const negativeFilters = ['-internship', '-fresher', '-intitle:resume', '-intitle:cv'];
    const negs = negativeFilters.join(' ');

    // India-specific locations
    const indiaLocs = (config.expanded_locations || config.locations || [])
        .filter((loc: string) => INDIA_KEYWORDS.some(kw => loc.toLowerCase().includes(kw)))
        .slice(0, 3);
    const locPart = indiaLocs.length > 0 
        ? indiaLocs.map((l: string) => `"${l}"`).join(' OR ') 
        : '"India"';

    queryRoles.forEach((role: string) => {
        const suffix = ` - ${role}`;

        queries.push({
            name: `Naukri${suffix}`,
            q: `site:naukri.com "${role}" (${locPart}) ${negs}`,
            tbs
        });
        queries.push({
            name: `iimjobs${suffix}`,
            q: `site:iimjobs.com "${role}" (${locPart}) ${negs}`,
            tbs
        });
        queries.push({
            name: `Indeed India${suffix}`,
            q: `site:in.indeed.com "${role}" (${locPart}) ${negs}`,
            tbs
        });
    });

    return queries;
};

export const searchForSignals = async (
    config: any, 
    onLog: LogCallback, 
    onProgress?: ProgressCallback,
    signal?: AbortSignal
): Promise<RawSignal[]> => {
    const serperKey = getKey(STORAGE_KEYS.SERPER_KEY);
    if (!serperKey) throw new Error("Serper Key missing.");

    const { highSignal, expansion } = buildSearchQueries(config);
    const depthMode = config.search_depth || 'standard';
    const pages = depthMode === 'comprehensive' ? 4 : depthMode === 'deep' ? 2 : 1;

    onLog(`Configuration: Depth=${depthMode.toUpperCase()} (${pages} pages/cluster)`, 'info');
    if (config.regional_boards?.length > 0) {
        onLog(`Regional Satellites Active: ${config.regional_boards.join(', ')}`, 'success');
    }

    onLog(`Initializing Search: ${highSignal.length + expansion.length} clusters x ${pages} pages...`, 'info');

    let foundCount = 0;
    let filteredCount = 0;

    const updateProgress = (q?: string) => {
        if (onProgress) onProgress({ found: foundCount, filtered: filteredCount, currentQuery: q });
    };

    // 1. STANDARD SEARCH TASKS
    const tasksHigh: { q: any, page: number }[] = [];
    highSignal.forEach(q => {
        for (let i = 0; i < pages; i++) tasksHigh.push({ q, page: i });
    });

    const tasksExpansion: { q: any, page: number }[] = [];
    expansion.forEach(q => {
        for (let i = 0; i < pages; i++) tasksExpansion.push({ q, page: i });
    });

    // 2. JOBS API TASKS (NEW: High Signal)
    // Runs once for each Role x Location combination
    // Query format: "${role} jobs in ${location}"
    const jobsTasks: string[] = [];
    const MAX_JOBS_LOCATIONS = 5;
    const expandedLocs = config.expanded_locations?.length > 0
        ? config.expanded_locations
        : (config.locations?.length > 0 ? config.locations : [""]);
    const locs = expandedLocs.slice(0, MAX_JOBS_LOCATIONS); // Prefer expanded locations but cap count
    const queryRoles = (config.target_roles || []).slice(0, 3);
    queryRoles.forEach((role: string) => {
        locs.forEach((loc: string) => {
            jobsTasks.push(`${role} jobs ${loc ? `in ${loc}` : ''}`);
        });
    });

    const searchLimit = pLimit(3);
    let rawResults: RawSignal[] = [];

    // Helper functions for unified rate limiting
    const processStandardSearch = async (task: any, defaultSource: string): Promise<RawSignal[]> => {
        if (signal?.aborted) return [];
        // Add minimal 500ms delay inside queue before firing to smooth out rate caps
        await new Promise(r => setTimeout(r, 500));
        try {
            const qStr = typeof task.q === 'object' ? task.q.q : task.q;
            const tbsStr = typeof task.q === 'object' ? task.q.tbs : task.tbs;
            const nameStr = typeof task.q === 'object' ? task.q.name : task.name;
            const pageOffset = (task.page || 0) * 20;

            const res = await searchLimit(() => performSerperSearch(serperKey, qStr, pageOffset, tbsStr));
            const mapped = res.map((r: any, idx: number) => ({
                id: `sig_${Date.now()}_${Math.random().toString(36).substr(2)}_${idx}`,
                source: nameStr || defaultSource,
                url: r.link,
                title: r.title,
                snippet: r.snippet,
                clean_snippet: cleanSnippet(r.snippet),
                timestamp: r.date || new Date().toISOString(),
                metadata: { query: qStr, rank: idx }
            }));
            
            foundCount += mapped.length;
            updateProgress(qStr);
            return mapped;
        } catch { return []; }
    };

    const processJobsApiSearch = async (query: string): Promise<RawSignal[]> => {
        if (signal?.aborted) return [];
        await new Promise(r => setTimeout(r, 500));
        try {
            const res = await searchLimit(() => performSerperJobsSearch(serperKey, query));
            const mapped = res.map((r: any, idx: number) => ({
                id: `job_${Date.now()}_${Math.random().toString(36).substr(2)}_${idx}`,
                source: 'Google Jobs API',
                url: r.link,
                title: r.title,
                snippet: r.snippet,
                clean_snippet: cleanSnippet(r.snippet),
                timestamp: r.date || new Date().toISOString(),
                company: r.company,
                location: r.location,
                salary: r.salary,
                metadata: { query: query, rank: idx }
            }));

            foundCount += mapped.length;
            updateProgress(query);
            return mapped;
        } catch { return []; }
    };

    // 1. HIGH SIGNAL CLUSTER
    const highSignalPromises = tasksHigh.map(t => processStandardSearch(t, "High Signal"));

    // 2. INDIA BOARDS CLUSTER
    const indiaDetected = hasIndiaLocation(config);
    let indiaPromises: Promise<RawSignal[]>[] = [];
    if (indiaDetected) {
        const lookbackRaw = config.search_lookback || '14d';
        let tbs = 'qdr:w';
        if (lookbackRaw === '24h') tbs = 'qdr:d';
        if (lookbackRaw === '7d' || lookbackRaw === '14d') tbs = 'qdr:w';
        if (lookbackRaw === '30d') tbs = 'qdr:m';
        const indiaQueries = buildIndiaQueries(config, tbs);

        onLog(`India Boards Active: Searching Naukri, iimjobs, Indeed India (${indiaQueries.length} queries)...`, 'success');
        indiaPromises = indiaQueries.map(q => processStandardSearch(q, "India Boards"));
    }

    // 3. GOOGLE JOBS API CLUSTER
    let jobsApiPromises: Promise<RawSignal[]>[] = [];
    if (jobsTasks.length > 0) {
        onLog(`Checking Google Jobs API for ${jobsTasks.length} targeted queries...`, 'info');
        jobsApiPromises = jobsTasks.map(q => processJobsApiSearch(q));
    }

    // AWAIT ALL CLUSTERS SIMULTANEOUSLY (Managed purely by pLimit(5))
    const clusters = await Promise.all([
        Promise.all(highSignalPromises),
        Promise.all(indiaPromises),
        Promise.all(jobsApiPromises)
    ]);

    clusters.forEach(clusterResults => {
        clusterResults.forEach(batch => rawResults.push(...batch));
    });

    // 4. EXPANSION CLUSTER (Conditional Fallback)
    const MIN_SIGNALS_FOR_SKIP = 60;
    if (!signal?.aborted && rawResults.length < MIN_SIGNALS_FOR_SKIP && tasksExpansion.length > 0) {
        onLog(`High-signal sources yielded ${rawResults.length} results, dynamically expanding to regional/web clusters...`, 'info');
        
        const expansionPromises = tasksExpansion.map(t => processStandardSearch(t, "Expansion"));
        const expansionResults = await Promise.all(expansionPromises);
        
        expansionResults.forEach(batch => rawResults.push(...batch));
    }

    // --- FILTERING & DEDUPLICATION STRATEGY ---

    const fingerprintMap = new Map<string, RawSignal>();
    let duplicates = 0;
    let rejectedByGuard = 0;

    const GLOBAL_SPAM_BLOCKLIST = [
        'turing', 'bairesdev', 'crossover', 'cybercoders', 'canonical', 
        'devsdata', 'optym', 'toptal', 'andela', 'dice.com', 'insight global'
    ];

    rawResults.forEach(item => {
        // 0. SPAM GUARD
        const itemStr = `${item.url} ${item.title} ${item.company || ''}`.toLowerCase();
        if (GLOBAL_SPAM_BLOCKLIST.some(spam => itemStr.includes(spam))) {
            rejectedByGuard++;
            filteredCount++;
            return;
        }

        // 1. Basic URL Check
        if (!isHighQualityJobLink(item.url)) return;

        // 2. THE BOUNCER (Layer 2 - Guard)
        if (!passesRoleGuard(item.title, item.snippet, config.target_roles, config.expanded_roles)) {
            rejectedByGuard++;
            filteredCount++;
            return;
        }

        // 3. STRICT LOCATION ADHERENCE (Phase 2)
        if (!passesLocationGuard(item, config)) {
            rejectedByGuard++;
            filteredCount++;
            return;
        }

        const fingerprint = generateFingerprint(item);
        const existing = fingerprintMap.get(fingerprint);

        const scoreNew = getSourceAuthority(item.url, item.snippet, config.regional_boards);

        if (existing) {
            const scoreOld = getSourceAuthority(existing.url, existing.snippet, config.regional_boards);
            // Bias towards Jobs API if existing wasn't
            const isJobsApiNew = item.source === 'Google Jobs API';
            const isJobsApiOld = existing.source === 'Google Jobs API';

            if (isJobsApiNew && !isJobsApiOld) {
                fingerprintMap.set(fingerprint, item);
            } else if (scoreNew > scoreOld && !isJobsApiOld) {
                fingerprintMap.set(fingerprint, item);
            }
            duplicates++;
        } else {
            fingerprintMap.set(fingerprint, item);
        }
    });

    updateProgress();

    const unique = Array.from(fingerprintMap.values());
    onLog(`Analysis: Found ${rawResults.length} raw signals.`, 'info');
    onLog(`Filtration: Removed ${duplicates} duplicates and ${rejectedByGuard} obvious mismatches.`, 'success');

    return unique;
};

// Company news enrichment for top leads
import type { ScoredLead } from './scoring';

export const enrichLeadsWithCompanyNews = async (
    leads: ScoredLead[],
    serperKey: string
): Promise<ScoredLead[]> => {
    const topLeads = leads
        .filter(l => l.score >= 70)
        .slice(0, 10);

    if (topLeads.length === 0) return leads;

    const enriched = [...leads];
    const companySet = new Set<string>();

    for (const lead of topLeads) {
        if (companySet.has(lead.company_name)) continue;
        companySet.add(lead.company_name);

        try {
            const news = await fetchCompanyNews(serperKey, lead.company_name);
            if (news) {
                // Apply to all leads from this company
                enriched.forEach(l => {
                    if (l.company_name === lead.company_name) {
                        l.company_news = news;
                    }
                });
            }
        } catch {
            // Non-critical, skip
        }

        // 300ms stagger to avoid rate limits
        await new Promise(r => setTimeout(r, 300));
    }

    return enriched;
};