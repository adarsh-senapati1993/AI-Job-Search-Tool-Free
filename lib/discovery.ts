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

// --- GEOGRAPHIC INTELLIGENCE ---
// Maps keywords in location strings to specific local job boards
const REGION_BOARDS: Record<string, string> = {
    // INDIA
    'india': 'site:naukri.com/job-listings OR site:instahyre.com/job-functions OR site:hirist.com OR site:foundit.in',
    'bengaluru': 'site:naukri.com/job-listings OR site:instahyre.com',
    'bangalore': 'site:naukri.com/job-listings OR site:instahyre.com',
    'delhi': 'site:naukri.com/job-listings',
    'mumbai': 'site:naukri.com/job-listings',
    'gurgaon': 'site:naukri.com/job-listings',
    'hyderabad': 'site:naukri.com/job-listings',

    // MENA (Middle East)
    'dubai': 'site:naukrigulf.com OR site:bayt.com OR site:gulftalent.com',
    'uae': 'site:naukrigulf.com OR site:bayt.com',
    'riyadh': 'site:naukrigulf.com OR site:bayt.com',
    'saudi': 'site:naukrigulf.com OR site:bayt.com',

    // APAC
    'japan': 'site:wantedly.com OR site:doda.jp OR site:daijob.com',
    'tokyo': 'site:wantedly.com OR site:doda.jp',
    'singapore': 'site:nodeflair.com OR site:techinasia.com/jobs OR site:jobstreet.com.sg',
    
    // EUROPE
    'berlin': 'site:xing.com/jobs OR site:germantechjobs.de',
    'germany': 'site:xing.com/jobs',
    'uk': 'site:reed.co.uk OR site:cwjobs.co.uk',
    'london': 'site:reed.co.uk',

    // REMOTE SPECIALTY
    'remote': 'site:weworkremotely.com OR site:remoteok.com OR site:wellfound.com/jobs OR site:himalayas.app'
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Centralized Logic to extract Company Name from URL
export const extractCompanyFromUrl = (url: string): string | null => {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const path = u.pathname;

        // 1. ATS Systems (High Confidence)
        if (host.includes('greenhouse.io') || host.includes('lever.co') || host.includes('ashbyhq.com') || host.includes('workable.com')) {
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

/**
 * Assigns a quality score to the source URL.
 * Higher is better. Used to resolve duplicates.
 */
const getSourceAuthority = (url: string, snippet: string): number => {
    const u = url.toLowerCase();
    let score = 1;
    // Rank 3: Direct ATS (Source of Truth)
    if (u.includes('greenhouse.io') || u.includes('lever.co') || u.includes('ashbyhq.com') || u.includes('workable.com') || u.includes('myworkdayjobs.com')) score = 3;
    // Rank 2: High Quality Platforms (Deep Links)
    else if (u.includes('linkedin.com') || u.includes('wellfound.com') || u.includes('ycombinator.com')) score = 2;
    
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
 * Creates a semantic fingerprint: "company:normalized_title:team"
 * e.g. "lenskart:seniorproductmanager:payments"
 */
const generateFingerprint = (item: RawSignal): string => {
    let company = extractCompanyFromUrl(item.url);
    if (!company) {
        try { 
            const hostname = new URL(item.url).hostname;
            company = hostname.replace('www.', '').split('.')[0]; 
        } catch(e) { 
            company = 'unknown'; 
        }
    }
    
    // Normalize Title
    let title = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Extract Team/Context (e.g. "Payments", "Platform") to differentiate roles
    const teamMatch = item.title.match(/\b(Payments|Platform|Infrastructure|Growth|Data|Backend|Frontend|Mobile)\b/i);
    const team = teamMatch ? teamMatch[0].toLowerCase() : 'gen';

    // Snippet Hash (First 40 chars)
    const snippetHash = item.snippet.slice(0, 40).replace(/\s/g, '').toLowerCase();
    
    return `${company?.toLowerCase()}:${title}:${team}:${snippetHash}`;
};

// --- STRATEGY: URL VALIDATOR ---
// Enforces "Deep Link" quality. Rejects generic search pages to ensure functional Apply links.
const isHighQualityJobLink = (url: string): boolean => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();
        const search = u.search.toLowerCase();
        const hostname = u.hostname.toLowerCase();
        
        // 1. REJECT: Generic Search/Listings/Tags/Categories
        if (path === '/' || path === '/jobs' || path === '/jobs/' || path === '/careers' || path === '/careers/') return false;
        if (path.endsWith('/search') || path.endsWith('/search/')) return false;
        
        if (path.includes('/search') && (search.includes('?q=') || search.includes('&q='))) return false;

        if (path.includes('/tags/') || path.includes('/category/') || path.includes('/archive/')) return false; 
        if (path.includes('/blog/') || path.includes('/news/') || path.includes('/articles/') || path.includes('/content/')) return false;

        // 2. TARGETED: LinkedIn
        if (hostname.includes('linkedin.com')) {
            if (path.includes('/jobs/view/') || path.includes('/jobs/collections/')) return true;
            if (path.includes('/jobs/search') && search.includes('currentjobid=')) return true;
            return false;
        }
        
        // 3. TARGETED: Indeed
        if (hostname.includes('indeed.com')) {
             if (!path.includes('/viewjob') && !path.includes('/rc/clk')) return false;
        }

        // 4. TARGETED: ATS Systems
        if (hostname.includes('greenhouse.io') && path.length < 5) return false; 
        if (hostname.includes('lever.co') && path.length < 5) return false;

        return true;
    } catch (e) {
        return false;
    }
}

// --- HARDENED PRE-FILTER LOGIC (Smart Match V2) ---

const CLEAN_REGEX = /[\(\[\{].*?[\)\]\}]/g; // Remove (...) [...]
const SEPARATOR_REGEX = /[\|\-\/\\]/g; // Remove | - / \

const ABBREVIATIONS: Record<string, string> = {
    'sr': 'senior',
    'jr': 'junior',
    'mgr': 'manager',
    'asst': 'assistant',
    'assoc': 'associate',
    'dir': 'director',
    'vp': 'vice president',
    'svp': 'senior vice president',
    'evp': 'executive vice president',
    'pr': 'principal', // Context dependent but helpful
    'tech': 'technical',
    'eng': 'engineer',
    'dev': 'developer',
    'pm': 'product manager'
};

const normalizeJobTitle = (title: string): string => {
    let clean = title.toLowerCase();
    clean = clean.replace(CLEAN_REGEX, ''); // Remove content in parens
    clean = clean.replace(SEPARATOR_REGEX, ' '); // Replace separators with space
    clean = clean.replace(/\b(m\/f\/x|m\/f\/d|f\/m\/d)\b/g, ''); // Remove gender tags
    clean = clean.replace(/[^a-z0-9\s]/g, ''); // Remove other special chars but keep spaces
    
    // Normalize abbreviations (Word by word)
    const words = clean.split(/\s+/).map(w => ABBREVIATIONS[w] || w);
    return words.join(' ').trim();
};

const ANTI_PATTERNS = ["internship", "volunteer", "unpaid", "training program", "bootcamp", "student"];
const JUNIOR_TERMS = ["junior", "associate", "intern", "entry level", "graduate", "trainee", "apprentice"];
const SENIOR_TERMS = ["senior", "staff", "principal", "lead", "head", "director", "vp", "manager"];

const isRoleMatch = (title: string, targetRoles: string[]): boolean => {
    const normalizedTitle = normalizeJobTitle(title);

    // 1. Anti-Pattern Check
    if (ANTI_PATTERNS.some(p => normalizedTitle.includes(p))) return false;

    // 2. Seniority Guardrails
    const userIsTargetingSenior = targetRoles.some(r => SENIOR_TERMS.some(st => r.toLowerCase().includes(st)));
    if (userIsTargetingSenior) {
        if (JUNIOR_TERMS.some(jt => new RegExp(`\\b${jt}\\b`).test(normalizedTitle))) {
            return false;
        }
    }

    // 3. Flexible Matching Strategy
    return targetRoles.some(target => {
        const normalizedTarget = normalizeJobTitle(target);
        
        // Strategy A: Strict Phrase Match (The "Gold Standard")
        // "Senior Product Manager" matches "Senior Product Manager - Payments"
        if (normalizedTitle.includes(normalizedTarget)) return true;

        // Strategy B: Bag of Words (The "Interrupted Phrase" Handler)
        // Enables "Senior Product Manager" to match "Senior Technical Product Manager"
        // OR "Product Manager - Senior"
        const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2); // Only significant words
        
        if (targetWords.length > 1) {
            const allWordsPresent = targetWords.every(w => normalizedTitle.includes(w));
            if (allWordsPresent) return true;
        }

        return false;
    });
};

export const buildSearchQueries = (config: any) => {
    if (!config || !config.target_roles) {
        throw new Error("Search Configuration is missing. Please go to Settings > Profile Config first.");
    }

    const lookbackRaw = config.search_lookback || '14d';
    // UTC Date Fix
    const lookbackDays = parseInt(lookbackRaw.replace(/\D/g, '')) || 14;
    const now = new Date();
    const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - lookbackDays));
    const dateStr = cutoffDate.toISOString().split('T')[0];

    // Negative Filters Injection
    const baseNegatives = ['-intitle:resume', '-intitle:cv', '-inurl:blog', '-inurl:news', '-inurl:article'];
    const userNegatives = (config.avoid_keywords || []).map((k: string) => `-"${k}"`);
    const negativeFilters = [...baseNegatives, ...userNegatives].join(' ');
    
    // Chunk Roles to avoid Query Explosion (Max ~32 words per query)
    const ROLE_CHUNK_SIZE = 5;
    const roleChunks = [];
    const roles = config.target_roles;
    for (let i = 0; i < roles.length; i += ROLE_CHUNK_SIZE) {
        roleChunks.push(roles.slice(i, i + ROLE_CHUNK_SIZE));
    }
    
    const locationsQuery = config.locations.length > 0 
      ? `(${config.locations.map((l: string) => `"${l}"`).join(' OR ')})`
      : '';

    const queries: { name: string, q: string }[] = [];

    // For each chunk of roles, generate the core query clusters
    roleChunks.forEach((chunk, index) => {
        const suffix = roleChunks.length > 1 ? ` (Batch ${index + 1})` : '';
        const rolesQuery = `(${chunk.map((r: string) => `"${r}"`).join(' OR ')})`;

        queries.push({ 
            name: `ATS Direct${suffix}`, 
            q: `site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com OR site:apply.workable.com ${rolesQuery} ${locationsQuery} ${negativeFilters} after:${dateStr}` 
        });
        
        queries.push({ 
            name: `Career Portals${suffix}`, 
            q: `(site:careers.* OR site:jobs.* OR site:join.*) -site:linkedin.com -site:indeed.com ${rolesQuery} ${locationsQuery} "apply" ${negativeFilters} after:${dateStr}` 
        });
        
        queries.push({ 
            name: `LinkedIn Deep${suffix}`, 
            q: `site:linkedin.com/jobs/view ${rolesQuery} ${locationsQuery} ${negativeFilters} after:${dateStr}` 
        });
        
        // Regional boards
        const userLocations = (config.locations || []).map((l: string) => l.toLowerCase());
        const addedBoards = new Set<string>();

        for (const [regionKey, queryPart] of Object.entries(REGION_BOARDS)) {
            if (userLocations.some((ul: string) => ul.includes(regionKey))) {
                if (!addedBoards.has(queryPart)) {
                    queries.push({
                        name: `Regional: ${regionKey.toUpperCase()}${suffix}`,
                        q: `${queryPart} ${rolesQuery} ${negativeFilters} after:${dateStr}`
                    });
                    addedBoards.add(queryPart);
                }
            }
        }
    });

    return queries;
};

