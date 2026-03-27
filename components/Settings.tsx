import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { getKey, saveKey, STORAGE_KEYS, clearKeys } from '../lib/storage';
import { verifyPerplexityKey } from '../lib/perplexity';
import { verifySerperKey } from '../lib/serper';
import { verifyGeminiKey } from '../lib/gemini';
import { verifyOpenAIKey } from '../lib/openai';
import { verifyAnthropicKey } from '../lib/anthropic';
import { verifyGroqKey } from '../lib/groq';

import { CustomSelect } from './CustomSelect';

interface SettingsProps {
  onClose: () => void;
  onReset: () => void;
}

const ATSManager = () => {
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    const stored = getKey(STORAGE_KEYS.CUSTOM_ATS_DOMAINS);
    if (stored) {
      try {
        setDomains(JSON.parse(stored));
      } catch (e) { setDomains([]); }
    }
  }, []);

  const handleAdd = () => {
    if (!newDomain) return;
    const clean = newDomain.replace('https://', '').replace('http://', '').split('/')[0].toLowerCase();
    if (domains.includes(clean)) return;

    const updated = [...domains, clean];
    setDomains(updated);
    saveKey(STORAGE_KEYS.CUSTOM_ATS_DOMAINS, JSON.stringify(updated));
    setNewDomain('');
  };

  const handleRemove = (d: string) => {
    const updated = domains.filter(x => x !== d);
    setDomains(updated);
    saveKey(STORAGE_KEYS.CUSTOM_ATS_DOMAINS, JSON.stringify(updated));
  };

  return (
    <div className="space-y-4 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="e.g. jobs.netflix.com"
            // @ts-ignore
            className="h-10 text-sm py-2 rounded-xl"
          />
        </div>
        <Button onClick={handleAdd} className="h-10 mt-[26px] text-sm bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl px-5 font-bold">Add</Button>
      </div>
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2">
        {domains.length === 0 && <span className="text-xs text-slate-500 font-medium italic p-1">No custom targets added.</span>}
        {domains.map((d, index) => (
          <span key={`${d}-${index}`} className="bg-white dark:bg-[#2C2C2E] text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-600">
            {d} <button onClick={() => handleRemove(d)} className="text-slate-400 hover:text-[#FF3B30] font-bold text-sm">×</button>
          </span>
        ))}
      </div>
    </div>
  );
};

