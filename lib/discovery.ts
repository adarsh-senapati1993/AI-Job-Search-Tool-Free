import { performSerperSearch } from './serper';
import { getKey, STORAGE_KEYS } from './storage';

export interface RawSignal {
  id: string;
  source: string;
  url: string;
  title: string;
  snippet: string;
  timestamp: string;
  metadata?: {
      query: string;
      rank: number;
  }
}

type LogCallback = (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

// --- CONSTANTS FOR VISIBILITY & DENSITY ---
export const GLOBAL_ATS_TARGETS = [
    'boards.greenhouse.io',
    'jobs.lever.co',
    'jobs.ashbyhq.com',
    'myworkdayjobs.com',
    'jobs.smartrecruiters.com',
    'apply.workable.com',
    'breezy.hr',
    'careers.jobscore.com'
];

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
 */
const getSourceAuthority = (url: string, snippet: string, regionalBoards: string[] = []): number => {
    const u = url.toLowerCase();
    let score = 1;
    // Rank 3: Direct ATS (Source of Truth - Highest Priority)
    if (GLOBAL_ATS_TARGETS.some(ats => u.includes(ats.replace('boards.', '').replace('jobs.', '')))) score = 10;
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
             return parts[parts.length - 1];
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

const normalizeString = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

const extractTeamContext = (text: string): string => {
    const teams = ['payments', 'infrastructure', 'infra', 'growth', 'platform', 'security', 'trust', 'data', 'ml', 'ai', 'mobile', 'web', 'backend', 'frontend', 'fullstack', 'consumer', 'enterprise', 'b2b', 'b2c'];
    const lower = text.toLowerCase();
    return teams.find(t => lower.includes(t)) || '';
};

/**
 * Creates a semantic fingerprint.
 * IMPROVED V2: Includes Team Context & Snippet Hash to reduce collisions.
 */
const generateFingerprint = (item: RawSignal): string => {
    let company = extractCompanyFromUrl(item.url);
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
        } catch(e) { 
            company = 'unknown'; 
        }
    }
    
    // Normalize Company Name (e.g. "Stripe Inc" -> "stripe")
    const cleanCompany = normalizeString(company || 'unknown');

    // 1. Deterministic ID Check (The Gold Standard)
    const jobId = extractJobId(item.url);
    if (jobId) {
        // ID:stripe:123456
        return `ID:${cleanCompany}:${jobId}`;
    }

    // 2. Fuzzy Matching V2 (The "Collision" Fix)
    // "Senior Product Manager" -> "seniorproductmanager"
    let title = normalizeString(item.title);
    
    // Remove "at Company" from title for hash if present
    if (company && title.includes(cleanCompany)) {
        title = title.replace(cleanCompany, '');
    }

    // Extract Context (Team/Dept) to differentiate "Stripe PM (Payments)" from "Stripe PM (Growth)"
    const team = extractTeamContext(item.title) || extractTeamContext(item.snippet);
    
    // Include snippet start to handle cases where titles are identical but descriptions differ
    const snippetHash = item.snippet.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '');

    // Hash the combination
    return `FUZZY_V2:${cleanCompany}:${title.slice(0, 15)}:${team}:${snippetHash}`;
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
        if (path.includes('/search') && !hostname.includes('linkedin.com')) return false; // LinkedIn search links can be valid specific queries
        if (path.includes('/tags/') || path.includes('/category/') || path.includes('/archive/')) return false; 
        if (path.includes('/blog/') || path.includes('/news/')) return false;

        // TARGETED: LinkedIn
        if (hostname.includes('linkedin.com')) {
            if (path.includes('/jobs/view/') || path.includes('/jobs/collections/')) return true;
            if (path.includes('/jobs/search') && search.includes('currentjobid=')) return true;
            return false;
        }
        
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * CLIENT-SIDE "BOUNCER" (Layer 2)
 * PERMISSIVE MODE: Blocks only obvious nonsense. Leaves nuanced decisions to the AI Scorer.
 */