const preFilterSignals = (signals: RawSignal[], config: any): RawSignal[] => {
    return signals.filter(signal => {
        // 1. URL Quality Check (Must be a specific job post, not a search page)
        if (!isHighQualityJobLink(signal.url)) return false;

        // 2. Title Match (Heuristic)
        // If strict mode is on or just generally, we want to ensure the title vaguely resembles our target.
        // The isRoleMatch function handles synonyms and seniority logic.
        if (config.target_roles && config.target_roles.length > 0) {
            if (!isRoleMatch(signal.title, config.target_roles)) return false;
        }

        return true;
    });
};

export const searchForSignals = async (config: any, onLog: LogCallback, signal?: AbortSignal): Promise<RawSignal[]> => {
  const serperKey = getKey(STORAGE_KEYS.SERPER_KEY);
  if (!serperKey) throw new Error("Serper Key missing.");

  const queries = buildSearchQueries(config);
  const depthMode = config.search_depth || 'standard';
  const pages = depthMode === 'comprehensive' ? 5 : depthMode === 'deep' ? 3 : 1;

  onLog(`Initializing Parallel Search (${queries.length} clusters x ${pages} pages)...`, 'info');

  const tasks: { q: any, page: number }[] = [];
  queries.forEach(q => {
      for (let i = 0; i < pages; i++) tasks.push({ q, page: i });
  });

  // Parallel Execution with Promise.allSettled and Timeout
  const BATCH_SIZE = 10; 
  let rawResults: RawSignal[] = [];

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      if (signal?.aborted) break;
      const batch = tasks.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(task => {
          return Promise.race([
              performSerperSearch(serperKey, task.q.q, task.page * 20),
              new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
          ]).then(res => res.map((r: any, idx: number) => ({
             id: `sig_${Date.now()}_${i}_${idx}`,
             source: task.q.name,
             url: r.link,
             title: r.title,
             snippet: r.snippet,
             timestamp: r.date || new Date().toISOString(),
             metadata: { query: task.q.q, rank: idx }
          }))).catch(e => {
              // Log but don't fail batch
              return [];
          });
      });

      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(res => {
          if (res.status === 'fulfilled') rawResults.push(...res.value);
      });
      
      await new Promise(r => setTimeout(r, 500)); // Rate limit backoff
  }

  // Enhanced Deduplication
  const fingerprintMap = new Map<string, RawSignal>();
  let duplicates = 0;

  rawResults.forEach(item => {
      if (!item.url || item.url.includes('google.com')) return;
      const fingerprint = generateFingerprint(item);
      const existing = fingerprintMap.get(fingerprint);
      
      if (existing) {
          duplicates++;
          const scoreNew = getSourceAuthority(item.url, item.snippet);
          const scoreOld = getSourceAuthority(existing.url, existing.snippet);
          if (scoreNew > scoreOld) fingerprintMap.set(fingerprint, item);
      } else {
          fingerprintMap.set(fingerprint, item);
      }
  });

  const unique = Array.from(fingerprintMap.values());
  onLog(`Deduplication: ${rawResults.length} -> ${unique.length} unique signals.`, 'success');
  
  const filtered = preFilterSignals(unique, config);
  onLog(`Pre-Filter: ${unique.length} -> ${filtered.length} candidates passed Geo/Role checks.`, 'info');

  return filtered;
};