import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { verifyPerplexityKey } from '../lib/perplexity';
import { verifySerperKey } from '../lib/serper';
import { verifyGeminiKey } from '../lib/gemini';
import { verifyGroqKey } from '../lib/groq';
import { saveKey, STORAGE_KEYS, getKey, getBackedUpKeys } from '../lib/storage';
import { useAppStore } from '../lib/store';
import { CustomSelect } from './CustomSelect';

interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard = ({ onComplete }: SetupWizardProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for all keys
  const [perplexityKey, setPerplexityKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [serperKey, setSerperKey] = useState('');
  const [activeProvider, setActiveProvider] = useState('perplexity');

  // Hydrate with smart backup restoration
  useEffect(() => {
    const backup = getBackedUpKeys();
    
    setPerplexityKey(getKey(STORAGE_KEYS.PERPLEXITY_KEY) || backup?.perplexity || '');
    setGeminiKey(getKey(STORAGE_KEYS.GEMINI_KEY) || backup?.gemini || '');
    setGroqKey(getKey(STORAGE_KEYS.GROQ_KEY) || backup?.groq || '');
    setSerperKey(getKey(STORAGE_KEYS.SERPER_KEY) || backup?.serper || '');
    setActiveProvider(getKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER) || backup?.activeProvider || 'perplexity');
  }, []);

  const handleVerifyLLM = async () => {
    setIsLoading(true);
    setError(null);
    let res: { isValid: boolean; error?: string } = { isValid: false, error: 'Unknown provider' };
    let keyToSave = '';
    let keyType = '';

    switch (activeProvider) {
        case 'perplexity':
            keyToSave = perplexityKey;
            if (!keyToSave.trim()) { setError("Key required"); setIsLoading(false); return; }
            keyType = STORAGE_KEYS.PERPLEXITY_KEY;
            res = await verifyPerplexityKey(keyToSave);
            break;
        case 'gemini':
            keyToSave = geminiKey;
            if (!keyToSave.trim()) { setError("Key required"); setIsLoading(false); return; }
            keyType = STORAGE_KEYS.GEMINI_KEY;
            res = await verifyGeminiKey(keyToSave);
            break;
        case 'groq':
            keyToSave = groqKey;
            if (!keyToSave.trim()) { setError("Key required"); setIsLoading(false); return; }
            keyType = STORAGE_KEYS.GROQ_KEY;
            res = await verifyGroqKey(keyToSave);
            break;
        case 'local':
            keyToSave = "local";
            keyType = STORAGE_KEYS.ACTIVE_LLM_PROVIDER; // Dummy
            res = { isValid: true };
            break;
        default:
            setError("This provider is not yet supported in the setup wizard.");
            setIsLoading(false);
            return;
    }
    
    if (res.isValid) {
        saveKey(keyType, keyToSave);
        useAppStore.getState().setActiveProvider(activeProvider);
        setStep(2);
    } else {
        setError(`Validation Failed: ${res.error}`);
    }
    setIsLoading(false);
  };

  const handleVerifyEyes = async () => {
      setIsLoading(true); setError(null);
      if (!serperKey.trim()) { setError("Serper API Key is required for search."); setIsLoading(false); return; }

      const res = await verifySerperKey(serperKey);
      if (res.isValid) {
          saveKey(STORAGE_KEYS.SERPER_KEY, serperKey);
          onComplete();
      } else {
          setError(`Serper Error: ${res.error}`);
      }
      setIsLoading(false);
  };

  const renderLLMStep = () => {
    const providerInfo: any = {
        perplexity: {
            description: "We use Perplexity Sonar for high-speed analysis and deep strategy.",
            label: "Perplexity API Key",
            placeholder: "pplx-...",
            value: perplexityKey,
            setter: setPerplexityKey,
            link: "https://www.perplexity.ai/settings/api"
        },
        gemini: {
            description: "We use Google Gemini for fast and cost-effective analysis.",
            label: "Gemini API Key",
            placeholder: "AIza...",
            value: geminiKey,
            setter: setGeminiKey,
            link: "https://aistudio.google.com/app/apikey"
        },
        groq: {
            description: "We use Groq (Llama 3.3) for absolutely blazing fast, unthrottled semantic scoring.",
            label: "Groq API Key",
            placeholder: "gsk_...",
            value: groqKey,
            setter: setGroqKey,
            link: "https://console.groq.com/keys"
        },
        local: {
            description: "No APIs required. 100% free, completely unlimited, and absolutely instant heuristic scoring.",
            label: "No API Key Required",
            placeholder: "System Ready.",
            value: "",
            setter: () => {},
            link: ""
        }
    }
    const currentProvider = providerInfo[activeProvider];

    return (
        <div className="space-y-6">
            <div className="premium-panel p-4">
                <p className="text-sm text-[#1D1D1F] dark:text-slate-300">
                    {currentProvider.description}
                </p>
            </div>

            <div className='space-y-1'>
                <label className="text-sm font-medium text-[#1D1D1F] dark:text-slate-300 block">AI Provider</label>
                <CustomSelect 
                    value={activeProvider} 
                    onChange={(e: any) => setActiveProvider(e.target.value)} 
                    options={[
                        { value: "perplexity", label: "Perplexity" },
                        { value: "gemini", label: "Google Gemini" },
                        { value: "groq", label: "Groq (Llama 3.3 Fast)" },
                        { value: "local", label: "Local Heuristic (Instant & Unlimited)" },
                        { value: "openai", label: "OpenAI (coming soon)" },
                        { value: "ollama", label: "Ollama (coming soon)" }
                    ]}
                />
            </div>

            <Input 
                label={currentProvider.label}
                type="password"
                value={currentProvider.value} 
                onChange={e => currentProvider.setter(e.target.value)} 
                placeholder={currentProvider.placeholder}
            />
             <a href={currentProvider.link} target="_blank" className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline inline-block mt-3 px-1 py-2 font-medium">
                Get API Key ↗
            </a>
            
            {error && <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-950/30 p-2 rounded">{error}</p>}
            
            <Button onClick={handleVerifyLLM} isLoading={isLoading} className="w-full mt-4">
                Connect Brain 🧠
            </Button>
        </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <Card className="animate-in fade-in zoom-in duration-300 border-indigo-200 dark:border-indigo-500/30">
            <div className="space-y-6 text-center mb-8">
              <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-white">System Initialization</h1>
              <p className="text-[#86868B] dark:text-slate-400">
                  {step === 1 ? "Step 1: Configure Intelligence" : "Step 2: Configure Search (Serper)"}
              </p>
            </div>

            {step === 1 ? renderLLMStep() : (
                <div className="space-y-6">
                    <div className="premium-panel p-4 mb-4">
                        <p className="text-sm text-[#1D1D1F] dark:text-slate-300">
                            We use <strong className="text-[#34C759] dark:text-emerald-400">Serper (Google Search API)</strong> to find accurate, clickable job links. This prevents the AI from "hallucinating" fake URLs.
                        </p>
                    </div>

                    <Input 
                        label="Serper API Key" 
                        type="password" 
                        value={serperKey} 
                        onChange={e => setSerperKey(e.target.value)} 
                        placeholder="API Key..." 
                    />
                    <a href="https://serper.dev/" target="_blank" className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 hover:underline inline-block mt-3 px-1 py-2 font-medium">
                        Get Free Serper Key (2,500 free queries) ↗
                    </a>

                    {error && <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-950/30 p-2 rounded">{error}</p>}

                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setStep(1)} className="w-1/3">Back</Button>
                        <Button onClick={handleVerifyEyes} isLoading={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
                            Activate Eyes & Launch 🚀
                        </Button>
                    </div>
                </div>
            )}
        </Card>
      </div>
    </div>
  );
};