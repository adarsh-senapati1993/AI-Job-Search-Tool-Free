import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { getKey, saveKey, STORAGE_KEYS, clearKeys } from '../lib/storage';
import { verifyPerplexityKey } from '../lib/perplexity';
import { verifyGeminiKey } from '../lib/api-utils';
import { verifyOpenAIKey } from '../lib/openai';
import { verifySerperKey } from '../lib/serper';

interface SettingsProps {
  onClose: () => void;
  onReset: () => void;
}

export const Settings = ({ onClose, onReset }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<'brain' | 'eyes'>('brain');
  const [provider, setProvider] = useState('perplexity');
  const [llmKey, setLlmKey] = useState('');
  const [serperKey, setSerperKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    const p = getKey(STORAGE_KEYS.LLM_PROVIDER) || 'perplexity';
    setProvider(p);
    
    let key = '';
    if (p === 'gemini') key = getKey(STORAGE_KEYS.GEMINI_KEY) || '';
    if (p === 'openai') key = getKey(STORAGE_KEYS.OPENAI_KEY) || '';
    if (p === 'perplexity') key = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || '';
    if (p === 'ollama') key = getKey(STORAGE_KEYS.OLLAMA_URL) || '';
    setLlmKey(key);

    setSerperKey(getKey(STORAGE_KEYS.SERPER_KEY) || '');
  }, []);

  const handleSaveBrain = async () => {
    setIsLoading(true); setStatus(null);
    let valid = false;
    let msg = '';

    // Verify based on provider
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
        valid = true; // Ollama loose check
    }

    if (valid) {
        saveKey(STORAGE_KEYS.LLM_PROVIDER, provider);
        if (provider === 'gemini') saveKey(STORAGE_KEYS.GEMINI_KEY, llmKey);
        if (provider === 'openai') saveKey(STORAGE_KEYS.OPENAI_KEY, llmKey);
        if (provider === 'perplexity') saveKey(STORAGE_KEYS.PERPLEXITY_KEY, llmKey);
        if (provider === 'ollama') saveKey(STORAGE_KEYS.OLLAMA_URL, llmKey);
        setStatus({ type: 'success', message: 'Brain Updated!' });
    } else {
        setStatus({ type: 'error', message: `Verification Failed: ${msg}` });
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

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="max-w-lg w-full">
        <Card className="relative border-slate-600 shadow-2xl">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white p-2">✕</button>
          
          <h2 className="text-xl font-bold text-white mb-6">⚙️ System Settings</h2>
          
          <div className="flex border-b border-slate-700 mb-6">
              <button onClick={() => setActiveTab('brain')} className={`flex-1 pb-2 border-b-2 transition-colors ${activeTab === 'brain' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400'}`}>🧠 Intelligence</button>
              <button onClick={() => setActiveTab('eyes')} className={`flex-1 pb-2 border-b-2 transition-colors ${activeTab === 'eyes' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400'}`}>👀 Search (Eyes)</button>
          </div>
          
          <div className="space-y-6">
            {activeTab === 'brain' ? (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400">Provider</label>
                        <select 
                            value={provider} 
                            onChange={e => {
                                setProvider(e.target.value);
                                setLlmKey(''); // Clear key on provider switch for safety
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        >
                            <option value="perplexity">Perplexity</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="openai">OpenAI</option>
                            <option value="ollama">Ollama</option>
                        </select>
                    </div>
                    <Input
                        label="API Key / URL"
                        type={provider === 'ollama' ? 'text' : 'password'}
                        value={llmKey}
                        onChange={(e) => setLlmKey(e.target.value)}
                    />
                    <Button onClick={handleSaveBrain} isLoading={isLoading} className="w-full">Update Brain</Button>
                </div>
            ) : (
                <div className="space-y-4">
                    <Input
                        label="Serper API Key"
                        type="password"
                        value={serperKey}
                        onChange={(e) => setSerperKey(e.target.value)}
                    />
                    <Button onClick={handleSaveEyes} isLoading={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-500">Update Search Engine</Button>
                </div>
            )}

            {status && (
              <div className={`text-sm p-3 rounded-lg flex items-start gap-2 ${status.type === 'error' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                <span>{status.type === 'error' ? '⚠️' : '✅'}</span>
                {status.message}
              </div>
            )}
            
            <div className="border-t border-slate-700 pt-4 mt-4">
                <Button variant="ghost" onClick={handleFullReset} className="text-red-400 hover:bg-red-950/50 w-full text-xs">
                    Factory Reset All Data
                </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};