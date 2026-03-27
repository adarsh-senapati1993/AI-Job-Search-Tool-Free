export const STORAGE_KEYS = {
    // LLM Provider Keys
    PERPLEXITY_KEY: 'jobradar_perplexity_key',
    GEMINI_KEY: 'jobradar_gemini_key',
    OPENAI_KEY: 'jobradar_openai_key',
    ANTHROPIC_KEY: 'jobradar_anthropic_key',
    GROQ_KEY: 'jobradar_groq_key',
    
    // Active Provider Selection
    ACTIVE_LLM_PROVIDER: 'jobradar_active_llm_provider',

    // Other Keys
    SERPER_KEY: 'jobradar_serper_key',
    USER_CONFIG: 'jobradar_user_config',
    PROFILE_DRAFT: 'jobradar_profile_draft',
    RAW_RESUME: 'jobradar_raw_resume',
    LATEST_RUN: 'jobradar_latest_run',
    SEEN_JOBS: 'jobradar_seen_jobs',
    KEY_BACKUP: 'jobradar_key_backup',
    CUSTOM_ATS_DOMAINS: 'jobradar_custom_ats',
    RAW_SIGNALS_CACHE: 'jobradar_raw_signals_cache',
    LEAD_SCORE_CACHE: 'jobradar_lead_score_cache',
    PROFILE_ANALYSIS_CACHE: 'jobradar_profile_analysis_cache',

    // New Feature Keys
    KANBAN_STATE_KEY: 'jobradar_kanban_state',
    DARK_MODE_KEY: 'jobradar_dark_mode',
    COVER_LETTER_CACHE_KEY: 'jobradar_cover_letter_cache',
    INTERVIEW_PREP_CACHE_KEY: 'jobradar_interview_prep_cache',
    SALARY_CACHE_KEY: 'jobradar_salary_cache',
    RUN_HISTORY_KEY: 'jobradar_run_history',
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

// Backs up all primary API keys
export const backupKeys = () => {
    if (typeof window !== 'undefined') {
        const backup = {
            perplexity: getKey(STORAGE_KEYS.PERPLEXITY_KEY),
            serper: getKey(STORAGE_KEYS.SERPER_KEY),
            gemini: getKey(STORAGE_KEYS.GEMINI_KEY),
            openai: getKey(STORAGE_KEYS.OPENAI_KEY),
            anthropic: getKey(STORAGE_KEYS.ANTHROPIC_KEY),
            groq: getKey(STORAGE_KEYS.GROQ_KEY),
            activeProvider: getKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER)
        };
        localStorage.setItem(STORAGE_KEYS.KEY_BACKUP, JSON.stringify(backup));
    }
};
export const getBackedUpKeys = () => { if (typeof window !== 'undefined') { const d = localStorage.getItem(STORAGE_KEYS.KEY_BACKUP); return d ? JSON.parse(d) : null; } return null; };

export const clearKeys = () => {
    if (typeof window !== 'undefined') {
        // We do NOT use localStorage.clear() anymore because it wipes the backup
        localStorage.removeItem(STORAGE_KEYS.PERPLEXITY_KEY);
        localStorage.removeItem(STORAGE_KEYS.GEMINI_KEY);
        localStorage.removeItem(STORAGE_KEYS.OPENAI_KEY);
        localStorage.removeItem(STORAGE_KEYS.ANTHROPIC_KEY);
        localStorage.removeItem(STORAGE_KEYS.GROQ_KEY);
        localStorage.removeItem(STORAGE_KEYS.SERPER_KEY);
        localStorage.removeItem(STORAGE_KEYS.USER_CONFIG);
        localStorage.removeItem(STORAGE_KEYS.PROFILE_DRAFT);
        localStorage.removeItem(STORAGE_KEYS.RAW_RESUME);
        localStorage.removeItem(STORAGE_KEYS.LATEST_RUN);
        // Clear zustand persisted state so keys don't rehydrate on reload
        localStorage.removeItem('job-radar-app-storage');
        localStorage.removeItem('jobradar_gemini_model');
        // We intentionally keep SEEN_JOBS and KEY_BACKUP
    }
};

