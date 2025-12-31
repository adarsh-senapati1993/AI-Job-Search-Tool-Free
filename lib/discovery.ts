import { performSerperSearch } from './serper';
import { getKey, STORAGE_KEYS } from './storage';

export interface RawSignal {
  id: string;
  source: string;
  url: string;
  snippet: string;
  timestamp: string;
}

type LogCallback = (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

// --- STRATEGY: URL VALIDATOR ---
// Enforces "Deep Link" quality. Rejects generic search pages to ensure functional Apply links.
const isHighQualityJobLink = (url: string): boolean => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();
        const search = u.search.toLowerCase();
        const hostname = u.hostname.toLowerCase();
        
        // 1. REJECT: Generic Search/Listings/Tags/Categories
        // We want specific job pages, not "Search results for PM"
        if (path === '/' || path === '/jobs' || path === '/jobs/' || path === '/careers' || path === '/careers/') return false;
        if (path.endsWith('/search') || path.endsWith('/search/')) return false;
        if (search.includes('?q=') || search.includes('&q=') || search.includes('query=') || search.includes('keywords=')) return false;
        if (path.includes('/tags/') || path.includes('/category/') || path.includes('/archive/')) return false; 
        if (path.includes('/blog/') || path.includes('/news/') || path.includes('/articles/') || path.includes('/content/')) return false;

        // 2. TARGETED: LinkedIn
        // We only want specific job views, not the feed or search results
        if (hostname.includes('linkedin.com')) {
            // Valid: /jobs/view/..., /jobs/collections/recommended/...
            // Invalid: /jobs/search, /feed, /
            if (!path.includes('/jobs/view/') && !path.includes('/jobs/collections/')) {
                return false;
            }
        }
        
        // 3. TARGETED: Indeed
        // Only allow direct viewjob links
        if (hostname.includes('indeed.com')) {
             if (!path.includes('/viewjob') && !path.includes('/rc/clk')) return false;
        }

        // 4. TARGETED: ATS Systems (Greenhouse, Lever, etc)
        // Usually these are safe if they come from site: search, but let's block the root.
        if (hostname.includes('greenhouse.io') && path.length < 5) return false; 
        if (hostname.includes('lever.co') && path.length < 5) return false;

        return true;
    } catch (e) {
        return false;
    }
}

export const buildSearchQueries = (config: any) => {
    // DYNAMIC DATE CALCULATION
    const lookbackRaw = config.search_lookback || '14d';
    const lookbackDays = parseInt(lookbackRaw.replace('d', '').replace('h', '0')) || 14; 
    const searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - lookbackDays);
    const dateStr = searchDate.toISOString().split('T')[0]; 

    const rolesQuery = config.target_roles.length > 0 
      ? `(${config.target_roles.map((r: string) => `"${r}"`).join(' OR ')})`
      : '"Product Manager"';
      
    const locationsQuery = config.locations.length > 0 
      ? `(${config.locations.map((l: string) => `"${l}"`).join(' OR ')})`
      : '';

    const negativeFilters = '-intitle:resume -intitle:cv -inurl:blog -inurl:news -inurl:article';

    // 3-LAYER SEARCH ARCHITECTURE for Deep Links
    return [
      // LAYER 1: ATS Direct (Highest Precision - Direct Apply Links)
      // These are virtually guaranteed to be actual job forms.
      { 
        name: "ATS Direct (Greenhouse/Lever/Ashby)", 
        q: `site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com OR site:apply.workable.com ${rolesQuery} ${locationsQuery} ${negativeFilters} after:${dateStr}` 
      },
      
      // LAYER 2: Company Career Portals (Deep Search)
      // Force "apply" intent to find specific job pages on careers.* subdomains, excluding aggregators.
      { 
        name: "Company Career Portals", 
        q: `(site:careers.* OR site:jobs.* OR site:join.*) -site:linkedin.com -site:indeed.com -site:glassdoor.com ${rolesQuery} ${locationsQuery} "apply" ${negativeFilters} after:${dateStr}` 
      },
      
      // LAYER 3: LinkedIn Deep Links (Fallback)
      // Strictly target the /jobs/view/ path to avoid general search pages.
      { 
        name: "LinkedIn Deep Links", 
        q: `site:linkedin.com/jobs/view ${rolesQuery} ${locationsQuery} ${negativeFilters} after:${dateStr}` 
      }
    ];
};

