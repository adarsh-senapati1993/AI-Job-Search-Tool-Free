export const STORAGE_KEYS = {
  PERPLEXITY_KEY: 'jobradar_perplexity_key',
  SERPER_KEY: 'jobradar_serper_key',
  USER_CONFIG: 'jobradar_user_config',
  PROFILE_DRAFT: 'jobradar_profile_draft',
  RAW_RESUME: 'jobradar_raw_resume',
  LATEST_RUN: 'jobradar_latest_run',
  SEEN_JOBS: 'jobradar_seen_jobs',
  KEY_BACKUP: 'jobradar_key_backup',
};

export const saveKey = (key: string, value: string) => { if (typeof window !== 'undefined') localStorage.setItem(key, value); };
export const getKey = (key: string): string | null => typeof window !== 'undefined' ? localStorage.getItem(key) : null;
export const saveConfig = (config: any) => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.USER_CONFIG, JSON.stringify(config)); };
export const getConfig = (): any | null => { if (typeof window !== 'undefined') { const d = localStorage.getItem(STORAGE_KEYS.USER_CONFIG); return d ? JSON.parse(d) : null; } return null; };
export const saveDraft = (draft: any) => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.PROFILE_DRAFT, JSON.stringify(draft)); };
export const getDraft = (): any | null => { if (typeof window !== 'undefined') { const d = localStorage.getItem(STORAGE_KEYS.PROFILE_DRAFT); return d ? JSON.parse(d) : null; } return null; };
export const clearDraft = () => { if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEYS.PROFILE_DRAFT); };
export const saveLatestRun = (leads: any[]) => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.LATEST_RUN, JSON.stringify({ timestamp: Date.now(), leads })); };
export const getLatestRun = (): { timestamp: number, leads: any[] } | null => { if (typeof window !== 'undefined') { const d = localStorage.getItem(STORAGE_KEYS.LATEST_RUN); return d ? JSON.parse(d) : null; } return null; };
export const clearLatestRun = () => { if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEYS.LATEST_RUN); };
export const backupKeys = () => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.KEY_BACKUP, JSON.stringify({ perplexity: getKey(STORAGE_KEYS.PERPLEXITY_KEY), serper: getKey(STORAGE_KEYS.SERPER_KEY) })); };
export const getBackedUpKeys = () => { if (typeof window !== 'undefined') { const d = localStorage.getItem(STORAGE_KEYS.KEY_BACKUP); return d ? JSON.parse(d) : null; } return null; };
export const clearKeys = () => { if (typeof window !== 'undefined') { localStorage.clear(); } };
export const hasRequiredKeys = (): boolean => !!getKey(STORAGE_KEYS.SERPER_KEY) && !!getKey(STORAGE_KEYS.PERPLEXITY_KEY);

interface SeenJob { url: string; firstSeen: number; lastSeen: number; }

export const markLeadAsSeen = (url: string) => {
    if (typeof window === 'undefined') return;
    const seenMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.SEEN_JOBS) || '{}');
    const normUrl = url.split('?')[0];
    if (seenMap[normUrl]) {
        seenMap[normUrl].lastSeen = Date.now();
    } else {
        seenMap[normUrl] = { url: normUrl, firstSeen: Date.now(), lastSeen: Date.now() };
    }
    localStorage.setItem(STORAGE_KEYS.SEEN_JOBS, JSON.stringify(seenMap));
};

export const isNovelLead = (url: string): boolean => {
    if (typeof window === 'undefined') return true;
    const seenMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.SEEN_JOBS) || '{}');
    const normUrl = url.split('?')[0];
    const entry = seenMap[normUrl];
    if (!entry) return true;
    // Show again if older than 7 days
    const daysSince = (Date.now() - entry.lastSeen) / (1000 * 60 * 60 * 24);
    return daysSince > 7;
};