// The app is usable if Serper is configured AND at least one LLM provider is configured.
export const hasRequiredKeys = (): boolean => {
    const serperOk = !!getKey(STORAGE_KEYS.SERPER_KEY);
    const activeProvider = getKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER) || 'perplexity';
    
    let llmOk = false;
    switch (activeProvider) {
        case 'gemini':
            llmOk = !!getKey(STORAGE_KEYS.GEMINI_KEY);
            break;
        case 'openai':
            llmOk = !!getKey(STORAGE_KEYS.OPENAI_KEY);
            break;
        case 'anthropic':
            llmOk = !!getKey(STORAGE_KEYS.ANTHROPIC_KEY);
            break;
        case 'groq':
            llmOk = !!getKey(STORAGE_KEYS.GROQ_KEY);
            break;
        case 'perplexity':
        default:
            llmOk = !!getKey(STORAGE_KEYS.PERPLEXITY_KEY);
            break;
    }
    return serperOk && llmOk;
};

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

// Persistent scoring cache utilities
export interface LeadScoreCacheEntry {
    url: string;
    profileHash: string;
    lead: any;
}

export const getLeadScoreCache = (): Record<string, LeadScoreCacheEntry> => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.LEAD_SCORE_CACHE);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export const saveLeadScoreCache = (cache: Record<string, LeadScoreCacheEntry>) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEYS.LEAD_SCORE_CACHE, JSON.stringify(cache));
    } catch {
        // best-effort; ignore quota errors
    }
};

// === NEW FEATURE STORAGE HELPERS ===

// Kanban State
export const getKanbanState = (): Record<string, string> => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.KANBAN_STATE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch { return {}; }
};

export const saveKanbanState = (state: Record<string, string>) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEYS.KANBAN_STATE_KEY, JSON.stringify(state)); }
    catch { /* quota */ }
};

// Dark Mode
export const getDarkMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEYS.DARK_MODE_KEY) === 'true';
};

export const saveDarkMode = (v: boolean) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.DARK_MODE_KEY, String(v));
};

// Cover Letter Cache
export const getCoverLetterCache = (): Record<string, { result: unknown; timestamp: number }> => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.COVER_LETTER_CACHE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch { return {}; }
};

export const saveCoverLetterCache = (cache: Record<string, { result: unknown; timestamp: number }>) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEYS.COVER_LETTER_CACHE_KEY, JSON.stringify(cache)); }
    catch { /* quota */ }
};

// Interview Prep Cache
export const getInterviewPrepCache = (): Record<string, { result: unknown; timestamp: number }> => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.INTERVIEW_PREP_CACHE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch { return {}; }
};

export const saveInterviewPrepCache = (cache: Record<string, { result: unknown; timestamp: number }>) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEYS.INTERVIEW_PREP_CACHE_KEY, JSON.stringify(cache)); }
    catch { /* quota */ }
};

// Salary Cache
export const getSalaryCache = (): Record<string, { result: unknown; timestamp: number }> => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SALARY_CACHE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch { return {}; }
};

export const saveSalaryCache = (cache: Record<string, { result: unknown; timestamp: number }>) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEYS.SALARY_CACHE_KEY, JSON.stringify(cache)); }
    catch { /* quota */ }
};

// Run History (circular buffer of last 7)
export const appendToRunHistory = (timestamp: number) => {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.RUN_HISTORY_KEY);
        const history: number[] = raw ? JSON.parse(raw) : [];
        history.push(timestamp);
        // Keep only last 7
        const trimmed = history.slice(-7);
        localStorage.setItem(STORAGE_KEYS.RUN_HISTORY_KEY, JSON.stringify(trimmed));
    } catch { /* quota */ }
};

export const getRunHistory = (): number[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.RUN_HISTORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch { return []; }
};