// Client-Side Pre-filter to save LLM tokens and ensure Link Quality
export const preFilterSignals = (signals: RawSignal[], config: any): RawSignal[] => {
    const keywords = [
        ...(config.target_roles || []),
        ...(config.skills || []),
        ...(config.industries || [])
    ].map(k => k.toLowerCase());

    const redLines = (config.avoid_keywords || []).map((k: string) => k.toLowerCase());

    return signals.filter(s => {
        // 1. URL Quality Check (The new Deep Link Logic)
        if (!isHighQualityJobLink(s.url)) return false;

        const text = (s.snippet + " " + s.url).toLowerCase();
        
        // 2. Hard Reject Red Lines
        if (redLines.some(bad => text.includes(bad))) return false;

        // 3. Soft Keyword Match (Must have at least one relevant keyword)
        if (keywords.length === 0) return true;
        return keywords.some(k => text.includes(k));
    });
};

const performSerperDiscovery = async (
  apiKey: string,
  sourceName: string,
  query: string,
  onLog: LogCallback,
  signal?: AbortSignal
): Promise<RawSignal[]> => {
    onLog(`[${sourceName}] Google Search via Serper...`, 'info');
    
    try {
        if (signal?.aborted) return [];
        
        const organicResults = await performSerperSearch(apiKey, query);
        
        if (organicResults.length > 0) {
            onLog(`[${sourceName}] found ${organicResults.length} validated links.`, 'success');
            return organicResults.map((r, i) => ({
                id: `serper_${Date.now()}_${i}_${Math.random().toString(36).substr(2,9)}`,
                source: "google-search",
                url: r.link,
                snippet: `${r.title} - ${r.snippet}`,
                timestamp: r.date || new Date().toISOString()
            }));
        }
        return [];
    } catch (e: any) {
        onLog(`[${sourceName}] Serper Error: ${e.message}`, 'error');
        return [];
    }
};

export const searchForSignals = async (
    config: any, 
    onLog: LogCallback,
    signal?: AbortSignal
): Promise<RawSignal[]> => {
  const serperKey = getKey(STORAGE_KEYS.SERPER_KEY);
  
  if (!serperKey) throw new Error("Search Engine Error: Serper API Key is missing. Please configure it in Settings.");

  const queries = buildSearchQueries(config);

  onLog(`Initializing Search Engine (Eyes)...`, 'info');
  // Debug log for the user to see exactly what is being searched
  onLog(`Executing ${queries.length} deep-link search clusters...`, 'info');

  let results: RawSignal[][] = [];
  
  // Sequential execution to avoid rate limits
  for (const q of queries) {
      if (signal?.aborted) break;
      
      const res = await performSerperDiscovery(serperKey, q.name, q.q, onLog, signal);
      results.push(res);
      await new Promise(r => setTimeout(r, 1000));
  }
  
  const combined = results.flat();
  
  // Deduplicate URLs
  const uniqueMap = new Map();
  combined.forEach(item => {
      try {
        if (item.url && item.url !== '#' && !item.url.includes('google.com/search')) {
            const cleanUrl = item.url.split('?')[0]; 
            if (!uniqueMap.has(cleanUrl)) {
                // Filter out obviously bad aggregation pages
                if (!cleanUrl.includes('/search') && !cleanUrl.includes('/feed') && !cleanUrl.includes('/tag/')) {
                    uniqueMap.set(cleanUrl, { ...item, url: cleanUrl });
                }
            }
        }
      } catch (e) {
         // ignore malformed urls
      }
  });
  
  const uniqueSignals = Array.from(uniqueMap.values());
  onLog(`Deduplication: ${combined.length} -> ${uniqueSignals.length} unique signals.`, 'info');

  // Apply Pre-Filter (Links + Keywords)
  const filtered = preFilterSignals(uniqueSignals, config);
  onLog(`Deep Link & Noise Filter: ${uniqueSignals.length} -> ${filtered.length} high-quality leads.`, 'info');

  return filtered;
};