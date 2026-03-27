import React, { useState, useRef, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { searchForSignals, enrichLeadsWithCompanyNews } from '../lib/discovery';
import { scoreSignals, ScoredLead } from '../lib/scoring';
import { saveLatestRun, getLatestRun, markLeadAsSeen, isNovelLead, getKey, saveKey, STORAGE_KEYS, getLeadScoreCache, saveLeadScoreCache, LeadScoreCacheEntry, appendToRunHistory } from '../lib/storage';
import { checkSerperQuota } from '../lib/serper';
import { OutreachModal } from './OutreachModal';
import { CoverLetterModal } from './CoverLetterModal';
import { InterviewPrepModal } from './InterviewPrepModal';
import { SalaryPanel } from './SalaryPanel';
import { StrategyReview } from './StrategyReview';
import { useAppStore } from '../lib/store';
import { CandidateProfile, generateScoringJSON, SearchStrategy } from '../lib/ai';
import { DiscoveryProgress } from '../lib/discovery';

interface LogEntry {
    msg: string;
    type: 'info' | 'success' | 'error' | 'warning';
    time: string;
}

interface DeepAnalysisData {
    summary: string;
    culture_fit: string;
    interview_tips: string[];
}

export const DiscoveryFeed = () => {
    const { userConfig, setUserConfig } = useAppStore();

    const [stage, setStage] = useState<'idle' | 'strategy' | 'searching' | 'scoring' | 'complete'>('idle');
    const [leads, setLeads] = useState<ScoredLead[]>([]);
    const [failedLeads, setFailedLeads] = useState<ScoredLead[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedLead, setSelectedLead] = useState<ScoredLead | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filterUrgent, setFilterUrgent] = useState(false);
    const [filterSalary, setFilterSalary] = useState(false);
    const [filterRecency, setFilterRecency] = useState(false);
    const [filterLocation, setFilterLocation] = useState<string[]>([]);
    const [minScore, setMinScore] = useState(0); // Default to showing everything
    const [showFailedOnly, setShowFailedOnly] = useState(false);
    const [expandedScoreId, setExpandedScoreId] = useState<string | null>(null);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [analysisResults, setAnalysisResults] = useState<Record<string, DeepAnalysisData>>({});
    const [reportedDeadLinks, setReportedDeadLinks] = useState<Set<string>>(new Set());
    const [searchProgress, setSearchProgress] = useState<DiscoveryProgress>({ found: 0, filtered: 0 });
    const logsEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [coverLetterLead, setCoverLetterLead] = useState<ScoredLead | null>(null);
    const [interviewPrepLead, setInterviewPrepLead] = useState<ScoredLead | null>(null);

    useEffect(() => {
        const lastRun = getLatestRun();
        if (lastRun && lastRun.leads.length > 0) {
            if (Date.now() - lastRun.timestamp < 24 * 60 * 60 * 1000) {
                const restored = lastRun.leads as ScoredLead[];
                const failed = restored.filter(l => l?.status === 'failed' || l?.decision === 'FAILED' || !isLocationRelevant(l));
                const ok = restored.filter(l => !(l?.status === 'failed' || l?.decision === 'FAILED') && isLocationRelevant(l));
                setLeads(ok);
                setFailedLeads(failed);
                setStage('complete');
            }
        }
    }, []);

    useEffect(() => {
        // Persist both sets, but keep failed leads out of the main feed UI.
        const all = [...leads, ...failedLeads];
        if (all.length > 0) saveLatestRun(all);
    }, [leads, failedLeads]);

    const computeProfileHash = (profile: CandidateProfile | null): string => {
        if (!profile) return 'no-profile';
        const keyParts = {
            roles: profile.target_roles,
            locations: profile.locations,
            work_mode: profile.work_mode,
            remote_base_country: profile.remote_base_country,
            industries: profile.industries,
            skills: profile.skills,
            seniority_level: profile.seniority_level,
        };
        const str = JSON.stringify(keyParts);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return String(hash);
    };

    // CSV EXPORT
    const handleExportCSV = () => {
        if (leads.length === 0) return;
        const headers = ['Company', 'Role', 'Score', 'URL', 'Salary', 'Status', 'Days Posted', 'Source', 'Pros', 'Cons', 'Matched Skills', 'Missing Skills'];
        const rows = leads.map(l => [
            l.company_name,
            l.role_title,
            l.score,
            l.url,
            l.salary || 'N/A',
            l.status,
            l.days_since_posted ?? '?',
            l.source,
            (l.pros || []).join('; '),
            (l.cons || []).join('; '),
            (l.matched_skills || []).join('; '),
            (l.missing_skills || []).join('; ')
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `job-radar-leads-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // APPLICATION TRACKING
    const handleStatusChange = (leadId: string, newStatus: ScoredLead['status']) => {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    };

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
        setLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
    };

    const handleInitialize = () => {
        setStage('strategy');
    };

    const handleRun = async () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setError(null); setLogs([]); setStage('searching');
        
        if (!userConfig) {
            setError("User configuration is not loaded.");
            setStage('idle');
            return;
        }

        try {
            const actualSerperKey = getKey(STORAGE_KEYS.SERPER_KEY) || "";
            addLog("Verifying API Quota...", 'info');
            const quota = await checkSerperQuota(actualSerperKey, 50);
            if (!quota.ok) throw new Error(quota.msg || "Serper Quota Check Failed");

            if (controller.signal.aborted) throw new Error("Cancelled");

            addLog("Launching Broad Discovery (High Recall Mode)...", 'info');
            
            const onDiscoveryProgress = (progress: DiscoveryProgress) => {
                setSearchProgress(progress);
            };

            let rawSignals = await searchForSignals(userConfig, addLog, onDiscoveryProgress, controller.signal);
            
            // CACHING FOR RESILIENCE
            if (rawSignals.length > 0) {
                saveKey(STORAGE_KEYS.RAW_SIGNALS_CACHE, JSON.stringify({ 
                    timestamp: Date.now(), 
                    signals: rawSignals 
                }));
            }

            if (rawSignals.length === 0) {
                setError("No leads found matching criteria.");
                setStage('idle');
                return;
            }

            const existingLeadsMap = new Map(leads.map(l => [l.url, l]));
            const signalsToScore: any[] = [];
            const cachedLeads: ScoredLead[] = [];
            const profileHash = computeProfileHash(userConfig);
            const scoreCache = getLeadScoreCache();

            rawSignals.forEach(sig => {
                const normUrl = sig.url.split('?')[0];

                // Reuse leads from current in-memory run
                if (existingLeadsMap.has(sig.url)) {
                    cachedLeads.push(existingLeadsMap.get(sig.url)!);
                    return;
                }

                // Reuse leads from persistent cache if profile hash matches
                const cachedEntry: LeadScoreCacheEntry | undefined = scoreCache[normUrl];
                if (cachedEntry && cachedEntry.profileHash === profileHash && cachedEntry.lead) {
                    cachedLeads.push(cachedEntry.lead as ScoredLead);
                    return;
                }

                signalsToScore.push(sig);
            });

            if (cachedLeads.length > 0) {
                addLog(`Smart Cache: Reusing ${cachedLeads.length} already scored leads.`, 'success');
            }

            let newlyScoredResults: ScoredLead[] = [];
            if (signalsToScore.length > 0) {
                addLog(`AI Analysis: Scoring ${signalsToScore.length} new signals...`, 'info');
                setStage('scoring');
                if (controller.signal.aborted) throw new Error("Cancelled");
                newlyScoredResults = await scoreSignals(
                    signalsToScore,
                    userConfig,
                    (msg) => addLog(msg, 'info'),
                    (chunkLeads) => {
                        // Stream results into UI as they complete for faster perceived performance.
                        const chunkFailed = chunkLeads.filter(l => l.status === 'failed' || l.decision === 'FAILED' || !isLocationRelevant(l));
                        const chunkOk = chunkLeads.filter(l => !(l.status === 'failed' || l.decision === 'FAILED') && isLocationRelevant(l));

                        if (chunkOk.length > 0) {
                            setLeads(prev => {
                                const map = new Map(prev.map(l => [l.url, l]));
                                chunkOk.forEach(l => map.set(l.url, l));
                                return Array.from(map.values()).sort((a, b) => b.score - a.score);
                            });
                        }
                        if (chunkFailed.length > 0) {
                            setFailedLeads(prev => {
                                const map = new Map(prev.map(l => [l.url, l]));
                                chunkFailed.forEach(l => map.set(l.url, l));
                                return Array.from(map.values()).sort((a, b) => b.score - a.score);
                            });
                        }
                    }
                );

                // Update persistent score cache with fresh results
                const profileHashForSave = computeProfileHash(userConfig);
                const updatedCache = { ...scoreCache };
                newlyScoredResults
                    .filter(lead => !(lead.status === 'failed' || lead.decision === 'FAILED'))
                    .forEach(lead => {
                    const normUrl = lead.url.split('?')[0];
                    updatedCache[normUrl] = {
                        url: normUrl,
                        profileHash: profileHashForSave,
                        lead
                    };
                });
                saveLeadScoreCache(updatedCache);
            }

            const combinedResults = [...cachedLeads, ...newlyScoredResults];
            combinedResults.forEach(l => markLeadAsSeen(l.url));
            
            // Phase 2: keep failed/unscored out of the main feed
            const failed = combinedResults.filter(l => l.status === 'failed' || l.decision === 'FAILED' || !isLocationRelevant(l));
            const validLeads = combinedResults.filter(l => !(l.status === 'failed' || l.decision === 'FAILED') && isLocationRelevant(l));

            if (validLeads.length === 0) {
                setError("All found leads were rejected by AI as mismatches.");
                addLog("Mission Complete, but Gatekeeper blocked all results.", 'error');
            } else {
                addLog(`Mission Complete. ${validLeads.length} qualified leads.`, 'success');
            }

            const finalLeads = validLeads.sort((a, b) => b.score - a.score);
            setLeads(finalLeads);
            setFailedLeads(failed.sort((a, b) => b.score - a.score));
            setStage('complete');
            
            // CLEAR CACHE ON SUCCESS
            saveKey(STORAGE_KEYS.RAW_SIGNALS_CACHE, '');

            // Append to run history for analytics
            appendToRunHistory(Date.now());

            // Non-blocking company news enrichment for top leads
            const serperKeyStr = getKey(STORAGE_KEYS.SERPER_KEY);
            if (serperKeyStr && finalLeads.length > 0) {
                enrichLeadsWithCompanyNews(finalLeads, serperKeyStr)
                    .then(enrichedLeads => {
                        setLeads(enrichedLeads);
                        addLog('Company news enrichment complete.', 'success');
                    })
                    .catch(() => {
                        // Non-critical, ignore silently
                    });
            }

        } catch (err: any) {
            console.error(err);
            if (err.name === 'AbortError' || err.message === 'Cancelled') {
                setError("Scan Cancelled.");
                addLog("Scan manually cancelled.", 'error');
            } else {
                setError(err.message || "Mission Failed.");
                addLog(`Failure: ${err.message}`, 'error');
            }
            setStage('idle');
        } finally {
            abortControllerRef.current = null;
        }
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setError("Scan Manually Cancelled");
            setStage('idle');
        }
    };

    const handleRestoreProgress = async () => {
        const cacheRaw = getKey(STORAGE_KEYS.RAW_SIGNALS_CACHE);
        if (!cacheRaw) return;
        
        try {
            const { signals } = JSON.parse(cacheRaw);
            if (!signals || signals.length === 0) return;
            
            setError(null);
            setLogs([]);
            addLog(`Recovery: Found ${signals.length} unsaved signals from previous run. Resuming...`, 'info');
            setStage('scoring');
            
            const newlyScored = await scoreSignals(
                signals,
                userConfig!,
                (msg) => addLog(msg, 'info'),
                (chunkLeads) => {
                    const chunkFailed = chunkLeads.filter(l => l.status === 'failed' || l.decision === 'FAILED' || !isLocationRelevant(l));
                    const chunkOk = chunkLeads.filter(l => !(l.status === 'failed' || l.decision === 'FAILED') && isLocationRelevant(l));

                    if (chunkOk.length > 0) {
                        setLeads(prev => {
                            const map = new Map(prev.map(l => [l.url, l]));
                            chunkOk.forEach(l => map.set(l.url, l));
                            return Array.from(map.values()).sort((a, b) => b.score - a.score);
                        });
                    }
                    if (chunkFailed.length > 0) {
                        setFailedLeads(prev => {
                            const map = new Map(prev.map(l => [l.url, l]));
                            chunkFailed.forEach(l => map.set(l.url, l));
                            return Array.from(map.values()).sort((a, b) => b.score - a.score);
                        });
                    }
                }
            );
            
            const failed = newlyScored.filter(l => l.status === 'failed' || l.decision === 'FAILED' || !isLocationRelevant(l));
            const validLeads = newlyScored.filter(l => !(l.status === 'failed' || l.decision === 'FAILED') && isLocationRelevant(l));
            combinedResultsUpdated(validLeads, failed);
            
            addLog(`Recovery Complete. Added ${validLeads.length} leads.`, 'success');
            saveKey(STORAGE_KEYS.RAW_SIGNALS_CACHE, '');
        } catch (e) {
            console.warn("Restoration failed", e);
            saveKey(STORAGE_KEYS.RAW_SIGNALS_CACHE, '');
        }
    };

    const combinedResultsUpdated = (newLeads: ScoredLead[], newFailed: ScoredLead[] = []) => {
        setLeads(prev => {
            const combined = [...prev, ...newLeads];
            // Deduplicate by URL
            const map = new Map();
            combined.forEach(l => map.set(l.url, l));
            return Array.from(map.values()).sort((a, b) => b.score - a.score);
        });
        if (newFailed.length > 0) {
            setFailedLeads(prev => {
                const combined = [...prev, ...newFailed];
                const map = new Map();
                combined.forEach(l => map.set(l.url, l));
                return Array.from(map.values()).sort((a, b) => b.score - a.score);
            });
        }
        setStage('complete');
    };

    // --- SMART LOCATION RELEVANCE ---
    function isLocationRelevant(lead: ScoredLead): boolean {
        const userLocs = userConfig?.locations || [];
        if (userLocs.length === 0) return true; // No preference = everything is relevant

        const loc = lead.inferred_location || lead.location || '';
        
        // Handle structured LocationData
        if (typeof loc === 'object' && loc !== null) {
            if (loc.is_remote && userLocs.some(ul => ul.toLowerCase().includes('remote'))) return true;
            
            return userLocs.some(ul => {
                const target = ul.toLowerCase().trim();
                const city = loc.city?.toLowerCase() || '';
                const country = loc.country?.toLowerCase() || '';
                const region = loc.region?.toLowerCase() || '';
                const raw = loc.raw?.toLowerCase() || '';

                // Precise hierarchical matching
                return city === target || 
                       country === target || 
                       region === target ||
                       raw.includes(target) ||
                       target.includes(city && city.length > 3 ? city : '___never___');
            });
        }

        // Fallback for flat strings (backwards compatibility)
        const leadLoc = String(loc).toLowerCase();
        if (!leadLoc || leadLoc === 'unknown') return false;
        if (leadLoc.includes('remote') && userLocs.some((ul: string) => ul.toLowerCase().includes('remote'))) return true;
        
        return userLocs.some((ul: string) => {
            const userLoc = ul.toLowerCase().trim();
            return leadLoc.includes(userLoc) || userLoc.includes(leadLoc);
        });
    };

    const handleDeepAnalyze = async (lead: ScoredLead) => {
        if (analyzingId === lead.id) return;
        setAnalyzingId(lead.id);
        try {
            const prompt = `You are an expert career analyst. Analyze this job opportunity for the candidate and return ONLY valid JSON.

JOB DETAILS:
- Role: ${lead.role_title}
- Company: ${lead.company_name}
- Job Description: ${lead.snippet?.slice(0, 800) || 'Not available'}
- URL: ${lead.url}
- Match Score: ${lead.score}/100

CANDIDATE PROFILE:
- Skills: ${userConfig?.skills?.join(', ') || 'Unknown'}
- Target Roles: ${userConfig?.target_roles?.join(', ') || 'Unknown'}
- Seniority: ${userConfig?.seniority_level || 'Unknown'}

RESPOND WITH THIS EXACT JSON STRUCTURE (no markdown, no extra text):
{
  "summary": "2-3 sentence analysis of this specific role and how the candidate fits",
  "culture_fit": "1 sentence predicting the company culture and working style",
  "interview_tips": ["tip 1", "tip 2", "tip 3"]
}`;
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Analysis timed out after 30s')), 30000)
            );
            const data = await Promise.race([generateScoringJSON(prompt), timeoutPromise]);
            if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
                throw new Error('Empty response from AI');
            }
            const analysis: DeepAnalysisData = {
                summary: data.summary || `Analysis of ${lead.company_name} for the ${lead.role_title} role.`,
                culture_fit: data.culture_fit || 'Culture information unavailable from snippet.',
                interview_tips: Array.isArray(data.interview_tips) && data.interview_tips.length > 0
                    ? data.interview_tips
                    : ['Research the company\'s recent news', 'Prepare STAR-format examples', 'Ask about team structure']
            };
            setAnalysisResults(prev => ({ ...prev, [lead.id]: analysis }));
            // Auto-scroll to the analysis result
            setTimeout(() => {
                document.getElementById(`analysis-${lead.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } catch (e: any) {
            console.error("Deep analysis failed:", e?.message || e);
            const fallback: DeepAnalysisData = {
                summary: `Analysis failed: ${e?.message || 'Unknown error'}. Review the job posting directly for ${lead.company_name}.`,
                culture_fit: 'Unable to analyze culture fit — please review manually.',
                interview_tips: ['Research the company thoroughly', 'Prepare relevant STAR-format examples', 'Ask thoughtful questions about the role']
            };
            setAnalysisResults(prev => ({ ...prev, [lead.id]: fallback }));
        } finally {
            setAnalyzingId(null);
        }
    };

    const handleReportDeadLink = (lead: ScoredLead) => {
        setReportedDeadLinks(prev => {
            const next = new Set(prev);
            next.add(lead.id);
            return next;
        });
        // Remove from leads to clean up the feed
        setLeads(prev => prev.filter(l => l.id !== lead.id));
    };

    // --- POST-SCORING DEDUPLICATION ---
    // The pre-scoring fingerprint can miss duplicates when the same job
    // appears from different search queries with different snippets/URLs.
    // After scoring, we have LLM-normalized role_title — use it to catch
    // remaining duplicates. Keep the version with the highest score.
    const deduplicatedLeads = (() => {
        const seen = new Map<string, ScoredLead>();
        for (const lead of leads) {
            // Normalize: lowercase, strip non-alphanumeric, trim
            const normTitle = lead.role_title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normCompany = lead.company_name.toLowerCase().replace(/[^a-z0-9]/g, '');
            // Key: first 50 chars of title + company (handles minor title variations)
            const key = `${normTitle.slice(0, 50)}::${normCompany.slice(0, 30)}`;
            const existing = seen.get(key);
            if (!existing || lead.score > existing.score) {
                seen.set(key, lead);
            }
        }
        return Array.from(seen.values());
    })();

    // Pre-compute the base set without status filtering
    // Phase 2: main feed never includes failed leads
    const baseLeads = deduplicatedLeads.filter(l => !(l.status === 'failed' || l.decision === 'FAILED') && isLocationRelevant(l));

    // Compute counts relative to baseLeads (unfiltered by minScore)
    const urgentCount = baseLeads.filter(l => l.urgency_score > 0).length;
    const salaryCount = baseLeads.filter(l => l.salary && l.salary !== "Not disclosed").length;
    const recentCount = baseLeads.filter(l => (l.days_since_posted ?? 999) <= 3).length;
    // Extract unique locations from leads + user config as fallback
    const leadLocations = baseLeads
        .map(l => {
            const loc = l.inferred_location || l.location || '';
            if (typeof loc === 'object' && loc !== null) {
                if (loc.is_remote) return 'Remote';
                return [loc.city, loc.country].filter(Boolean).join(', ');
            }
            return String(loc);
        })
        .filter(loc => loc && loc !== 'Unknown');
    const userLocations = userConfig?.locations || [];
    const uniqueLocations = Array.from(new Set([...leadLocations, ...userLocations])).sort();
    
    const displayedLeads = baseLeads
        .filter(lead => {
            if (showFailedOnly) return false;
            // Score filter
            if (lead.score < minScore) return false;
            
            // Boolean UI filters — each one narrows the set
            if (filterUrgent && !(lead.urgency_score > 0)) return false;
            if (filterSalary && (!lead.salary || lead.salary === "Not disclosed")) return false;
            if (filterRecency && (lead.days_since_posted ?? 999) > 3) return false;
            // Specific Location filter
            if (filterLocation.length > 0) {
                const loc = lead.inferred_location || lead.location || '';
                const leadLocStr = typeof loc === 'object' ? `${loc.city || ''} ${loc.country || ''} ${loc.raw || ''}`.toLowerCase() : String(loc).toLowerCase();
                if (!filterLocation.some(fl => leadLocStr.includes(fl.toLowerCase()))) return false;
            }
            return true;
        })
        .sort((a, b) => {
            // When recency filter is on, also sort newest-first
            if (filterRecency) {
                const aDays = a.days_since_posted ?? 999;
                const bDays = b.days_since_posted ?? 999;
                if (aDays !== bDays) return aDays - bDays;
            }
            return b.score - a.score;
        });

    const renderScoreBar = (label: string, value: number, max: number, colorClass: string) => (
        <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-400 w-24 text-right uppercase tracking-wider">{label}</span>
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${colorClass}`}
                    style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
                ></div>
            </div>
            <span className="text-[10px] font-bold text-slate-700 dark:text-white w-8">{value}/{max}</span>
        </div>
    );

    const renderJobCard = (lead: ScoredLead) => {
        let domain = ""; try { domain = new URL(lead.url).hostname; } catch (e) { }
        const logoUrl = lead.company_name !== "Not specified" && lead.company_name !== "Unknown"
            ? `https://logo.clearbit.com/${lead.company_name.replace(/\s+/g, '').toLowerCase()}.com`
            : `https://logo.clearbit.com/${domain}`;
        
        // V2 Semantic Score Colors
        const scoreColor = lead.score >= 80 ? 'text-[#1D1D1F] dark:text-white' : lead.score >= 50 ? 'text-[#1D1D1F] dark:text-white' : 'text-[#1D1D1F] dark:text-white';
        const scoreRingColor = lead.score >= 80 ? '#1A8738' : lead.score >= 50 ? '#B45309' : '#D70015';

        return (
            <Card key={lead.id} className="relative group overflow-hidden apple-card dark:bg-[#1C1C1E] dark:shadow-none dark:ring-0 p-6 sm:p-7">
                <div className="flex items-start justify-between gap-5 mb-5">
                    <div className="flex-1">
                        <div className="flex items-start sm:items-center gap-5">
                            <div className="w-16 h-16 bg-[#FAFAFA] dark:bg-[#2C2C2E] rounded-[20px] flex items-center justify-center border border-slate-200/60 dark:border-slate-600/40 overflow-hidden shrink-0 shadow-sm mt-1 sm:mt-0">
                                <img src={logoUrl} onError={(e) => { (e.target as HTMLImageElement).onerror = null; (e.target as HTMLImageElement).style.display = 'none'; }} alt="Logo" className="w-full h-full object-contain p-2" />
                                <span className="text-2xl">🏢</span>
                            </div>
                            <div>
                                <h3 className="text-xl sm:text-2xl font-bold text-[#1D1D1F] dark:text-white tracking-tight leading-tight group-hover:text-[#0071E3] transition-colors">{lead.role_title}</h3>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <a href={lead.url} target="_blank" className="text-slate-600 dark:text-slate-300 font-semibold hover:text-[#0071E3] dark:hover:text-[#5AC8FA] hover:underline flex items-center gap-1.5 text-sm sm:text-[0.95rem]">
                                        {lead.company_name}
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                    </a>
                                    <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] uppercase font-bold tracking-widest bg-[#EEEDFD] dark:bg-slate-800 text-[#5856D6] dark:text-slate-300 px-2.5 py-1 rounded-md border border-[#5856D6]/20 dark:border-slate-600/40">
                                            {lead.source.replace('google-search', 'WEB').replace('regional-board', 'REGIONAL')}
                                        </span>
                                        {!isNovelLead(lead.url) && (
                                            <span className="text-[10px] uppercase font-bold tracking-widest bg-[#EEEDFD] dark:bg-slate-800 text-[#5856D6] dark:text-slate-300 px-2.5 py-1 rounded-md border border-[#5856D6]/20 dark:border-slate-600/40">
                                                SEEN BEFORE
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {(lead.matched_skills?.length || 0) > 0 && (
                            <div className="flex flex-wrap gap-2 mt-5 sm:ml-[84px]">
                                {lead.matched_skills?.slice(0, 4).map((skill, i) => (
                                    <span key={i} className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-[#E5F1FF] text-[#0071E3] dark:bg-blue-900/30 dark:text-blue-400 tracking-widest border border-[#0071E3]/20 dark:border-blue-500/30">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-1 shrink-0 ml-2 mt-1">
                        <div
                            className="relative w-16 h-16 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setExpandedScoreId(expandedScoreId === lead.id ? null : lead.id)}
                            title="Click to view Score Breakdown"
                        >
                            <svg className="w-full h-full transform -rotate-90" style={{ filter: `drop-shadow(0 0 6px ${scoreRingColor}40)` }}>
                                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                                <circle cx="32" cy="32" r="28" stroke={scoreRingColor} strokeWidth="6" strokeLinecap="round" fill="transparent" strokeDasharray={175} strokeDashoffset={175 - (175 * lead.score) / 100} className="transition-all duration-1000 ease-out" />
                            </svg>
                            <span className={`absolute text-[1.1rem] font-bold ${scoreColor}`}>{lead.score}</span>
                        </div>
                    </div>
                </div>

                {expandedScoreId === lead.id && lead.breakdown && (
                    <div className="bg-[#F2F2F7] dark:bg-slate-900/50 rounded-2xl p-5 mb-5 animate-in slide-in-from-top-2 fade-in shadow-inner border border-[#D1D1D6]/30">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#D1D1D6] dark:border-slate-800">
                            <h4 className="text-xs font-bold text-[#1D1D1F] dark:text-slate-200 uppercase tracking-widest">Scorecard Breakdown</h4>
                        </div>
                        <div className="space-y-3">
                            {renderScoreBar("Role Fit", lead.breakdown.role_fit, 30, "bg-[#0071E3]")}
                            {renderScoreBar("Location", lead.breakdown.location_fit, 20, "bg-[#1A8738]")}
                            {renderScoreBar("Experience", lead.breakdown.experience_fit, 20, "bg-[#5856D6]")}
                            {renderScoreBar("Domain", lead.breakdown.domain_fit, 30, "bg-[#FF9500]")}
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mb-5 text-sm mt-4">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${lead.salary && lead.salary !== 'Not disclosed' ? 'bg-[#EEEDFD] text-[#5856D6]' : 'bg-[#F2F2F7] dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                        <span className="text-sm leading-none">💰</span>
                        {lead.salary || 'Not disclosed'}
                    </div>
                    <div className="flex items-center gap-1.5 bg-[#F2F2F7] dark:bg-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <span className="text-sm leading-none">⏰</span>
                        {lead.days_since_posted === 0 ? 'Posted Today' : `${lead.days_since_posted || '?'} days ago`}
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                        (() => {
                            const loc = lead.inferred_location || lead.location || '';
                            const isKnown = typeof loc === 'object' ? (loc.city || loc.country || loc.is_remote) : (loc && loc !== 'Unknown');
                            return isKnown ? 'bg-[#EEEDFD] text-[#5856D6]' : 'bg-[#F2F2F7] dark:bg-slate-800 text-slate-500 dark:text-slate-400';
                        })()
                    }`}>
                        <span className="text-sm leading-none">📍</span>
                        {(() => {
                            const loc = lead.inferred_location || lead.location || '';
                            if (typeof loc === 'object' && loc !== null) {
                                if (loc.is_remote) return <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#5856D6] animate-pulse" /> Fully Remote</span>;
                                return [loc.city, loc.country].filter(Boolean).join(', ') || 'Unknown';
                            }
                            return String(loc) || 'Unknown';
                        })()}
                    </div>
                    {lead.urgency_score > 0 && (
                        <div className="flex items-center gap-1.5 bg-[#FFE5E5] px-3 py-1.5 rounded-full text-[#D70015] text-[10px] font-bold uppercase tracking-wide">
                            🔥 High Priority
                        </div>
                    )}
                    {!isLocationRelevant(lead) && (userConfig?.locations?.length || 0) > 0 && (
                        <div className="flex items-center gap-1.5 bg-[#FFF4E5] px-3 py-1.5 rounded-full text-[#B45309] text-[10px] font-bold uppercase tracking-wide">
                            ⚠️ Location Mismatch
                        </div>
                    )}
                </div>
                
                {lead.is_local_fallback && (
                    <div className="bg-[#FFF8E6] dark:bg-amber-950/20 rounded-xl p-3 mb-4 border border-[#F59E0B]/30 dark:border-amber-900/40">
                        <span className="text-[11px] font-bold text-[#D97706] dark:text-amber-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                            <span className="text-sm leading-none">⚡</span> Evaluated Offline (AI API Bypassed)
                        </span>
                        <p className="text-[13px] text-[#1D1D1F] dark:text-slate-300 font-medium leading-relaxed">
                            This lead was processed extremely fast by the Local Rules Engine because your primary AI API encountered an error or rate limit.
                        </p>
                    </div>
                )}
                
                {lead.decision === 'FAILED' && lead.reasoning?.length > 0 && (
                    <div className="bg-[#FFF0F0] dark:bg-red-950/20 rounded-xl p-3 mb-4 border border-[#FF3B30]/30 dark:border-red-900/40">
                        <span className="text-[11px] font-bold text-[#FF3B30] dark:text-red-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                            <span className="text-sm leading-none">🚫</span> Rejection Reason
                        </span>
                        <p className="text-[13px] text-[#1D1D1F] dark:text-slate-300 font-medium leading-relaxed">
                            {lead.reasoning[0]}
                        </p>
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div className="bg-[#E3F9E5] dark:bg-emerald-950/20 rounded-2xl p-4 border border-[#1A8738]/20 dark:border-emerald-900/30">
                        <h4 className="text-[11px] font-bold text-[#1A8738] dark:text-emerald-500 uppercase flex items-center gap-1.5 tracking-widest mb-3"><span className="text-[#1A8738]">✓</span> Key Matches</h4>
                        <div className="flex flex-wrap gap-2">
                            {lead.pros?.length > 0 ? lead.pros.slice(0, 3).map((pro, i) => (
                                <span key={i} className="text-xs font-medium text-[#1A8738] dark:text-emerald-300 bg-white/70 dark:bg-emerald-800/40 px-2.5 py-1 rounded-md leading-snug border border-[#1A8738]/10">{pro}</span>
                            )) : <span className="text-xs text-[#1A8738]/60 italic">No specific signals</span>}
                        </div>
                    </div>
                    <div className="bg-[#FFF4E5] dark:bg-amber-950/20 rounded-2xl p-4 border border-[#B45309]/20 dark:border-amber-900/30">
                        <h4 className="text-[11px] font-bold text-[#B45309] dark:text-amber-500 uppercase flex items-center gap-1.5 tracking-widest mb-3"><span className="text-[#B45309]">⚠️</span> Gaps</h4>
                        <div className="flex flex-wrap gap-2">
                            {lead.missing_skills?.length > 0 && lead.missing_skills.map((s, i) => (
                                <span key={`s-${i}`} className="text-xs font-bold text-[#B45309] dark:text-amber-300 bg-white/70 dark:bg-amber-800/60 px-2.5 py-1 rounded-md leading-snug border border-[#B45309]/10">{s}</span>
                            ))}
                            {lead.cons?.length > 0 && lead.cons.map((con, i) => (
                                <span key={`c-${i}`} className="text-xs font-medium text-[#B45309] dark:text-amber-300 bg-white/70 dark:bg-amber-800/40 px-2.5 py-1 rounded-md leading-snug border border-[#B45309]/10">{con}</span>
                            ))}
                            {!lead.missing_skills?.length && !lead.cons?.length && <span className="text-xs text-[#B45309]/60 italic">None detected</span>}
                        </div>
                    </div>
                </div>

                {/* Company News */}
                {lead.company_news && (
                    <div className="bg-[#E5F1FF] dark:bg-blue-950/20 rounded-2xl p-4 mb-5 border border-[#0071E3]/20 dark:border-blue-900/30">
                        <span className="text-[11px] font-bold text-[#0071E3] uppercase tracking-widest flex items-center gap-1.5"><span className="text-sm leading-none">📰</span> Latest News</span>
                        <a href={lead.company_news.url} target="_blank" rel="noreferrer" className="block text-sm text-[#0071E3] dark:text-blue-100 mt-2 hover:underline transition-colors font-medium">
                            {lead.company_news.headline}
                        </a>
                        {lead.company_news.date && (
                            <span className="text-[10px] font-semibold text-[#0071E3]/60 mt-1.5 block uppercase tracking-wider">{lead.company_news.date}</span>
                        )}
                    </div>
                )}

                {/* Salary Panel */}
                <div className="mt-6 pt-4 border-t border-[#D1D1D6]/50 dark:border-slate-800/50">
                    <SalaryPanel
                        role={lead.role_title}
                        location={userConfig?.locations?.[0] || 'Unknown'}
                        yearsExp={5}
                        companyName={lead.company_name}
                    />
                </div>
                
                <div className="pt-5 mt-4 border-t border-[#D1D1D6]/50 dark:border-slate-800/50">
                    <div className="flex flex-col sm:flex-row gap-4 w-full justify-between items-center">
                        <div className="flex flex-wrap gap-2.5 justify-center sm:justify-start w-full sm:w-auto">
                            <Button onClick={() => handleDeepAnalyze(lead)} disabled={analyzingId === lead.id} variant="outline" className={`h-10 px-5 text-xs text-[#0071E3] font-bold rounded-full border-[#0071E3]/30 hover:bg-[#E5F1FF] ${analyzingId === lead.id ? 'animate-pulse' : ''}`} title="Deep Analyze">
                                🕵️ <span className="hidden sm:inline ml-1">{analyzingId === lead.id ? 'Analyzing...' : 'Analyze'}</span>
                            </Button>
                            <Button onClick={() => setCoverLetterLead(lead)} variant="outline" className="h-10 px-5 text-xs text-[#0071E3] font-bold rounded-full border-[#0071E3]/30 hover:bg-[#E5F1FF]" title="Draft Cover Letter">
                                📝 <span className="hidden sm:inline ml-1">Letter</span>
                            </Button>
                            <Button onClick={() => setInterviewPrepLead(lead)} variant="outline" className="h-10 px-5 text-xs text-[#0071E3] font-bold rounded-full border-[#0071E3]/30 hover:bg-[#E5F1FF]" title="Interview Prep">
                                🎯 <span className="hidden sm:inline ml-1">Prep</span>
                            </Button>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                            <a href={lead.url} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none flex items-center justify-center h-10 px-6 rounded-full text-sm font-bold text-[#1D1D1F] dark:text-slate-200 bg-[#F2F2F7] dark:bg-slate-800 hover:bg-[#E5E5EA] dark:hover:bg-slate-700 transition-all">View Post ↗</a>
                            <Button onClick={() => setSelectedLead(lead)} className="flex-1 sm:flex-none btn-primary h-10 px-6">✨ Draft Outreach</Button>
                        </div>
                    </div>
                </div>

                {analysisResults[lead.id] && (
                    <div id={`analysis-${lead.id}`} className="mt-4 p-4 bg-[#EEEDFD] dark:bg-indigo-950/30 border border-[#5856D6]/20 dark:border-indigo-500/30 rounded-lg animate-in fade-in slide-in-from-top-2">
                        <h4 className="text-xs font-bold text-[#5856D6] dark:text-indigo-400 uppercase tracking-widest mb-2">Deep Analysis Report</h4>
                        <p className="text-sm text-[#1D1D1F] dark:text-slate-300 mb-2">{analysisResults[lead.id].summary}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                            <div>
                                <span className="text-[10px] text-[#5856D6] dark:text-indigo-500 uppercase font-bold">Culture Fit</span>
                                <p className="text-xs text-[#1D1D1F] dark:text-slate-400">{analysisResults[lead.id].culture_fit}</p>
                            </div>
                            <div>
                                <span className="text-[10px] text-[#5856D6] dark:text-indigo-500 uppercase font-bold">Interview Tips</span>
                                <ul className="list-disc list-inside text-xs text-[#1D1D1F] dark:text-slate-400">
                                    {analysisResults[lead.id].interview_tips.map((tip, i) => <li key={i}>{tip}</li>)}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </Card>
        );
    };

    if (stage === 'strategy') return <StrategyReview config={userConfig} onConfirm={handleRun} onUpdateConfig={setUserConfig} onCancel={() => setStage('idle')} />;

    const failedCount = failedLeads.length;
    const totalLeadsCount = leads.length + failedLeads.length;
    const shownCount = showFailedOnly ? failedLeads.length : displayedLeads.length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-gradient-to-r from-slate-50 to-white dark:from-[#1C1C1E] dark:to-[#1C1C1E] border border-slate-200/80 dark:border-slate-700/50 p-5 rounded-[28px] shadow-[0_2px_12px_rgb(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgb(0,0,0,0.3)] relative z-10 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
                    <div>
                        <h2 className="text-[1.35rem] tracking-tight font-bold text-slate-800 dark:text-white flex items-center gap-3">
                            Active Radar
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 font-medium text-sm mt-0.5">
                            {totalLeadsCount > 0 ? (
                                <><strong className="text-slate-700 dark:text-slate-300 font-bold">{shownCount}</strong> candidates shown (from {totalLeadsCount})</>
                            ) : "Standing by"}
                        </p>
                    </div>
                </div>
                {stage === 'idle' || stage === 'complete' || stage === 'scoring' ? (
                    <div className="flex flex-col gap-4 w-full xl:w-auto mt-4 xl:mt-0">
                        <div className="flex flex-wrap xl:flex-nowrap items-center justify-start xl:justify-end gap-3 w-full">
                            {totalLeadsCount > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <button onClick={() => setFilterUrgent(!filterUrgent)} className={`px-3.5 py-1.5 rounded-2xl text-[13px] font-bold transition-all border ${filterUrgent ? 'bg-[#FF3B30] border-[#FF3B30] text-white shadow-[0_2px_8px_rgba(255,59,48,0.35)]' : 'bg-white dark:bg-[#2C2C2E] border-slate-200/80 dark:border-slate-600/60 text-slate-700 dark:text-slate-200 hover:bg-[#FFF5F5] dark:hover:bg-[#3A2C2C] hover:border-[#FF3B30]/40 dark:hover:border-[#FF3B30]/40'}`}>🔥 Urgent{urgentCount > 0 ? ` · ${urgentCount}` : ''}</button>
                                    <button onClick={() => setFilterSalary(!filterSalary)} className={`px-3.5 py-1.5 rounded-2xl text-[13px] font-bold transition-all border ${filterSalary ? 'bg-[#34C759] border-[#34C759] text-white shadow-[0_2px_8px_rgba(52,199,89,0.35)]' : 'bg-white dark:bg-[#2C2C2E] border-slate-200/80 dark:border-slate-600/60 text-slate-700 dark:text-slate-200 hover:bg-[#F0FFF4] dark:hover:bg-[#2C3A2E] hover:border-[#34C759]/40 dark:hover:border-[#34C759]/40'}`}>💰 Salary{salaryCount > 0 ? ` · ${salaryCount}` : ''}</button>
                                    <button onClick={() => setFilterRecency(!filterRecency)} className={`px-3.5 py-1.5 rounded-2xl text-[13px] font-bold transition-all border ${filterRecency ? 'bg-[#0071E3] border-[#0071E3] text-white shadow-[0_2px_8px_rgba(0,113,227,0.35)]' : 'bg-white dark:bg-[#2C2C2E] border-slate-200/80 dark:border-slate-600/60 text-slate-700 dark:text-slate-200 hover:bg-[#F0F7FF] dark:hover:bg-[#2C2E3A] hover:border-[#0071E3]/40 dark:hover:border-[#0071E3]/40'}`}>🕒 Newest{recentCount > 0 ? ` · ${recentCount}` : ''}</button>
                                    {failedCount > 0 && (
                                        <button onClick={() => setShowFailedOnly(!showFailedOnly)} className={`px-3.5 py-1.5 rounded-2xl text-[13px] font-bold transition-all border ${showFailedOnly ? 'bg-slate-800 border-slate-800 text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)]' : 'bg-white dark:bg-[#2C2C2E] border-slate-200/80 dark:border-slate-600/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                                            ⚠️ Failed · {failedCount}
                                        </button>
                                    )}
                                    {uniqueLocations.length > 0 && (
                                        <div className="relative group/locfilter">
                                            <button
                                                className={`px-3.5 py-1.5 rounded-2xl text-[13px] font-bold transition-all border appearance-none cursor-pointer flex items-center gap-1.5 min-w-[100px] justify-center ${
                                                    filterLocation.length > 0
                                                        ? 'bg-[#5856D6] border-[#5856D6] text-white shadow-[0_2px_8px_rgba(88,86,214,0.35)]'
                                                        : 'bg-white dark:bg-[#2C2C2E] border-slate-200/80 dark:border-slate-600/60 text-slate-700 dark:text-slate-200 hover:bg-[#F5F0FF] dark:hover:bg-[#2E2C3A] hover:border-[#5856D6]/40 dark:hover:border-[#5856D6]/40'
                                                }`}
                                            >
                                                <span>📍 Location</span>
                                                {filterLocation.length > 0 && (
                                                    <span className="bg-white/20 text-white px-1.5 py-0.5 rounded-md text-[10px] leading-none">{filterLocation.length}</span>
                                                )}
                                            </button>
                                            <div className="absolute top-full mt-2 left-0 hidden group-hover/locfilter:block bg-white dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-2 z-50 min-w-[220px] max-h-[300px] overflow-y-auto">
                                                {uniqueLocations.map(loc => (
                                                    <label key={loc} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-[#3A3A3C] rounded-lg cursor-pointer transition-colors group/item">
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${filterLocation.includes(loc) ? 'bg-[#5856D6] border-[#5856D6]' : 'border-slate-300 dark:border-slate-600 group-hover/item:border-[#5856D6]'}`}>
                                                            {filterLocation.includes(loc) && <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-white"><path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                                        </div>
                                                        <input 
                                                            type="checkbox" 
                                                            className="hidden"
                                                            checked={filterLocation.includes(loc)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setFilterLocation(prev => [...prev, loc]);
                                                                else setFilterLocation(prev => prev.filter(l => l !== loc));
                                                            }}
                                                        />
                                                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-tight">{loc}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            <div className="hidden xl:block w-px h-6 bg-slate-200 dark:bg-slate-700/60 mx-1 shrink-0"></div>
                            
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {totalLeadsCount > 0 && (
                                    <button onClick={handleExportCSV} className="h-9 w-10 flex items-center justify-center rounded-2xl bg-white dark:bg-[#2C2C2E] text-slate-500 hover:text-[#0071E3] dark:text-slate-400 dark:hover:text-[#5AC8FA] transition-all border border-slate-200/80 dark:border-slate-600/60 hover:border-[#0071E3]/30 dark:hover:border-[#5AC8FA]/30" title="Export CSV">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    </button>
                                )}
                                {getKey(STORAGE_KEYS.RAW_SIGNALS_CACHE) && (
                                    <Button onClick={handleRestoreProgress} variant="outline" className="h-[36px] px-4 text-[13px] font-bold rounded-2xl">
                                        🔄 Restore
                                    </Button>
                                )}
                                <Button onClick={handleInitialize} className="bg-[#0071E3] hover:bg-[#0077ED] text-white shadow-[0_4px_14px_rgba(0,113,227,0.3)] h-[36px] px-5 rounded-2xl font-bold text-[13px] whitespace-nowrap">
                                    {totalLeadsCount > 0 ? 'Rescan Sector' : 'Launch Discovery'}
                                </Button>
                            </div>
                        </div>
                        
                        {/* Minimum Score Slider */}
                        {totalLeadsCount > 0 && !showFailedOnly && (
                            <div className="flex items-center xl:justify-end gap-3 w-full">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Min Score</span>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100" 
                                    step="5" 
                                    value={minScore} 
                                    onChange={(e) => setMinScore(Number(e.target.value))}
                                    className="w-32 h-1.5 bg-slate-200 dark:bg-slate-700/60 rounded-lg appearance-none cursor-pointer accent-[#0071E3] dark:accent-[#5AC8FA]" 
                                    title={`Minimum Score: ${minScore}`}
                                />
                                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300 w-8 text-right">{minScore}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-4 mt-4 md:mt-0">
                        {(stage === 'searching' || stage === 'scoring') && (
                            <div className="flex items-center gap-6 sm:border-r border-slate-200 dark:border-slate-800 sm:pr-6">
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Found</span>
                                    <span className="text-xl font-bold text-[#34C759]">{searchProgress.found}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Bounced</span>
                                    <span className="text-xl font-bold text-[#FF9500]">{searchProgress.filtered}</span>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col items-center sm:items-end w-full sm:w-auto text-center sm:text-right">
                            <span className="text-[#0071E3] text-sm animate-pulse font-bold">{stage === 'searching' ? "SEARCHING CLUSTERS..." : "BATCH SCORING..."}</span>
                            <span className="text-[11px] font-medium text-slate-500 max-w-[180px] truncate">{stage === 'searching' ? `Query: ${searchProgress.currentQuery || 'Initializing...'}` : "AI Analyzing Relevancy"}</span>
                        </div>
                        <Button variant="outline" onClick={handleCancel} className="h-9 px-4 text-xs font-bold text-[#FF3B30] border-[#FF3B30]/30 hover:bg-[#FF3B30]/10 rounded-full w-full sm:w-auto">Cancel</Button>
                    </div>
                )}
            </div>
            {(stage === 'searching' || stage === 'scoring' || logs.length > 0) && (
                <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl border border-slate-100 dark:border-slate-800/50 p-6 text-sm max-h-[300px] overflow-y-auto shadow-sm">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mission Logs</div>
                        {(stage === 'searching' || stage === 'scoring') && (
                            <Button variant="outline" onClick={handleCancel} className="h-7 px-3 text-[10px] font-bold text-[#FF3B30] border-[#FF3B30]/30 hover:bg-[#FF3B30]/10 rounded-full bg-red-50 dark:bg-red-950/20">
                                🛑 Terminate Scan
                            </Button>
                        )}
                    </div>
                    <div className="space-y-1.5 font-medium">
                        {logs.map((log, i) => (
                            <div key={i} className={`flex gap-3 items-start ${log.type === 'error' ? 'text-[#FF3B30]' : log.type === 'success' ? 'text-[#34C759]' : log.type === 'warning' ? 'text-[#FF9500]' : 'text-slate-600 dark:text-slate-300'}`}>
                                <span className="text-slate-400 dark:text-slate-500 text-[11px] pt-0.5 min-w-[70px]">{log.time}</span>
                                <span className="leading-snug">{log.type === 'success' ? '✓' : log.type === 'error' ? '✗' : log.type === 'warning' ? '⚠️' : '➜'} {log.msg}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}
            {error && (
                <div className="p-5 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl text-red-600 dark:text-red-400 flex items-center gap-4 shadow-sm">
                    <span className="text-2xl">🛑</span><div><p className="font-bold text-sm">Status Update</p><p className="text-sm mt-0.5">{error}</p></div>
                </div>
            )}
            {displayedLeads.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                    {displayedLeads.map(renderJobCard)}
                </div>
            ) : showFailedOnly && failedLeads.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                    {failedLeads.map(renderJobCard)}
                </div>
            ) : stage === 'scoring' && displayedLeads.length === 0 && failedLeads.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-white dark:bg-[#1C1C1E] border border-slate-200/60 dark:border-slate-800/60 rounded-[32px] shadow-sm animate-in fade-in zoom-in-95 duration-300">
                    <span className="text-5xl block mb-5 opacity-80 animate-pulse">🧠</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight animate-pulse">Scoring Candidates...</h3>
                    <p className="text-slate-500 font-medium max-w-[420px] text-sm leading-relaxed">
                        AI is actively analyzing and scoring leads. High-signal matches will appear here shortly.
                    </p>
                </div>
            ) : stage === 'scoring' && displayedLeads.length === 0 && failedLeads.length > 0 ? (
                <div className="space-y-6">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl flex items-center justify-between shadow-sm">
                         <div className="font-medium text-sm text-amber-800 dark:text-amber-400">
                             <span className="animate-pulse mr-2">⏳</span> Scoring in progress... <span className="font-bold">{failedLeads.length} leads</span> failed AI extraction or were actively rejected by constraints so far.
                         </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 opacity-60">
                        {failedLeads.map(renderJobCard)}
                    </div>
                </div>
            ) : !showFailedOnly && failedLeads.length > 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-white dark:bg-[#1C1C1E] border border-slate-200/60 dark:border-slate-800/60 rounded-[32px] shadow-sm animate-in fade-in zoom-in-95 duration-300">
                    <span className="text-5xl block mb-5 opacity-80">⚠️</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">No Scored Leads Yet</h3>
                    <p className="text-slate-500 font-medium max-w-[420px] text-sm leading-relaxed">
                        Some jobs have been scored, but they were classified as failed/unscored. You can view them in the Failed list.
                    </p>
                    <div className="mt-5">
                        <Button onClick={() => setShowFailedOnly(true)} className="bg-slate-800 hover:bg-slate-700 text-white h-[40px] px-6 rounded-full font-bold text-sm">
                            View Failed ({failedCount})
                        </Button>
                    </div>
                </div>
            ) : leads.length > 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center bg-white dark:bg-[#1C1C1E] border border-slate-200/60 dark:border-slate-800/60 rounded-[32px] shadow-sm animate-in fade-in zoom-in-95 duration-300">
                    <span className="text-5xl block mb-5 opacity-80">📭</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">No Candidates Match</h3>
                    <p className="text-slate-500 font-medium max-w-[340px] text-sm leading-relaxed">
                        {[
                            filterUrgent && `Urgent (${urgentCount} available)`,
                            filterSalary && `Salary (${salaryCount} available)`,
                            filterRecency && `Newest (${recentCount} posted ≤3 days)`,
                        ].filter(Boolean).length > 0
                            ? `Active filters: ${[
                                filterUrgent && `Urgent (${urgentCount})`,
                                filterSalary && `Salary (${salaryCount})`,
                                filterRecency && `Newest (${recentCount})`,
                            ].filter(Boolean).join(', ')}. Try toggling them off.`
                            : 'Adjust your constraints above to reveal more leads from this batch.'
                        }
                    </p>
                </div>
            ) : null}
            {selectedLead && <OutreachModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
            {coverLetterLead && <CoverLetterModal lead={coverLetterLead} onClose={() => setCoverLetterLead(null)} />}
            {interviewPrepLead && <InterviewPrepModal lead={interviewPrepLead} onClose={() => setInterviewPrepLead(null)} />}
        </div>
    );
};