const passesRoleGuard = (title: string, snippet: string, targetRoles: string[]): boolean => {
    const t = title.toLowerCase();
    
    // 1. Safe Pass: Generic Titles
    if (t.includes('careers') || t.includes('jobs at') || t.includes('join our team') || t.includes('openings')) {
        return true;
    }

    // 2. Obvious Stop Words Check
    // We only block these if the user is NOT explicitly looking for them.
    const stopWords = ['account executive', 'sales representative', 'customer support', 'recruiter', 'hr manager', 'legal counsel'];
    const userIsLookingForStopWord = targetRoles.some(r => stopWords.some(sw => r.toLowerCase().includes(sw)));
    
    if (!userIsLookingForStopWord) {
        if (stopWords.some(sw => t.includes(sw))) return false;
    }

    // 3. Minimum Viable Relevance (Fuzzy Token Overlap)
    // At least ONE meaningful word from the target roles must appear.
    // e.g. If target is "Product Manager", we need "Product" OR "Manager". 
    // This blocks "Janitor" but allows "Product Marketing Manager".
    const significantTokens = new Set<string>();
    targetRoles.forEach(role => {
        role.toLowerCase().split(/[\s/-]/).forEach(word => {
            if (word.length > 3 && word !== 'senior' && word !== 'lead' && word !== 'junior' && word !== 'staff') {
                significantTokens.add(word);
            }
        });
    });

    // If no significant tokens found in target (rare), just pass it.
    if (significantTokens.size === 0) return true;

    const titleWords = t.split(/[\s/-]/);
    const hasOverlap = titleWords.some(word => significantTokens.has(word));
    
    return hasOverlap;
}

/**
 * INTELLIGENT LOCATION NORMALIZATION (The Fix for "HongKong" vs "Hong Kong")
 * Creates a "synonym net" for locations to catch variations, typos, and abbreviations.
 */
const normalizeLocationInput = (input: string): string => {
    const raw = input.trim();
    if (!raw) return "";

    // 1. Split CamelCase (e.g. "HongKong" -> "Hong Kong")
    const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2');
    
    const set = new Set([raw, spaced]);
    const lower = spaced.toLowerCase();

    // 2. Common Global Abbreviations Dictionary
    if (lower.includes('hong kong')) set.add('HK');
    if (lower.includes('united states') || lower === 'us') set.add('USA');
    if (lower.includes('united kingdom') || lower === 'uk') set.add('UK');
    if (lower.includes('san francisco')) set.add('SF');
    if (lower.includes('new york')) set.add('NYC');
    if (lower.includes('kuala lumpur')) set.add('KL');
    if (lower.includes('bengaluru')) set.add('Bangalore');
    if (lower.includes('ho chi minh')) set.add('HCMC');
    if (lower.includes('united arab emirates')) set.add('UAE');

    // 3. Construct Boolean OR Query
    const terms = Array.from(set).filter(s => s.length > 0).map(s => `"${s}"`);
    return `(${terms.join(' OR ')})`;
}

export const buildSearchQueries = (config: any) => {
    if (!config || !config.target_roles) {
        throw new Error("Search Configuration is missing.");
    }

    const lookbackRaw = config.search_lookback || '14d';
    const lookbackDays = parseInt(lookbackRaw.replace(/\D/g, '')) || 14;
    const now = new Date();
    const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - lookbackDays));
    const dateStr = cutoffDate.toISOString().split('T')[0];

    // Basic Negative Filters
    const baseNegatives = ['-intitle:resume', '-intitle:cv', '-inurl:blog'];
    const userNegatives = (config.avoid_keywords || []).map((k: string) => `-"${k}"`);
    const negativeFilters = [...baseNegatives, ...userNegatives].join(' ');
    
    // SMART LOCATION INJECTION (Using Normalizer)
    const locationsQuery = config.locations.length > 0 
      ? `(${config.locations.map(normalizeLocationInput).join(' OR ')})`
      : '';
      
    const industriesQuery = config.industries && config.industries.length > 0
      ? `(${config.industries.map((i: string) => `"${i}"`).join(' OR ')})`
      : '';
      
    const queries: { name: string, q: string }[] = [];
    const ROLE_CHUNK_SIZE = 4;
    const roles = config.target_roles;

    const atsQueryPart = GLOBAL_ATS_TARGETS.map(t => `site:${t}`).join(' OR ');

    for (let i = 0; i < roles.length; i += ROLE_CHUNK_SIZE) {
        const chunk = roles.slice(i, i + ROLE_CHUNK_SIZE);
        const roleQuery = `(${chunk.map((r: string) => `"${r}"`).join(' OR ')})`;
        const suffix = roles.length > 4 ? ` (Batch ${Math.floor(i/ROLE_CHUNK_SIZE) + 1})` : '';

        // 1. ATS Direct (High Signal)
        queries.push({ 
            name: `ATS Direct${suffix}`, 
            q: `${atsQueryPart} ${roleQuery} ${industriesQuery} ${locationsQuery} ${negativeFilters} after:${dateStr}` 
        });
        
        // 2. Deep LinkedIn
        queries.push({ 
            name: `LinkedIn${suffix}`, 
            q: `site:linkedin.com/jobs/view ${roleQuery} ${industriesQuery} ${locationsQuery} ${negativeFilters} after:${dateStr}` 
        });
        
        // 3. Dynamic Regional Portals
        if (config.regional_boards && config.regional_boards.length > 0) {
            const siteOperators = config.regional_boards.map((domain: string) => `site:${domain}`).join(' OR ');
            queries.push({ 
                name: `Regional Portals${suffix}`, 
                q: `(${siteOperators}) ${roleQuery} ${locationsQuery} ${negativeFilters} after:${dateStr}` 
            });
        }
        
        // 4. Broad Web
        queries.push({ 
            name: `Web Discovery${suffix}`, 
            q: `(site:careers.* OR site:jobs.* OR site:join.*) -site:linkedin.com ${roleQuery} ${industriesQuery} ${locationsQuery} "apply" ${negativeFilters} after:${dateStr}` 
        });
    }

    return queries;
};

