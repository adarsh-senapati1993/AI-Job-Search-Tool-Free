import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { verifyPerplexityKey } from '../lib/perplexity';
import { verifyGeminiKey } from '../lib/api-utils';
import { verifyOpenAIKey } from '../lib/openai';
import { verifySerperKey } from '../lib/serper';
import { saveKey, STORAGE_KEYS, getKey } from '../lib/storage';

interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard = ({ onComplete }: SetupWizardProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State
  const [provider, setProvider] = useState<string>('perplexity');
  const [llmKey, setLlmKey] = useState('');
  const [serperKey, setSerperKey] = useState('');

  // Hydrate
  useEffect(() => {
    const storedProvider = getKey(STORAGE_KEYS.LLM_PROVIDER);
    const storedSerper = getKey(STORAGE_KEYS.SERPER_KEY);
    
    if (storedProvider) {
        setProvider(storedProvider);
        let key = '';
        if (storedProvider === 'gemini') key = getKey(STORAGE_KEYS.GEMINI_KEY) || '';
        if (storedProvider === 'openai') key = getKey(STORAGE_KEYS.OPENAI_KEY) || '';
        if (storedProvider === 'perplexity') key = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || '';
        if (storedProvider === 'ollama') key = getKey(STORAGE_KEYS.OLLAMA_URL) || '';
        setLlmKey(key);
    }
    if (storedSerper) setSerperKey(storedSerper);
  }, []);

  const handleVerifyBrain = async () => {
    setIsLoading(true); setError(null);
    if (!llmKey.trim()) { setError("Key required"); setIsLoading(false); return; }

    let valid = false;
    let msg = '';

    if (provider === 'perplexity') {
        const res = await verifyPerplexityKey(llmKey);
        valid = res.isValid; msg = res.error || '';
    } else if (provider === 'gemini') {
        const res = await verifyGeminiKey(llmKey);
        valid = res.success; msg = res.message;
    } else if (provider === 'openai') {
        const res = await verifyOpenAIKey(llmKey);
        valid = res.isValid; msg = res.error || '';
    } else {
        // Assume Ollama URL is valid for now or add verify
        valid = true; 
    }

    if (valid) {
        saveKey(STORAGE_KEYS.LLM_PROVIDER, provider);
        if (provider === 'gemini') saveKey(STORAGE_KEYS.GEMINI_KEY, llmKey);
        if (provider === 'openai') saveKey(STORAGE_KEYS.OPENAI_KEY, llmKey);
        if (provider === 'perplexity') saveKey(STORAGE_KEYS.PERPLEXITY_KEY, llmKey);
        if (provider === 'ollama') saveKey(STORAGE_KEYS.OLLAMA_URL, llmKey);
        setStep(2);
    } else {
        setError(`Validation Failed: ${msg}`);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <Card className="animate-in fade-in zoom-in duration-300 border-indigo-500/30">
            <div className="space-y-6 text-center mb-8">
              <h1 className="text-2xl font-bold text-white">System Initialization</h1>
              <p className="text-slate-400">
                  {step === 1 ? "Step 1: Configure Intelligence (Brain)" : "Step 2: Configure Search (Eyes)"}
              </p>
            </div>

            {step === 1 ? (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300 block">Select AI Provider</label>
                        <select 
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="perplexity">Perplexity (Recommended for Reasoning)</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="openai">OpenAI (GPT-4)</option>
                            <option value="ollama">Ollama (Local)</option>
                        </select>
                    </div>

                    <Input 
                        label={provider === 'ollama' ? "Ollama URL" : "API Key"}
                        type={provider === 'ollama' ? "text" : "password"}
                        value={llmKey} 
                        onChange={e => setLlmKey(e.target.value)} 
                        placeholder={provider === 'ollama' ? "http://localhost:11434" : "sk-..."} 
                    />
                    
                    {error && <p className="text-red-400 text-sm bg-red-950/30 p-2 rounded">{error}</p>}
                    
                    <Button onClick={handleVerifyBrain} isLoading={isLoading} className="w-full mt-4">
                        Connect Brain 🧠
                    </Button>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-4">
                        <p className="text-sm text-slate-300">
                            We use <strong className="text-emerald-400">Serper (Google Search API)</strong> to find accurate, clickable job links. This prevents the AI from "hallucinating" fake URLs.
                        </p>
                    </div>

                    <Input 
                        label="Serper API Key" 
                        type="password" 
                        value={serperKey} 
                        onChange={e => setSerperKey(e.target.value)} 
                        placeholder="API Key..." 
                    />
                    <a href="https://serper.dev/" target="_blank" className="text-[10px] text-emerald-400 hover:underline block mt-1">
                        Get Free Serper Key (2,500 free queries) ↗
                    </a>

                    {error && <p className="text-red-400 text-sm bg-red-950/30 p-2 rounded">{error}</p>}

                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setStep(1)} className="w-1/3">Back</Button>
                        <Button onClick={handleVerifyEyes} isLoading={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-500">
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