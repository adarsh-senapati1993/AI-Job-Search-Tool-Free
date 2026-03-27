import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { generateCoverLetter, CoverLetterResult, CandidateProfile } from '../lib/ai';
import { getCoverLetterCache, saveCoverLetterCache } from '../lib/storage';
import type { ScoredLead } from '../lib/scoring';
import { useAppStore } from '../lib/store';

interface CoverLetterModalProps {
    lead: ScoredLead;
    onClose: () => void;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export const CoverLetterModal = ({ lead, onClose }: CoverLetterModalProps) => {
    const userConfig = useAppStore(s => s.userConfig) as CandidateProfile;
    const [result, setResult] = useState<CoverLetterResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [editedBody, setEditedBody] = useState('');
    const [editedSubject, setEditedSubject] = useState('');

    const cacheKey = `${lead.company_name}__${lead.role_title}`.replace(/\s+/g, '_').toLowerCase();

    const generate = async () => {
        setLoading(true);
        setError(null);

        // Check cache first
        const cache = getCoverLetterCache();
        const cached = cache[cacheKey];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            const r = cached.result as CoverLetterResult;
            setResult(r);
            setEditedBody(r.body);
            setEditedSubject(r.subject);
            setLoading(false);
            return;
        }

        try {
            const r = await generateCoverLetter(userConfig, lead);
            setResult(r);
            setEditedBody(r.body);
            setEditedSubject(r.subject);

            // Save to cache
            const updatedCache = { ...cache };
            updatedCache[cacheKey] = { result: r, timestamp: Date.now() };
            saveCoverLetterCache(updatedCache);
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

    const handleCopy = async () => {
        const text = `Subject: ${editedSubject}\n\n${editedBody}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleRegenerate = () => {
        // Clear cache for this key before regenerating
        const cache = getCoverLetterCache();
        delete cache[cacheKey];
        saveCoverLetterCache(cache);
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
                            📝 Cover Letter
                        </h2>
                        <p className="text-sm text-slate-500 font-medium mt-1">
                            {lead.role_title} at <span className="text-[#0071E3]">{lead.company_name}</span>
                        </p>
                    </div>

                    {loading ? (
                        <div className="space-y-5 animate-pulse">
                            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-3/4"></div>
                            <div className="space-y-3">
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-full"></div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-5/6"></div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-full"></div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-4/6"></div>
                            </div>
                            <div className="space-y-3 pt-4">
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-full"></div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-3/4"></div>
                            </div>
                            <p className="text-center font-bold text-slate-400 text-sm mt-8">AI is crafting your cover letter...</p>
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
                        <div className="space-y-5">
                            {/* Subject Line */}
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2 pl-1">
                                    Subject Line
                                </label>
                                <input
                                    type="text"
                                    value={editedSubject}
                                    onChange={(e) => setEditedSubject(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-[#34C759] focus:ring-1 focus:ring-[#34C759] transition-all shadow-sm"
                                />
                            </div>

                            {/* Body */}
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2 pl-1">
                                    Letter Body
                                </label>
                                <textarea
                                    value={editedBody}
                                    onChange={(e) => setEditedBody(e.target.value)}
                                    rows={14}
                                    className="w-full bg-slate-50 dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-slate-900 dark:text-white text-sm font-medium leading-relaxed focus:outline-none focus:border-[#34C759] focus:ring-1 focus:ring-[#34C759] transition-all resize-y shadow-sm"
                                />
                            </div>

                            {/* Tone Notes */}
                            {result.tone_notes && (
                                <div className="bg-[#5856D6]/5 dark:bg-[#5856D6]/10 border border-[#5856D6]/20 rounded-2xl p-4">
                                    <span className="text-[10px] font-bold text-[#5856D6] dark:text-[#5856D6] uppercase tracking-widest flex items-center gap-1.5">
                                        ✨ Tone Analysis
                                    </span>
                                    <p className="text-sm font-medium text-slate-600 dark:text-[#5856D6]/80 mt-1.5 leading-relaxed">{result.tone_notes}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
                                <Button
                                    onClick={handleCopy}
                                    className={`flex-1 transition-all rounded-full h-12 text-sm font-bold shadow-[0_4px_14px_rgba(0,0,0,0.1)] active:scale-[0.98] ${
                                        copied
                                            ? 'bg-[#34C759] text-white hover:bg-[#3CD062]'
                                            : 'bg-[#0071E3] text-white hover:bg-[#0077ED]'
                                    }`}
                                >
                                    {copied ? '✅ Copied!' : '📋 Copy to Clipboard'}
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