export const searchForSignals = async (config: any, onLog: LogCallback, signal?: AbortSignal): Promise<RawSignal[]> => {
  const serperKey = getKey(STORAGE_KEYS.SERPER_KEY);
  if (!serperKey) throw new Error("Serper Key missing.");

  const queries = buildSearchQueries(config);
  const depthMode = config.search_depth || 'standard';
  const pages = depthMode === 'comprehensive' ? 4 : depthMode === 'deep' ? 2 : 1;

  onLog(`Configuration: Depth=${depthMode.toUpperCase()} (${pages} pages/cluster)`, 'info');
  if (config.regional_boards?.length > 0) {
      onLog(`Regional Satellites Active: ${config.regional_boards.join(', ')}`, 'success');
  }
  
  onLog(`Initializing Search: ${queries.length} clusters x ${pages} pages...`, 'info');

  const tasks: { q: any, page: number }[] = [];
  queries.forEach(q => {
      for (let i = 0; i < pages; i++) tasks.push({ q, page: i });
  });

  const BATCH_SIZE = 8; 
  let rawResults: RawSignal[] = [];

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      if (signal?.aborted) break;
      const batch = tasks.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(task => {
          return performSerperSearch(serperKey, task.q.q, task.page * 20)
              .then(res => res.map((r: any, idx: number) => ({
                 id: `sig_${Date.now()}_${i}_${idx}`,
                 source: task.q.name,
                 url: r.link,
                 title: r.title,
                 snippet: r.snippet,
                 timestamp: r.date || new Date().toISOString(),
                 metadata: { query: task.q.q, rank: idx }
              })))
              .catch(() => []);
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(res => rawResults.push(...res));
      await new Promise(r => setTimeout(r, 200)); 
  }

  // --- FILTERING & DEDUPLICATION STRATEGY ---
  
  const fingerprintMap = new Map<string, RawSignal>();
  let duplicates = 0;
  let rejectedByGuard = 0;

  rawResults.forEach(item => {
      // 1. Basic URL Check
      if (!isHighQualityJobLink(item.url)) return;

      // 2. THE BOUNCER (Layer 2)
      if (!passesRoleGuard(item.title, item.snippet, config.target_roles)) {
          rejectedByGuard++;
          return;
      }
      
      const fingerprint = generateFingerprint(item);
      const existing = fingerprintMap.get(fingerprint);
      
      const scoreNew = getSourceAuthority(item.url, item.snippet, config.regional_boards);
      
      if (existing) {
          const scoreOld = getSourceAuthority(existing.url, existing.snippet, config.regional_boards);
          if (scoreNew > scoreOld) {
              fingerprintMap.set(fingerprint, item);
          }
          duplicates++;
      } else {
          fingerprintMap.set(fingerprint, item);
      }
  });

  const unique = Array.from(fingerprintMap.values());
  onLog(`Analysis: Found ${rawResults.length} raw signals.`, 'info');
  onLog(`Filtration: Removed ${duplicates} duplicates and ${rejectedByGuard} obvious mismatches.`, 'success');
  
  return unique;
};