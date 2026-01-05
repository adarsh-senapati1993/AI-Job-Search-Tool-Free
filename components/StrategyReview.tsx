import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { buildSearchQueries, GLOBAL_ATS_TARGETS } from '../lib/discovery';
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
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [isTweaking, setIsTweaking] = useState(false);
    const [lastUpdatedField, setLastUpdatedField] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'radar' | 'vectors'>('radar');

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
            const newConfigAI = await refineConfiguration(config, tweakInput);

            // SAFETY MERGE: Ensure AI doesn't strip structural keys like depth/lookback/bio
            const mergedConfig = {
                ...config,
                ...newConfigAI,
                search_depth: config.search_depth, // Force preserve
                search_lookback: config.search_lookback, // Force preserve
                professional_bio: config.professional_bio || newConfigAI.professional_bio // Prefer existing bio if AI drops it
            };

            // Simple diff detection for visual feedback
            if (JSON.stringify(mergedConfig.target_roles) !== JSON.stringify(config.target_roles)) setLastUpdatedField('roles');
            else if (JSON.stringify(mergedConfig.locations) !== JSON.stringify(config.locations)) setLastUpdatedField('locations');
            else if (JSON.stringify(mergedConfig.avoid_keywords) !== JSON.stringify(config.avoid_keywords)) setLastUpdatedField('avoid');
            else setLastUpdatedField('general');

            onUpdateConfig(mergedConfig);
            saveConfig(mergedConfig);
            setTweakInput('');
        } catch (e) {
            console.error("Failed to refine config", e);
            alert("Failed to understand instruction. Try simpler language.");
        } finally {
            setIsTweaking(false);
        }
    };

    const handleStartEdit = (id: string, tags: string[]) => {
        setEditingField(id);
        setEditValue(tags ? tags.join(', ') : '');
    };

    const handleSaveEdit = (id: string) => {
        const newTags = editValue.split(',').map(s => s.trim()).filter(Boolean);
        const mergedConfig = { ...config };

        if (id === 'roles') mergedConfig.target_roles = newTags;
        else if (id === 'locations') {
            mergedConfig.expanded_locations = newTags;
            // Also sync base locations if they were edited? 
            // Actually, if we edit "Expanded Locations", we probably just want to update the expansion list used for searching.
            // But maybe we should update specific keys.
            // For now, update expanded_locations.
        }
        else if (id === 'avoid') mergedConfig.avoid_keywords = newTags;

        onUpdateConfig(mergedConfig);
        saveConfig(mergedConfig);
        setEditingField(null);
        setLastUpdatedField(id);
    };

    const renderTagGroup = (title: string, tags: string[], colorClass: string, id: string) => {
        const isHighlighted = lastUpdatedField === id;
        const isEditing = editingField === id;

        return (
            <div className={`p-3 rounded-lg border transition-all duration-500 ${isHighlighted ? 'bg-indigo-900/40 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-slate-800/30 border-slate-700'}`}>
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</h4>
                    {isHighlighted && <span className="text-[10px] text-indigo-300 font-mono animate-pulse">UPDATED</span>}
                    {!isEditing && (
                        <button onClick={() => handleStartEdit(id, tags)} className="text-slate-500 hover:text-white transition-colors" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                    )}
                </div>

                {isEditing ? (
                    <div className="space-y-2">
                        <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:ring-1 focus:ring-indigo-500 min-h-[80px]"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingField(null)} className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-white border border-slate-700">Cancel</button>
                            <button onClick={() => handleSaveEdit(id)} className="text-[10px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/20">Save</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {tags && tags.length > 0 ? tags.map((tag, i) => (
                            <span key={i} className={`text-xs px-2 py-1 rounded border ${colorClass}`}>
                                {tag}
                            </span>
                        )) : <span className="text-xs text-slate-600 italic">None set</span>}
                    </div>
                )}
            </div>
        );
    };

    const getDepthLabel = (d: string) => {
        if (d === 'comprehensive') return 'MAX (4 Pages)';
        if (d === 'deep') return 'DEEP (2 Pages)';
        return 'STANDARD (1 Page)';
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
                            {/* Display Expanded Locations if available, else raw locations */}
                            {renderTagGroup('Locations (Expanded)', config.expanded_locations || config.locations, 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50', 'locations')}
                            {renderTagGroup('Red Lines / Avoid', config.avoid_keywords, 'bg-red-900/20 text-red-300 border-red-800/50', 'avoid')}

                            {/* Mixed Group: Skills + Params */}
                            <div className={`p-3 rounded-lg border bg-slate-800/30 border-slate-700`}>
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Params & Skills</h4>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <span className="text-[10px] px-2 py-1 rounded border bg-blue-900/30 text-blue-300 border-blue-700/50">
                                            DEPTH: {getDepthLabel(config.search_depth)}
                                        </span>
                                        <span className="text-[10px] px-2 py-1 rounded border bg-blue-900/30 text-blue-300 border-blue-700/50">
                                            TIME: {config.search_lookback || '14d'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {config.skills?.slice(0, 5).map((s: string, i: number) => (
                                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-900/20 text-amber-300 border-amber-800/50">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <div className="flex gap-4 border-b border-slate-700 mb-2">
                        <button
                            onClick={() => setActiveTab('radar')}
                            className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'radar' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                        >
                            📡 Active Search Radar (Visual)
                        </button>
                        <button
                            onClick={() => setActiveTab('vectors')}
                            className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'vectors' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                        >
                            🧬 Raw Query Vectors (Debug)
                        </button>
                    </div>

                    {activeTab === 'radar' ? (
                        <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700 space-y-4">
                            {/* 1. REGIONAL INTELLIGENCE (Most Important to User) */}
                            <div className="bg-slate-900/80 p-3 rounded-lg border border-indigo-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg">🌍</span>
                                    <div>
                                        <h4 className="text-sm font-bold text-white">Regional Intelligence (Location Specific)</h4>
                                        <p className="text-[10px] text-slate-400">AI-discovered high-signal boards for your region.</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {config.regional_boards && config.regional_boards.length > 0 ? (
                                        config.regional_boards.map((board: string, i: number) => (
                                            <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                                {board}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-slate-500 italic">No specific regional boards needed (Using Global + Broad Web).</span>
                                    )}
                                </div>
                            </div>

                            {/* 2. GLOBAL ATS */}
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Global ATS Network (Direct Access)</h4>
                                <div className="flex flex-wrap gap-2">
                                    {GLOBAL_ATS_TARGETS.map((ats, i) => (
                                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/20 text-emerald-400 border border-emerald-900/30">
                                            {ats.replace('boards.', '').replace('jobs.', '').replace('apply.', '').replace('careers.', '')}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* 3. BROAD WEB */}
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Broad Web Sweep</h4>
                                    <p className="text-[10px] text-slate-500">Recursive pattern matching for unlisted careers pages</p>
                                </div>
                                <div className="text-xs font-mono text-slate-300 bg-slate-800 px-2 py-1 rounded">
                                    site:careers.* OR site:jobs.*
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700">
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
                    )}
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