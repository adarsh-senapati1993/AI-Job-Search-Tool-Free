import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { verifyPerplexityKey } from '../lib/perplexity';
import { verifySerperKey } from '../lib/serper';
import { saveKey, STORAGE_KEYS, getKey, getBackedUpKeys } from '../lib/storage';

interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard = ({ onComplete }: SetupWizardProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [llmKey, setLlmKey] = useState('');
  const [serperKey, setSerperKey] = useState('');

  // Hydrate with smart backup restoration
  useEffect(() => {
    const storedPerplexity = getKey(STORAGE_KEYS.PERPLEXITY_KEY);
    const storedSerper = getKey(STORAGE_KEYS.SERPER_KEY);
    const backup = getBackedUpKeys();
    
    // 1. Restore Intelligence (Brain)
    if (storedPerplexity) {
        setLlmKey(storedPerplexity);
    } else if (backup && backup.perplexity) {
        setLlmKey(backup.perplexity);
    }

    // 2. Restore Search (Eyes)
    if (storedSerper) {
        setSerperKey(storedSerper);
    } else if (backup && backup.serper) {
        setSerperKey(backup.serper);
    }
  }, []);

  const handleVerifyBrain = async () => {
    setIsLoading(true); setError(null);
    if (!llmKey.trim()) { setError("Key required"); setIsLoading(false); return; }

    const res = await verifyPerplexityKey(llmKey);
    
    if (res.isValid) {
        saveKey(STORAGE_KEYS.PERPLEXITY_KEY, llmKey);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <Card className="animate-in fade-in zoom-in duration-300 border-indigo-500/30">
            <div className="space-y-6 text-center mb-8">
              <h1 className="text-2xl font-bold text-white">System Initialization</h1>
              <p className="text-slate-400">
                  {step === 1 ? "Step 1: Configure Intelligence (Perplexity)" : "Step 2: Configure Search (Serper)"}
              </p>
            </div>

            {step === 1 ? (
                <div className="space-y-6">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <p className="text-sm text-slate-300">
                           We use <strong>Perplexity Sonar</strong> for high-speed analysis and <strong>Sonar Reasoning</strong> for deep strategy.
                        </p>
                    </div>

                    <Input 
                        label="Perplexity API Key"
                        type="password"
                        value={llmKey} 
                        onChange={e => setLlmKey(e.target.value)} 
                        placeholder="pplx-..." 
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