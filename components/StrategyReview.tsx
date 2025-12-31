import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { buildSearchQueries } from '../lib/discovery';
import { refineConfiguration } from '../lib/ai';
import { saveConfig } from '../lib/storage';

interface StrategyReviewProps {
  config: any;
  onConfirm: () => void;
  onUpdateConfig: (newConfig: any) => void;
  onCancel: () => void;
}

export const StrategyReview = ({ config, onConfirm, onUpdateConfig, onCancel }: StrategyReviewProps) => {
  const [tweakInput, setTweakInput] = useState('');
  const [isTweaking, setIsTweaking] = useState(false);
  const queries = buildSearchQueries(config);

  const handleTweak = async () => {
    if (!tweakInput.trim()) return;
    setIsTweaking(true);
    try {
        const newConfig = await refineConfiguration(config, tweakInput);
        onUpdateConfig(newConfig);
        saveConfig(newConfig);
        setTweakInput('');
        // Trigger Toast in parent if possible, or just visual feedback
    } catch (e) {
        console.error("Failed to refine config", e);
        alert("Failed to understand instruction. Try simpler language.");
    } finally {
        setIsTweaking(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-white">Strategy Room ♟️</h2>
           <p className="text-slate-400">Review & Tweak the Search Logic before launch.</p>
        </div>
        <div className="flex gap-3">
             <Button variant="outline" onClick={onCancel}>Cancel</Button>
             <Button onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 px-6">
                Confirm & Launch Mission 🚀
             </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: The Logic */}
          <div className="lg:col-span-2 space-y-6">
              <Card className="border-indigo-500/30">
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4">Generated Search Vectors</h3>
                  <div className="space-y-3">
                      {queries.map((q, i) => (
                          <div key={i} className="bg-slate-900/50 p-3 rounded border border-slate-700">
                              <div className="text-xs font-semibold text-slate-500 mb-1">{q.name}</div>
                              <code className="text-xs font-mono text-emerald-300 block break-all">
                                  {q.q}
                              </code>
                          </div>
                      ))}
                  </div>
              </Card>

              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Algorithm Weighting</h3>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="bg-slate-800 p-2 rounded">
                          <div className="text-white font-bold text-lg">30%</div>
                          <div className="text-slate-500">Role Match</div>
                      </div>
                      <div className="bg-slate-800 p-2 rounded">
                          <div className="text-white font-bold text-lg">20%</div>
                          <div className="text-slate-500">Location</div>
                      </div>
                      <div className="bg-slate-800 p-2 rounded">
                          <div className="text-white font-bold text-lg">20%</div>
                          <div className="text-slate-500">Seniority</div>
                      </div>
                      <div className="bg-slate-800 p-2 rounded">
                          <div className="text-white font-bold text-lg">30%</div>
                          <div className="text-slate-500">Bio Fit</div>
                      </div>
                  </div>
              </div>
          </div>

          {/* RIGHT: The Co-Pilot */}
          <div className="lg:col-span-1">
              <Card className="h-full border-indigo-500/50 flex flex-col">
                  <div className="flex-1">
                      <h3 className="text-sm font-bold text-white mb-2">Strategy Co-Pilot</h3>
                      <p className="text-xs text-slate-400 mb-4">
                          Use natural language to tweak the parameters instantly.
                      </p>

                      <div className="space-y-2 mb-4">
                          <div className="text-xs bg-indigo-900/20 text-indigo-200 p-2 rounded">
                             "Actually, include 'Founding Engineer' roles too."
                          </div>
                          <div className="text-xs bg-indigo-900/20 text-indigo-200 p-2 rounded">
                             "Strictly no crypto or gambling companies."
                          </div>
                          <div className="text-xs bg-indigo-900/20 text-indigo-200 p-2 rounded">
                             "I'm open to London if it's Hybrid."
                          </div>
                      </div>
                  </div>
                  
                  <div className="mt-4">
                      <textarea 
                         value={tweakInput}
                         onChange={(e) => setTweakInput(e.target.value)}
                         placeholder="Type instructions here..."
                         className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500 min-h-[80px] mb-2"
                      />
                      <Button 
                        onClick={handleTweak} 
                        isLoading={isTweaking}
                        disabled={!tweakInput.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-500"
                      >
                          Refine Strategy ✨
                      </Button>
                  </div>
              </Card>
          </div>
      </div>
    </div>
  );
};