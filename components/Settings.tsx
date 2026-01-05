import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { getKey, saveKey, STORAGE_KEYS, clearKeys } from '../lib/storage';
import { verifyPerplexityKey } from '../lib/perplexity';
import { verifySerperKey } from '../lib/serper';

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
    <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="e.g. jobs.netflix.com"
            // @ts-ignore
            className="h-8 text-xs py-1"
          />
        </div>
        <Button onClick={handleAdd} className="h-[42px] mt-[26px] text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600">Add</Button>
      </div>
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        {domains.length === 0 && <span className="text-[10px] text-slate-500 italic p-1">No custom targets added.</span>}
        {domains.map(d => (
          <span key={d} className="bg-slate-800 text-indigo-300 px-2 py-1 rounded text-[10px] flex items-center gap-2 border border-slate-700 shadow-sm">
            {d} <button onClick={() => handleRemove(d)} className="text-slate-500 hover:text-red-400 font-bold">×</button>
          </span>
        ))}
      </div>
    </div>
  );
};

export const Settings = ({ onClose, onReset }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<'brain' | 'eyes'>('brain');
  const [llmKey, setLlmKey] = useState('');
  const [serperKey, setSerperKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    setLlmKey(getKey(STORAGE_KEYS.PERPLEXITY_KEY) || '');
    setSerperKey(getKey(STORAGE_KEYS.SERPER_KEY) || '');
  }, []);

  const handleSaveBrain = async () => {
    setIsLoading(true); setStatus(null);
    const res = await verifyPerplexityKey(llmKey);

    if (res.isValid) {
      saveKey(STORAGE_KEYS.PERPLEXITY_KEY, llmKey);
      setStatus({ type: 'success', message: 'Perplexity Connected!' });
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

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="max-w-lg w-full">
        <Card className="relative border-slate-600 shadow-2xl">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white p-2">✕</button>

          <h2 className="text-xl font-bold text-white mb-6">⚙️ System Settings</h2>

          <div className="flex border-b border-slate-700 mb-6">
            <button onClick={() => setActiveTab('brain')} className={`flex-1 pb-2 border-b-2 transition-colors ${activeTab === 'brain' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400'}`}>🧠 Intelligence (Perplexity)</button>
            <button onClick={() => setActiveTab('eyes')} className={`flex-1 pb-2 border-b-2 transition-colors ${activeTab === 'eyes' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400'}`}>👀 Search (Serper)</button>
          </div>

          <div className="space-y-6">
            {activeTab === 'brain' ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">
                  We use <strong>Perplexity Pro (Sonar Reasoning)</strong> for deep analysis and reasoning.
                </p>
                <Input
                  label="Perplexity API Key"
                  type="password"
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  placeholder="pplx-..."
                />
                <Button onClick={handleSaveBrain} isLoading={isLoading} className="w-full">Update Brain</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">
                  We use <strong>Serper (Google Search API)</strong> for high-speed raw job discovery.
                </p>
                <Input
                  label="Serper API Key"
                  type="password"
                  value={serperKey}
                  onChange={(e) => setSerperKey(e.target.value)}
                />
                <Button onClick={handleSaveEyes} isLoading={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-500">Update Search Engine</Button>

                <div className="pt-4 border-t border-slate-700">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 block">Custom ATS Targets</label>
                  <p className="text-xs text-slate-500 mb-3">Add specific company job boards to prioritize.</p>
                  <ATSManager />
                </div>
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