export const Settings = ({ onClose, onReset }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<'brain' | 'eyes'>('brain');
  
  // State for all keys
  const [perplexityKey, setPerplexityKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [serperKey, setSerperKey] = useState('');
  
  const [activeProvider, setActiveProvider] = useState('perplexity');
  
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    setPerplexityKey(getKey(STORAGE_KEYS.PERPLEXITY_KEY) || '');
    setGeminiKey(getKey(STORAGE_KEYS.GEMINI_KEY) || '');
    setOpenaiKey(getKey(STORAGE_KEYS.OPENAI_KEY) || '');
    setAnthropicKey(getKey(STORAGE_KEYS.ANTHROPIC_KEY) || '');
    setGroqKey(getKey(STORAGE_KEYS.GROQ_KEY) || '');
    setSerperKey(getKey(STORAGE_KEYS.SERPER_KEY) || '');
    setActiveProvider(getKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER) || 'perplexity');
  }, []);

  const handleSaveLLM = async () => {
    setIsLoading(true);
    setStatus(null);
    let res: { isValid: boolean; error?: string } = { isValid: false, error: 'Unknown provider' };
    let keyToSave = '';
    let keyType = '';

    switch (activeProvider) {
        case 'perplexity':
            keyToSave = perplexityKey;
            keyType = STORAGE_KEYS.PERPLEXITY_KEY;
            res = await verifyPerplexityKey(keyToSave);
            break;
        case 'gemini':
            keyToSave = geminiKey;
            keyType = STORAGE_KEYS.GEMINI_KEY;
            res = await verifyGeminiKey(keyToSave);
            break;
        case 'openai':
            keyToSave = openaiKey;
            keyType = STORAGE_KEYS.OPENAI_KEY;
            res = await verifyOpenAIKey(keyToSave);
            break;
        case 'anthropic':
            keyToSave = anthropicKey;
            keyType = STORAGE_KEYS.ANTHROPIC_KEY;
            res = await verifyAnthropicKey(keyToSave);
            break;
        case 'groq':
            keyToSave = groqKey;
            keyType = STORAGE_KEYS.GROQ_KEY;
            res = await verifyGroqKey(keyToSave);
            break;
        case 'ollama':
            // No key needed for Ollama
            saveKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER, 'ollama');
            setStatus({ type: 'success', message: 'Ollama provider selected. No key needed.' });
            setIsLoading(false);
            return;
    }

    if (res.isValid) {
      saveKey(keyType, keyToSave);
      saveKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER, activeProvider);
      setStatus({ type: 'success', message: `${activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)} Connected!` });
    } else {
      setStatus({ type: 'error', message: `Verification Failed: ${res.error}` });
    }
    setIsLoading(false);
  };

  const handleSaveEyes = async () => {
    setIsLoading(true); setStatus(null);
    const res = await verifySerperKey(serperKey);
    if (res.isValid) {
      saveKey(STORAGE_KEYS.SERPER_KEY, serperKey);
      setStatus({ type: 'success', message: 'Serper Key Updated!' });
    } else {
      setStatus({ type: 'error', message: res.error || 'Invalid Key' });
    }
    setIsLoading(false);
  };

  const handleFullReset = () => {
    if (confirm('FACTORY RESET: This will delete all API keys and your profile configuration. Are you sure?')) {
      clearKeys();
      onReset();
    }
  };

  const renderLLMInput = () => {
    switch(activeProvider) {
        case 'perplexity':
            return <Input label="Perplexity API Key" type="password" value={perplexityKey} onChange={(e) => setPerplexityKey(e.target.value)} placeholder="pplx-..."/>;
        case 'gemini':
            return <Input label="Gemini API Key" type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza..."/>;
        case 'openai':
            return <Input label="OpenAI API Key" type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..."/>;
        case 'anthropic':
            return <Input label="Anthropic API Key" type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..."/>;
        case 'groq':
            return <Input label="Groq API Key (Llama 3.3)" type="password" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} placeholder="gsk_..."/>;
        case 'local':
            return <p className="text-sm text-slate-600 dark:text-slate-400 text-center bg-slate-100 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">100% Free, Unlimited, and Instant Algorithmic Scoring. No LLM APIs required.</p>;
        case 'ollama':
            return <p className="text-sm text-slate-600 dark:text-slate-400 text-center bg-slate-100 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">Ollama runs locally. No API key is required. Ensure your local Ollama server is running.</p>;
        default:
            return null;
    }
  }

  return (
    <div className="fixed inset-0 apple-glass flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="max-w-lg w-full">
        <Card className="relative bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-slate-800 shadow-[0_20px_60px_rgb(0,0,0,0.15)] rounded-[32px] p-6 lg:p-8">
          <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-2 bg-slate-100 dark:bg-slate-800 rounded-full z-10">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <h2 className="text-2xl tracking-tight font-bold text-slate-900 dark:text-white mb-8">⚙️ System Settings</h2>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-8">
            <button onClick={() => setActiveTab('brain')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'brain' ? 'bg-white dark:bg-slate-700 text-[#0071E3] shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>🧠 Intelligence</button>
            <button onClick={() => setActiveTab('eyes')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'eyes' ? 'bg-white dark:bg-slate-700 text-[#34C759] shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>👀 Search (Serper)</button>
          </div>

          <div className="space-y-6">
            {activeTab === 'brain' ? (
              <div className="space-y-5">
                <div className='space-y-2'>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">AI Provider</label>
                    <CustomSelect 
                        value={activeProvider} 
                        onChange={(e: any) => setActiveProvider(e.target.value)} 
                        options={[
                            { value: "perplexity", label: "Perplexity" },
                            { value: "gemini", label: "Google Gemini" },
                            { value: "openai", label: "OpenAI (GPT-4o)" },
                            { value: "anthropic", label: "Anthropic (Claude)" },
                            { value: "groq", label: "Groq (Llama 3.3 Fast & Free)" },
                            { value: "local", label: "Local Heuristic (Unlimited)" },
                            { value: "ollama", label: "Ollama (coming soon)" }
                        ]}
                    />
                </div>
                
                <div className="pt-2">
                  {renderLLMInput()}
                </div>

                <Button onClick={handleSaveLLM} isLoading={isLoading} className="w-full h-12 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-full font-bold shadow-[0_4px_14px_rgba(0,113,227,0.3)] active:scale-[0.98] transition-all mt-4">Update Brain</Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-[#34C759]/10 border border-[#34C759]/20 p-4 rounded-2xl">
                  <p className="text-sm font-medium text-[#34C759] dark:text-[#3CD062] leading-relaxed">
                    We use <strong>Serper (Google Search API)</strong> for high-speed raw job discovery.
                  </p>
                </div>
                <Input
                  label="Serper API Key"
                  type="password"
                  value={serperKey}
                  onChange={(e) => setSerperKey(e.target.value)}
                />
                <Button onClick={handleSaveEyes} isLoading={isLoading} className="w-full h-12 bg-[#34C759] hover:bg-[#3CD062] text-white rounded-full font-bold shadow-[0_4px_14px_rgba(52,199,89,0.3)] active:scale-[0.98] transition-all">Update Search Engine</Button>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1 block">Custom ATS Targets</label>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4 pl-1">Add specific company job boards to prioritize.</p>
                  <ATSManager />
                </div>
              </div>
            )}

            {status && (
              <div className={`text-sm font-bold p-4 rounded-2xl flex items-center gap-3 mt-6 ${status.type === 'error' ? 'bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF3B30]' : 'bg-[#34C759]/10 border border-[#34C759]/20 text-[#34C759]'}`}>
                <span className="text-lg">{status.type === 'error' ? '⚠️' : '✅'}</span>
                {status.message}
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-6 mt-2">
              <Button variant="ghost" onClick={handleFullReset} className="text-[#FF3B30] hover:bg-[#FF3B30]/10 w-full text-sm font-bold rounded-full h-12">
                Factory Reset All Data
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};