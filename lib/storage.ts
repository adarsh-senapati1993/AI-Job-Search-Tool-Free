export const STORAGE_KEYS = {
  // Intelligence Keys
  LLM_PROVIDER: 'jobradar_llm_provider', // 'gemini' | 'perplexity' | 'openai' | 'ollama'
  PERPLEXITY_KEY: 'jobradar_perplexity_key',
  GEMINI_KEY: 'jobradar_gemini_key',
  OPENAI_KEY: 'jobradar_openai_key',
  OLLAMA_URL: 'jobradar_ollama_url',
  
  // Search Key
  SERPER_KEY: 'jobradar_serper_key',
  
  // Data
  USER_CONFIG: 'jobradar_user_config',
  PROFILE_DRAFT: 'jobradar_profile_draft',
  RAW_RESUME: 'jobradar_raw_resume',
};

export const saveKey = (key: string, value: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
};

export const getKey = (key: string): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

export const saveConfig = (config: any) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.USER_CONFIG, JSON.stringify(config));
  }
};

export const getConfig = (): any | null => {
  if (typeof window !== 'undefined') {
    const data = localStorage.getItem(STORAGE_KEYS.USER_CONFIG);
    return data ? JSON.parse(data) : null;
  }
  return null;
};

export const saveDraft = (draft: any) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.PROFILE_DRAFT, JSON.stringify(draft));
  }
};

export const getDraft = (): any | null => {
  if (typeof window !== 'undefined') {
    const data = localStorage.getItem(STORAGE_KEYS.PROFILE_DRAFT);
    return data ? JSON.parse(data) : null;
  }
  return null;
};

export const clearDraft = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.PROFILE_DRAFT);
  }
};

export const clearKeys = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.PERPLEXITY_KEY);
    localStorage.removeItem(STORAGE_KEYS.GEMINI_KEY);
    localStorage.removeItem(STORAGE_KEYS.OPENAI_KEY);
    localStorage.removeItem(STORAGE_KEYS.OLLAMA_URL);
    localStorage.removeItem(STORAGE_KEYS.LLM_PROVIDER);
    localStorage.removeItem(STORAGE_KEYS.SERPER_KEY);
    localStorage.removeItem(STORAGE_KEYS.USER_CONFIG);
    localStorage.removeItem(STORAGE_KEYS.PROFILE_DRAFT);
    localStorage.removeItem(STORAGE_KEYS.RAW_RESUME);
  }
};

export const hasRequiredKeys = (): boolean => {
  // We require Serper for Search AND a configured LLM
  const hasSerper = !!getKey(STORAGE_KEYS.SERPER_KEY);
  const provider = getKey(STORAGE_KEYS.LLM_PROVIDER);
  
  if (!hasSerper || !provider) return false;
  
  switch (provider) {
      case 'gemini': return !!getKey(STORAGE_KEYS.GEMINI_KEY);
      case 'openai': return !!getKey(STORAGE_KEYS.OPENAI_KEY);
      case 'perplexity': return !!getKey(STORAGE_KEYS.PERPLEXITY_KEY);
      case 'ollama': return !!getKey(STORAGE_KEYS.OLLAMA_URL);
      default: return false;
  }
};