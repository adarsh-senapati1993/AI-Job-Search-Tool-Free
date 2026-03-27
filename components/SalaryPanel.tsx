import React, { useState } from 'react';
import { Button } from './ui/Button';
import { generateSalaryBenchmark, SalaryBenchmark } from '../lib/ai';
import { getSalaryCache, saveSalaryCache } from '../lib/storage';

interface SalaryPanelProps {
    role: string;
    location: string;
    yearsExp?: number;
    companyName?: string;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const formatCurrency = (val: number, currency: string): string => {
    if (val === 0) return 'N/A';
    if (currency === 'INR') {
        if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)} Cr`;
        if (val >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
        return `₹${val.toLocaleString('en-IN')}`;
    }
    return `$${val.toLocaleString('en-US')}`;
};

export const SalaryPanel = ({ role, location, yearsExp = 5, companyName }: SalaryPanelProps) => {
    const [expanded, setExpanded] = useState(false);
    const [result, setResult] = useState<SalaryBenchmark | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const safeCompany = companyName ? companyName.replace(/[^a-zA-Z0-9]/g, '') : '';
    const cacheKey = `${role}__${location}__${yearsExp}__${safeCompany}`.replace(/\s+/g, '_').toLowerCase();

    const handleToggle = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }

        setExpanded(true);

        if (result) return; // Already loaded

        setLoading(true);
        setError(null);

        // Check cache
        const cache = getSalaryCache();
        const cached = cache[cacheKey];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setResult(cached.result as SalaryBenchmark);
            setLoading(false);
            return;
        }

        try {
            const r = await generateSalaryBenchmark(role, location, yearsExp, companyName);
            setResult(r);

            const updatedCache = { ...cache };
            updatedCache[cacheKey] = { result: r, timestamp: Date.now() };
            saveSalaryCache(updatedCache);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to fetch salary data';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const confidenceBadge = (confidence: string) => {
        const colors: Record<string, string> = {
            high: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30',
            medium: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
            low: 'bg-red-900/30 text-red-400 border-red-500/30',
        };
        return (
            <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold tracking-wider ${colors[confidence] || colors.low}`}>
                {confidence} confidence
            </span>
        );
    };

    return (
        <div className="mt-3">
            <button
                onClick={handleToggle}
                className="text-xs font-bold text-[#0071E3] hover:text-[#0077ED] flex items-center gap-1.5 transition-colors tracking-tight"
            >
                <span className={`transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}>▸</span>
                💰 Salary Insights for {role}
            </button>

            {expanded && (
                <div className="mt-3 bg-slate-50 dark:bg-[#2C2C2E]/30 border border-slate-100 dark:border-slate-800/50 rounded-[20px] p-5 shadow-sm animate-in slide-in-from-top-2 fade-in duration-200">
                    {loading ? (
                        <div className="space-y-3 animate-pulse">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="h-16 bg-slate-200 dark:bg-slate-700/50 rounded-2xl"></div>
                                <div className="h-16 bg-slate-200 dark:bg-slate-700/50 rounded-2xl"></div>
                            </div>
                            <p className="text-center text-slate-500 text-xs">Benchmarking salary data...</p>
                        </div>
                    ) : error ? (
                        <div className="text-xs text-red-400">
                            ⚠️ {error}
                            <Button
                                onClick={() => { setResult(null); handleToggle(); }}
                                variant="ghost"
                                className="text-xs ml-2 text-red-300"
                            >
                                Retry
                            </Button>
                        </div>
                    ) : result ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                                    Market Rate: {role} {companyName && companyName !== 'Unknown' && companyName !== 'Not specified' ? `at ${companyName}` : ''} ({location})
                                </span>
                                {confidenceBadge(result.data_confidence)}
                            </div>

                            {/* Salary Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block mb-1">INR (Annual)</span>
                                    <div className="text-xl tracking-tight font-bold text-[#34C759]">
                                        {formatCurrency(result.median_inr, 'INR')}
                                    </div>
                                    <div className="text-[10px] font-medium text-slate-500 mt-1">
                                        Range: {formatCurrency(result.range_inr.min, 'INR')} – {formatCurrency(result.range_inr.max, 'INR')}
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block mb-1">USD (Annual)</span>
                                    <div className="text-xl tracking-tight font-bold text-[#0071E3]">
                                        {formatCurrency(result.median_usd, 'USD')}
                                    </div>
                                    <div className="text-[10px] font-medium text-slate-500 mt-1">
                                        Range: {formatCurrency(result.range_usd.min, 'USD')} – {formatCurrency(result.range_usd.max, 'USD')}
                                    </div>
                                </div>
                            </div>

                            {/* Negotiation Tips */}
                            {result.negotiation_tips.length > 0 && (
                                <div className="mt-2 pl-1">
                                    <span className="text-[10px] font-bold text-[#FF9500] uppercase tracking-widest block mb-3">
                                        💡 Negotiation Tips
                                    </span>
                                    <ul className="space-y-2.5">
                                        {result.negotiation_tips.map((tip, i) => (
                                            <li key={i} className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
                                                <span className="text-[#FF9500] font-bold shrink-0 mt-0.5">▸</span>
                                                <span className="leading-relaxed">{tip}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};
