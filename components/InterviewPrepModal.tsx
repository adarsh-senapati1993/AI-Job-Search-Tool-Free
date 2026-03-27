import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { generateInterviewPrep, InterviewPrepResult, CandidateProfile } from '../lib/ai';
import { getInterviewPrepCache, saveInterviewPrepCache } from '../lib/storage';
import type { ScoredLead } from '../lib/scoring';
import { useAppStore } from '../lib/store';

interface InterviewPrepModalProps {
    lead: ScoredLead;
    onClose: () => void;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export const InterviewPrepModal = ({ lead, onClose }: InterviewPrepModalProps) => {
    const userConfig = useAppStore(s => s.userConfig) as CandidateProfile;
    const [result, setResult] = useState<InterviewPrepResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedQ, setExpandedQ] = useState<number | null>(0);

    const cacheKey = `${lead.company_name}__${lead.role_title}`.replace(/\s+/g, '_').toLowerCase();

    const generate = async () => {
        setLoading(true);
        setError(null);

        const cache = getInterviewPrepCache();
        const cached = cache[cacheKey];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setResult(cached.result as InterviewPrepResult);
            setLoading(false);
            return;
        }

        try {
            const r = await generateInterviewPrep(userConfig, lead);
            setResult(r);

            const updatedCache = { ...cache };
            updatedCache[cacheKey] = { result: r, timestamp: Date.now() };
            saveInterviewPrepCache(updatedCache);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Generation failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        generate();
    }, []);

    const handlePrint = () => {
        window.print();
    };

    const handleRegenerate = () => {
        const cache = getInterviewPrepCache();
        delete cache[cacheKey];
        saveInterviewPrepCache(cache);
        generate();
    };

    return (
        <div className="fixed inset-0 apple-glass flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto hide-scrollbar">
                <Card className="relative bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-slate-800 shadow-[0_20px_60px_rgb(0,0,0,0.15)] rounded-[32px] p-6 lg:p-8">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-2 bg-slate-100 dark:bg-slate-800 rounded-full z-10"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>

                    <div className="mb-8 pr-10">
                        <h2 className="text-2xl tracking-tight font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            🎯 Interview Prep
                        </h2>
                        <p className="text-sm text-slate-500 font-medium mt-1">
                            {lead.role_title} at <span className="text-[#0071E3]">{lead.company_name}</span>
                        </p>
                    </div>

                    {loading ? (
                        <div className="space-y-4 animate-pulse">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                                    <div className="h-5 bg-slate-200 dark:bg-slate-700/50 rounded-full w-3/4"></div>
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700/30 rounded-full w-1/2"></div>
                                </div>
                            ))}
                            <p className="text-center font-bold text-slate-400 text-sm mt-8">AI is preparing your interview guide...</p>
                        </div>
                    ) : error ? (
                        <div className="p-5 bg-red-50 dark:bg-[#FF3B30]/10 border border-red-200 dark:border-[#FF3B30]/20 rounded-2xl text-red-600 dark:text-[#FF3B30] text-sm font-medium">
                            <p className="font-bold mb-1 flex items-center gap-2">⚠️ Generation Error</p>
                            <p>{error}</p>
                            <Button onClick={handleRegenerate} className="mt-4 bg-[#FF3B30] hover:bg-[#FF453A] font-bold text-white rounded-full px-6">
                                Retry
                            </Button>
                        </div>
                    ) : result ? (
                        <div className="space-y-6">
                            {/* Questions Accordion */}
                            <div className="space-y-4">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2">
                                    Likely Interview Questions
                                </h3>
                                {result.likely_questions.map((q, i) => {
                                    const isExpanded = expandedQ === i;
                                    return (
                                        <div
                                            key={i}
                                            className={`border rounded-2xl transition-all duration-300 overflow-hidden ${
                                                isExpanded
                                                    ? 'border-[#0071E3]/20 bg-[#0071E3]/5 dark:bg-[#0071E3]/10 shadow-sm'
                                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-white dark:bg-[#2C2C2E]/50 dark:hover:bg-[#2C2C2E] hover:border-slate-300 dark:hover:border-slate-700'
                                            }`}
                                        >
                                            <button
                                                onClick={() => setExpandedQ(isExpanded ? null : i)}
                                                className="w-full text-left p-5 flex items-start justify-between gap-4"
                                            >
                                                <div className="flex items-start gap-4 flex-1">
                                                    <span className="text-[#0071E3] font-bold text-sm shrink-0 mt-0.5 opacity-80">
                                                        Q{i + 1}.
                                                    </span>
                                                    <span className="text-sm text-slate-900 dark:text-white font-bold leading-relaxed pr-2">
                                                        {q.question}
                                                    </span>
                                                </div>
                                                <span className={`text-slate-400 dark:text-slate-500 transition-transform duration-300 shrink-0 mt-0.5 ${isExpanded ? 'rotate-180 text-[#0071E3]' : ''}`}>
                                                    ▾
                                                </span>
                                            </button>

                                            {isExpanded && (
                                                <div className="px-5 pb-5 pt-1 space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
                                                    <div className="ml-9">
                                                        <div className="bg-white dark:bg-[#1C1C1E] rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                                                            <span className="text-[10px] font-bold text-[#FF9500] uppercase tracking-widest block mb-2">
                                                                🤔 Why They Ask This
                                                            </span>
                                                            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                                                                {q.why_asked}
                                                            </p>
                                                        </div>

                                                        <div className="bg-white dark:bg-[#1C1C1E] rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm mt-3">
                                                            <span className="text-[10px] font-bold text-[#34C759] uppercase tracking-widest block mb-2">
                                                                ⭐ Sample Answer (STAR Format)
                                                            </span>
                                                            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                                                                {q.sample_answer}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Insider Tips */}
                            {result.insider_tips.length > 0 && (
                                <div className="bg-[#FF9500]/5 dark:bg-[#FF9500]/10 border border-[#FF9500]/20 rounded-2xl p-5 mt-2">
                                    <h3 className="text-[11px] font-bold text-[#FF9500] uppercase tracking-widest mb-4 flex items-center gap-2">
                                        💡 Insider Tips for {lead.company_name}
                                    </h3>
                                    <ul className="space-y-3">
                                        {result.insider_tips.map((tip, i) => (
                                            <li key={i} className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-start gap-3">
                                                <span className="text-[#FF9500] mt-0.5 shrink-0 font-bold opacity-80">▸</span>
                                                <span className="leading-relaxed">{tip}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                                <Button
                                    onClick={handlePrint}
                                    className="flex-1 rounded-full h-12 text-sm font-bold shadow-[0_4px_14px_rgba(0,0,0,0.1)] active:scale-[0.98] bg-[#0071E3] text-white hover:bg-[#0077ED]"
                                >
                                    🖨️ Print / Save PDF
                                </Button>
                                <Button
                                    onClick={handleRegenerate}
                                    variant="outline"
                                    className="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full h-12 text-sm font-bold w-full sm:w-auto px-6"
                                >
                                    🔄 Regenerate
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </Card>
            </div>
        </div>
    );
};
