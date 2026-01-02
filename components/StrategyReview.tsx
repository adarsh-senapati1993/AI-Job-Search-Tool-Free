import React, { useState, useEffect } from 'react';
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
  const [lastUpdatedField, setLastUpdatedField] = useState<string | null>(null);
  
  const queries = buildSearchQueries(config);

  // Clear highlight after 2 seconds
  useEffect(() => {
    if (lastUpdatedField) {
        const timer = setTimeout(() => setLastUpdatedField(null), 3000);
        return () => clearTimeout(timer);
    }
  }, [lastUpdatedField]);

  const handleTweak = async () => {
    if (!tweakInput.trim()) return;
    setIsTweaking(true);
    try {
        const oldConfig = JSON.stringify(config);
        const newConfig = await refineConfiguration(config, tweakInput);
        
        // Simple diff detection for visual feedback
        if (JSON.stringify(newConfig.target_roles) !== JSON.stringify(config.target_roles)) setLastUpdatedField('roles');
        else if (JSON.stringify(newConfig.locations) !== JSON.stringify(config.locations)) setLastUpdatedField('locations');
        else if (JSON.stringify(newConfig.avoid_keywords) !== JSON.stringify(config.avoid_keywords)) setLastUpdatedField('avoid');
        else setLastUpdatedField('general');

        onUpdateConfig(newConfig);
        saveConfig(newConfig);
        setTweakInput('');
    } catch (e) {
        console.error("Failed to refine config", e);
        alert("Failed to understand instruction. Try simpler language.");
    } finally {
        setIsTweaking(false);
    }
  };

  const renderTagGroup = (title: string, tags: string[], colorClass: string, id: string) => {
      const isHighlighted = lastUpdatedField === id;
      return (
        <div className={`p-3 rounded-lg border transition-all duration-500 ${isHighlighted ? 'bg-indigo-900/40 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-slate-800/30 border-slate-700'}`}>
            <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</h4>
                {isHighlighted && <span className="text-[10px] text-indigo-300 font-mono animate-pulse">UPDATED</span>}
            </div>
            <div className="flex flex-wrap gap-2">
                {tags && tags.length > 0 ? tags.map((tag, i) => (
                    <span key={i} className={`text-xs px-2 py-1 rounded border ${colorClass}`}>
                        {tag}
                    </span>
                )) : <span className="text-xs text-slate-600 italic">None set</span>}
            </div>
        </div>
      );
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
              
              {/* DYNAMIC CONFIG MATRIX */}
              <Card className="border-slate-700 bg-slate-900/50">
                  <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Active Constraints & Parameters</h3>
                      {lastUpdatedField && <span className="text-xs text-indigo-400 animate-pulse">• Updating...</span>}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {renderTagGroup('Target Roles', config.target_roles, 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50', 'roles')}
                      {renderTagGroup('Locations', config.locations, 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50', 'locations')}
                      {renderTagGroup('Red Lines / Avoid', config.avoid_keywords, 'bg-red-900/20 text-red-300 border-red-800/50', 'avoid')}
                      {renderTagGroup('Priority Skills', config.skills?.slice(0, 6), 'bg-amber-900/20 text-amber-300 border-amber-800/50', 'skills')}
                  </div>
              </Card>

              {/* GENERATED QUERIES */}
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Generated Search Vectors</h3>
                  <div className="space-y-3">
                      {queries.map((q, i) => (
                          <div key={i} className="bg-slate-950/50 p-3 rounded border border-slate-800 flex flex-col gap-1">
                              <div className="text-[10px] font-bold text-slate-500 uppercase">{q.name}</div>
                              <code className="text-xs font-mono text-emerald-400/80 block break-all leading-relaxed">
                                  {q.q}
                              </code>
                          </div>
                      ))}
                  </div>
              </div>
          </div>

          {/* RIGHT: The Co-Pilot */}
          <div className="lg:col-span-1">
              <Card className="h-full border-indigo-500/50 flex flex-col bg-gradient-to-b from-slate-900 to-slate-900">
                  <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">🤖</span>
                        <h3 className="text-sm font-bold text-white">Strategy Co-Pilot</h3>
                      </div>
                      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                          The AI manages the complexity. Use natural language to modify the constraints on the left.
                      </p>

                      <div className="space-y-3 mb-4">
                          <button onClick={() => setTweakInput("Add 'Founding Engineer' to roles")} className="w-full text-left text-xs bg-slate-800 hover:bg-indigo-900/30 text-indigo-200 p-3 rounded border border-slate-700 transition-colors">
                             + "Add 'Founding Engineer' to roles"
                          </button>
                          <button onClick={() => setTweakInput("Strictly no crypto or gambling")} className="w-full text-left text-xs bg-slate-800 hover:bg-indigo-900/30 text-indigo-200 p-3 rounded border border-slate-700 transition-colors">
                             + "Strictly no crypto or gambling"
                          </button>
                          <button onClick={() => setTweakInput("Include London but only Hybrid")} className="w-full text-left text-xs bg-slate-800 hover:bg-indigo-900/30 text-indigo-200 p-3 rounded border border-slate-700 transition-colors">
                             + "Include London but only Hybrid"
                          </button>
                      </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-700">
                      <textarea 
                         value={tweakInput}
                         onChange={(e) => setTweakInput(e.target.value)}
                         placeholder="e.g. 'Remove Junior roles', 'Focus on Series B startups'..."
                         className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500 min-h-[100px] mb-3 resize-none"
                      />
                      <Button 
                        onClick={handleTweak} 
                        isLoading={isTweaking}
                        disabled={!tweakInput.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20"
                      >
                          {isTweaking ? 'Refining Strategy...' : 'Apply Tweak ✨'}
                      </Button>
                  </div>
              </Card>
          </div>
      </div>
    </div>
  );
};