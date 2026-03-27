import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect } from 'react';
import { CandidateProfile } from './ai';
import { hasRequiredKeys, getConfig, STORAGE_KEYS, saveKey, getKey, getDarkMode, saveDarkMode } from './storage';

type AppState = 'loading' | 'setup' | 'config' | 'dashboard';

interface AppStore {
    // State
    appState: AppState;
    activeProvider: string;
    perplexityKey: string;
    geminiKey: string;
    openaiKey: string;
    anthropicKey: string;
    groqKey: string;
    serperKey: string;
    userConfig: CandidateProfile | null;
    darkMode: boolean;
    activeTab: 'feed' | 'board' | 'analytics';

    // Actions
    initializeApp: () => void;
    setAppState: (state: AppState) => void;
    setProviderKey: (provider: 'perplexity' | 'gemini' | 'openai' | 'anthropic' | 'groq' | 'serper', key: string) => void;
    setActiveProvider: (provider: string) => void;
    setUserConfig: (config: CandidateProfile | null) => void;
    setDarkMode: (v: boolean) => void;
    setActiveTab: (tab: 'feed' | 'board' | 'analytics') => void;
    
    // Hydration check
    _hasHydrated: boolean;
    setHasHydrated: (hydrated: boolean) => void;
}

export const useAppStore = create<AppStore>()(
    persist(
        (set, get) => ({
            // Initial State
            appState: 'loading',
            activeProvider: 'perplexity',
            perplexityKey: '',
            geminiKey: '',
            openaiKey: '',
            anthropicKey: '',
            groqKey: '',
            serperKey: '',
            userConfig: null,
            darkMode: getDarkMode(),
            activeTab: 'feed' as const,
            _hasHydrated: false,

            // Actions
            setHasHydrated: (hydrated) => {
                set({ _hasHydrated: hydrated });
            },
            
            initializeApp: () => {
                const hasKeys = hasRequiredKeys();
                const hasConfig = !!getConfig();

                if (!hasKeys) {
                    set({ appState: 'setup' });
                } else if (!hasConfig) {
                    set({ appState: 'config' });
                } else {
                    set({ userConfig: getConfig(), appState: 'dashboard' });
                }
            },

            setAppState: (state) => set({ appState: state }),

            setProviderKey: (provider, key) => {
                const keyName = `${provider}Key`;
                const storageKey = STORAGE_KEYS[keyName.toUpperCase() as keyof typeof STORAGE_KEYS];
                if (storageKey) {
                    saveKey(storageKey, key);
                    set({ [keyName]: key } as Partial<AppStore>);
                }
            },

            setActiveProvider: (provider) => {
                saveKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER, provider);
                set({ activeProvider: provider });
            },
            
            setUserConfig: (config) => {
                if (config) {
                    saveKey(STORAGE_KEYS.USER_CONFIG, JSON.stringify(config));
                } else {
                    localStorage.removeItem(STORAGE_KEYS.USER_CONFIG);
                }
                set({ userConfig: config });
            },

            setDarkMode: (v) => {
                saveDarkMode(v);
                if (typeof document !== 'undefined') {
                    document.documentElement.classList.toggle('dark', v);
                }
                set({ darkMode: v });
            },

            setActiveTab: (tab) => set({ activeTab: tab }),
        }),
        {
            name: 'job-radar-app-storage', // unique name
            storage: createJSONStorage(() => localStorage),
            // Only persist keys and provider selection
            partialize: (state) => ({
                activeProvider: state.activeProvider,
                perplexityKey: state.perplexityKey,
                geminiKey: state.geminiKey,
                openaiKey: state.openaiKey,
                anthropicKey: state.anthropicKey,
                groqKey: state.groqKey,
                serperKey: state.serperKey,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.setHasHydrated(true);
                }
            }
        }
    )
);

// Custom hook to run initializeApp after rehydration
export const useInitializeApp = () => {
    const initializeApp = useAppStore((state) => state.initializeApp);
    const hasHydrated = useAppStore((state) => state._hasHydrated);

    useEffect(() => {
        if (hasHydrated) {
            initializeApp();
        }
    }, [hasHydrated, initializeApp]);
};