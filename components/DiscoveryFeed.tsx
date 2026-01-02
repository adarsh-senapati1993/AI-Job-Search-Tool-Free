import React, { useState, useRef, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { searchForSignals } from '../lib/discovery';
import { scoreSignals, ScoredLead } from '../lib/scoring';
import { getConfig, saveLatestRun, getLatestRun, isNovelLead, markLeadAsSeen, getKey, STORAGE_KEYS } from '../lib/storage';
import { checkSerperQuota } from '../lib/serper';
import { OutreachModal } from './OutreachModal';
import { StrategyReview } from './StrategyReview';

interface LogEntry {
    msg: string;
    type: 'info' | 'success' | 'error' | 'warning';
    time: string;
}

export const DiscoveryFeed = () => {
  const [stage, setStage] = useState<'idle' | 'strategy' | 'searching' | 'scoring' | 'complete'>('idle');
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ScoredLead | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [filterSalary, setFilterSalary] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setConfig(getConfig());
    const lastRun = getLatestRun();
    if (lastRun && lastRun.leads.length > 0) {
        if (Date.now() - lastRun.timestamp < 24 * 60 * 60 * 1000) {
            setLeads(lastRun.leads);
            setStage('complete');
        }
    }
  }, []);

  useEffect(() => {
    if (leads.length > 0) saveLatestRun(leads);
  }, [leads]);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
      setLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
  };

  const handleInitialize = () => {
      setConfig(getConfig());
      setStage('strategy');
  };

  const handleRun = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null); setLogs([]); setStage('searching');
    const currentConfig = config || getConfig();
    const serperKey = getKey(STORAGE_KEYS.SERPER_KEY);

    try {
      // 1. Quota Check
      addLog("Verifying API Quota...", 'info');
      const quota = await checkSerperQuota(serperKey || "", 50);
      if (!quota.ok) throw new Error(quota.msg || "Serper Quota Check Failed");
      
      // 2. Search
      const rawSignals = await searchForSignals(currentConfig, addLog, controller.signal);
      
      if (rawSignals.length === 0) {
        setError("No leads found matching criteria.");
        setStage('idle');
        return;
      }

      // 3. Filter Novelty
      addLog("Filtering previously seen jobs...", 'info');
      const novelSignals = rawSignals.filter(s => isNovelLead(s.url));
      
      if (novelSignals.length === 0) {
         addLog("All 100% of found jobs were already seen/processed recently.", 'warning');
         setError("No NEW leads found (all duplicates from previous runs).");
         setStage('idle');
         return;
      }
      addLog(`${novelSignals.length} new opportunities identified (hidden ${rawSignals.length - novelSignals.length} seen).`, 'success');

      setStage('scoring');
      
      if (controller.signal.aborted) throw new Error("Cancelled");
      
      const scoredResults = await scoreSignals(novelSignals, currentConfig, (msg) => addLog(msg, 'info'));

      addLog(`Mission Complete. ${scoredResults.length} qualified leads.`, 'success');
      
      // Mark as seen
      scoredResults.forEach(l => markLeadAsSeen(l.url));
      
      setLeads(scoredResults);
      setStage('complete');

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

  const displayedLeads = leads.filter(lead => {
      if (filterUrgent && lead.urgency_score === 0) return false;
      if (filterSalary && (lead.salary === "Not disclosed" || !lead.salary)) return false;
      return true;
  });

  const renderJobCard = (lead: ScoredLead) => {
      let domain = ""; try { domain = new URL(lead.url).hostname; } catch(e) {}
      const logoUrl = lead.company_name !== "Not specified" && lead.company_name !== "Unknown" 
          ? `https://logo.clearbit.com/${lead.company_name.replace(/\s+/g, '').toLowerCase()}.com` 
          : `https://logo.clearbit.com/${domain}`;
      const scoreColor = lead.score >= 80 ? 'text-emerald-400' : lead.score >= 50 ? 'text-amber-400' : 'text-red-400';
      const scoreRingColor = lead.score >= 80 ? '#34d399' : lead.score >= 50 ? '#fbbf24' : '#f87171';

      return (
        <Card key={lead.id} className="relative group overflow-hidden border-slate-700/60 hover:border-indigo-500/50 transition-all duration-300 bg-slate-800/80">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700 overflow-hidden shrink-0 shadow-sm">
                        <img src={logoUrl} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} alt="Logo" className="w-full h-full object-contain p-1" />
                        <span className="text-xl">🏢</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white leading-tight group-hover:text-indigo-400 transition-colors">{lead.role_title}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                            <a href={lead.url} target="_blank" className="text-slate-300 font-medium hover:text-white hover:underline flex items-center gap-1.5">
                                {lead.company_name}
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                            <span className="text-slate-600">•</span>
                            <span className="text-[10px] uppercase tracking-wider bg-slate-900 text-slate-500 px-2 py-0.5 rounded border border-slate-700/50">
                                {lead.source.replace('google-search', 'WEB').replace('regional-board', 'REGIONAL')}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-700" />
                        <circle cx="32" cy="32" r="28" stroke={scoreRingColor} strokeWidth="4" fill="transparent" strokeDasharray={175} strokeDashoffset={175 - (175 * lead.score) / 100} className="transition-all duration-1000 ease-out" />
                    </svg>
                    <span className={`absolute text-lg font-bold ${scoreColor}`}>{lead.score}</span>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                 <div className="bg-slate-900/40 rounded px-4 py-3 border border-slate-700/30 flex flex-col justify-center hover:bg-slate-900/60 transition-colors">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Salary</span>
                    <span className={`text-sm font-medium truncate ${lead.salary && lead.salary !== 'Not disclosed' ? 'text-emerald-300' : 'text-slate-400'}`}>{lead.salary || 'Not disclosed'}</span>
                 </div>
                 <div className="bg-slate-900/40 rounded px-4 py-3 border border-slate-700/30 flex flex-col justify-center hover:bg-slate-900/60 transition-colors">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Urgency</span>
                    <span className={`text-sm font-medium ${lead.urgency_score > 0 ? 'text-red-300' : 'text-slate-400'}`}>{lead.urgency_score > 0 ? 'High Priority 🔥' : 'Standard'}</span>
                 </div>
                 <div className="bg-slate-900/40 rounded px-4 py-3 border border-slate-700/30 flex flex-col justify-center hover:bg-slate-900/60 transition-colors">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Posted</span>
                    <span className="text-sm font-medium text-slate-300">{lead.days_since_posted === 0 ? 'Today' : `${lead.days_since_posted || '?'} days ago`}</span>
                 </div>
                 <div className="bg-slate-900/40 rounded px-4 py-3 border border-slate-700/30 flex flex-col justify-center hover:bg-slate-900/60 transition-colors">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Fit</span>
                    <span className="text-sm font-medium text-slate-300">{lead.score >= 80 ? 'Excellent Match' : 'Possible Match'}</span>
                 </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="bg-emerald-950/20 rounded-lg p-4 border border-emerald-900/30">
                     <h4 className="text-[11px] font-bold text-emerald-500 uppercase mb-3 flex items-center gap-2 tracking-wider">✅ Why it matches</h4>
                    <ul className="space-y-2">
                        {lead.pros?.length > 0 ? lead.pros.slice(0, 3).map((pro, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start gap-2 leading-relaxed"><span className="text-emerald-500 mt-0.5">✓</span> <span>{pro}</span></li>
                        )) : <li className="text-xs text-slate-500 italic">No specific signals</li>}
                    </ul>
                </div>
                <div className="bg-amber-950/20 rounded-lg p-4 border border-amber-900/30">
                     <h4 className="text-[11px] font-bold text-amber-500 uppercase mb-3 flex items-center gap-2 tracking-wider">⚠️ Analysis Gaps</h4>
                    <ul className="space-y-2">
                        {lead.cons?.length > 0 ? lead.cons.slice(0, 2).map((con, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start gap-2 leading-relaxed"><span className="text-amber-500 mt-0.5">!</span> <span>{con}</span></li>
                        )) : <li className="text-xs text-slate-500 italic">No major red flags detected</li>}
                    </ul>
                </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-700/40 mt-auto">
                 <div className="flex gap-2"></div>
                 <div className="flex gap-3 w-full justify-end">
                     <a href={lead.url} target="_blank" className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 border border-slate-600 hover:bg-slate-700 hover:text-white transition-all hover:border-slate-500">View Job Post ↗</a>
                     <Button onClick={() => setSelectedLead(lead)} className="bg-indigo-600 hover:bg-indigo-500 text-sm shadow-lg shadow-indigo-900/20 px-6 py-2.5 transition-all hover:translate-y-[-1px]">✨ Draft Outreach</Button>
                 </div>
            </div>
        </Card>
      );
  };

  if (stage === 'strategy') return <StrategyReview config={config} onConfirm={handleRun} onUpdateConfig={setConfig} onCancel={() => setStage('idle')} />;

  return (
    <div className="space-y-6">
      <Card className="flex flex-col md:flex-row md:items-center justify-between bg-slate-800/80 backdrop-blur gap-4 shadow-xl border-slate-700/60">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">Active Radar <span className="text-[10px] bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700 uppercase tracking-widest font-mono">Phase 3: Deep Cluster Search</span></h2>
          <p className="text-slate-400 text-sm mt-1">{leads.length > 0 ? `${leads.length} candidates found` : "Scanning Search Clusters..."}</p>
        </div>
        {stage === 'idle' || stage === 'complete' ? (
             <div className="flex items-center gap-2">
                {leads.length > 0 && (
                    <div className="flex items-center gap-2 mr-2">
                         <button onClick={() => setFilterUrgent(!filterUrgent)} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filterUrgent ? 'bg-red-900/40 border-red-500 text-red-300' : 'border-slate-600 text-slate-400 hover:border-slate-400'}`}>🔥 Urgent Only</button>
                         <button onClick={() => setFilterSalary(!filterSalary)} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filterSalary ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300' : 'border-slate-600 text-slate-400 hover:border-slate-400'}`}>💰 With Salary</button>
                    </div>
                )}
                 <Button onClick={handleInitialize} className="bg-emerald-600 hover:bg-emerald-500 min-w-[140px] shadow-lg shadow-emerald-900/20">{leads.length > 0 ? 'Rescan Sector' : 'Initialize Discovery'}</Button>
             </div>
        ) : (
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                    <span className="text-indigo-400 font-mono text-sm animate-pulse font-bold">{stage === 'searching' ? "SEARCHING 5 CLUSTERS..." : "BATCH SCORING..."}</span>
                    <span className="text-[10px] text-slate-500">{stage === 'searching' ? "Aggregating 15+ Job Boards" : "Vectorized AI Analysis"}</span>
                </div>
                <Button variant="outline" onClick={handleCancel} className="h-8 text-xs border-red-500/50 text-red-400 hover:bg-red-900">Cancel</Button>
            </div>
        )}
      </Card>
      {(stage === 'searching' || stage === 'scoring' || logs.length > 0) && (
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 font-mono text-xs max-h-48 overflow-y-auto shadow-inner">
              <div className="text-slate-500 mb-2 border-b border-slate-800 pb-1">MISSION LOGS</div>
              <div className="space-y-1">
                  {logs.map((log, i) => (
                      <div key={i} className={`flex gap-3 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : log.type === 'warning' ? 'text-amber-400' : 'text-slate-300'}`}>
                          <span className="opacity-50 text-[10px] min-w-[60px]">{log.time}</span>
                          <span>{log.type === 'success' ? '✓' : log.type === 'error' ? '✗' : log.type === 'warning' ? '⚠️' : '➜'} {log.msg}</span>
                      </div>
                  ))}
                  <div ref={logsEndRef} />
              </div>
          </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 shadow-lg">
            <span className="text-xl">🛑</span><div><p className="font-bold">Status Update</p><p className="text-sm opacity-90">{error}</p></div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6">
        {displayedLeads.map(renderJobCard)}
      </div>
      {selectedLead && <OutreachModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </div>
  );
};