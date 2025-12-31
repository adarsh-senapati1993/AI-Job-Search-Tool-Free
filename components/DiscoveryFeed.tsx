import React, { useState, useRef, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { searchForSignals } from '../lib/discovery';
import { scoreSignals, ScoredLead } from '../lib/scoring';
import { getConfig } from '../lib/storage';
import { OutreachModal } from './OutreachModal';
import { StrategyReview } from './StrategyReview';

interface LogEntry {
    msg: string;
    type: 'info' | 'success' | 'error';
    time: string;
}

export const DiscoveryFeed = () => {
  const [stage, setStage] = useState<'idle' | 'strategy' | 'searching' | 'scoring' | 'complete'>('idle');
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ScoredLead | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Filters
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [filterSalary, setFilterSalary] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
      setLogs(prev => [...prev, {
          msg, type, time: new Date().toLocaleTimeString()
      }]);
  };

  const getLookbackLabel = () => {
      const val = config?.search_lookback || '14d';
      if (val === '1d') return '24h';
      return val;
  };

  const handleInitialize = () => {
      setConfig(getConfig());
      setStage('strategy');
  };

  const handleRun = async () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setLogs([]); 
    setStage('searching');
    const currentConfig = config || getConfig();

    try {
      const rawSignals = await searchForSignals(currentConfig, addLog, controller.signal);
      
      if (rawSignals.length === 0) {
        setError(`No leads found. Check the Mission Logs below for details.`);
        setStage('idle');
        return;
      }

      setStage('scoring');
      addLog(`Sending ${rawSignals.length} candidates to Brain for BATCH SCORING...`, 'info');
      
      if (controller.signal.aborted) throw new Error("Cancelled");
      
      const scoredResults = await scoreSignals(rawSignals, currentConfig);
      addLog(`Scoring complete. ${scoredResults.length} qualified leads found.`, 'success');
      
      setLeads(scoredResults);
      setStage('complete');

    } catch (err: any) {
        console.error(err);
        if (err.name === 'AbortError' || err.message === 'Cancelled') {
             setError("Scan Cancelled.");
             addLog("Scan manually cancelled by user.", 'error');
        } else {
            setError(err.message || "Mission Failed.");
            addLog(`Critical Failure: ${err.message}`, 'error');
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

  // Render a "Cockpit" Job Card
  const renderJobCard = (lead: ScoredLead) => {
      // Helper to get domain for logo
      let domain = "";
      try { domain = new URL(lead.url).hostname; } catch(e) {}
      const logoUrl = lead.company_name !== "Not specified" && lead.company_name !== "Unknown" 
          ? `https://logo.clearbit.com/${lead.company_name.replace(/\s+/g, '').toLowerCase()}.com` 
          : `https://logo.clearbit.com/${domain}`;

      // Ring Color
      const scoreColor = lead.score >= 80 ? 'text-emerald-400' : lead.score >= 50 ? 'text-amber-400' : 'text-red-400';
      const scoreRingColor = lead.score >= 80 ? '#34d399' : lead.score >= 50 ? '#fbbf24' : '#f87171';

      return (
        <Card key={lead.id} className="relative group overflow-hidden border-slate-700/60 hover:border-indigo-500/50 transition-all duration-300 bg-slate-800/80">
            {/* Top Row: Identity & Score */}
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                    {/* Logo Fallback */}
                    <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700 overflow-hidden shrink-0">
                        <img 
                            src={logoUrl} 
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            alt="Logo" 
                            className="w-full h-full object-contain p-1"
                        />
                        <span className="text-xl">🏢</span>
                    </div>
                    
                    <div>
                        <h3 className="text-xl font-bold text-white leading-tight group-hover:text-indigo-400 transition-colors">
                            {lead.role_title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <a href={lead.url} target="_blank" className="text-slate-300 font-medium hover:text-white hover:underline flex items-center gap-1">
                                {lead.company_name}
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                            {/* Source Badge */}
                            <span className="text-[10px] uppercase tracking-wider bg-slate-900 text-slate-500 px-2 py-0.5 rounded border border-slate-700">
                                {lead.source.replace('google-search', 'WEB')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Score Ring */}
                <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-700" />
                        <circle cx="28" cy="28" r="26" stroke={scoreRingColor} strokeWidth="4" fill="transparent" 
                            strokeDasharray={163} strokeDashoffset={163 - (163 * lead.score) / 100} 
                            className="transition-all duration-1000 ease-out"
                        />
                    </svg>
                    <span className={`absolute text-sm font-bold ${scoreColor}`}>{lead.score}</span>
                </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                 <div className="bg-slate-900/50 rounded px-3 py-2 border border-slate-700/50 flex flex-col justify-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Salary</span>
                    <span className={`text-sm font-medium truncate ${lead.salary && lead.salary !== 'Not disclosed' ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {lead.salary || 'Not disclosed'}
                    </span>
                 </div>
                 <div className="bg-slate-900/50 rounded px-3 py-2 border border-slate-700/50 flex flex-col justify-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Urgency</span>
                    <span className={`text-sm font-medium ${lead.urgency_score > 0 ? 'text-red-300 animate-pulse' : 'text-slate-400'}`}>
                        {lead.urgency_score > 0 ? 'High Priority' : 'Standard'}
                    </span>
                 </div>
                 <div className="bg-slate-900/50 rounded px-3 py-2 border border-slate-700/50 flex flex-col justify-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Posted</span>
                    <span className="text-sm font-medium text-slate-300">
                        {lead.days_since_posted === 0 ? 'Today' : `${lead.days_since_posted || '?'} days ago`}
                    </span>
                 </div>
                 <div className="bg-slate-900/50 rounded px-3 py-2 border border-slate-700/50 flex flex-col justify-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Fit</span>
                    <span className="text-sm font-medium text-slate-300">
                        {lead.score >= 80 ? 'Excellent Match' : 'Possible Match'}
                    </span>
                 </div>
            </div>

            {/* AI Insights: The Cockpit View */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/40 rounded-lg p-4 border border-slate-700/50 mb-4">
                <div>
                    <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2 flex items-center gap-1">
                        <span>⚡</span> Why You?
                    </h4>
                    <p className="text-sm text-slate-300 leading-relaxed">
                        {lead.why_you_match || lead.reasoning?.[0] || "Strong alignment with your skills and seniority."}
                    </p>
                </div>
                <div className="md:border-l md:border-slate-700/50 md:pl-4">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2 flex items-center gap-1">
                        <span>🎣</span> The Outreach Hook
                    </h4>
                    <p className="text-sm text-slate-300 leading-relaxed">
                         {lead.outreach_hook || "Focus on your relevant experience in this domain."}
                    </p>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-2">
                 <div className="flex gap-2">
                    {/* Thumbs Down (Future Feature) */}
                    <button className="p-2 text-slate-500 hover:text-red-400 transition-colors" title="Not Interested">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
                    </button>
                 </div>
                 <div className="flex gap-3">
                     <a 
                        href={lead.url} 
                        target="_blank" 
                        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 border border-slate-600 hover:bg-slate-700 hover:text-white transition-colors"
                     >
                        Read JD ↗
                     </a>
                     <Button 
                        onClick={() => setSelectedLead(lead)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-sm shadow-lg shadow-indigo-900/20"
                     >
                        ✨ Draft Executive Outreach
                     </Button>
                 </div>
            </div>
        </Card>
      );
  };

  if (stage === 'strategy') {
      return (
          <StrategyReview 
             config={config} 
             onConfirm={handleRun} 
             onUpdateConfig={setConfig}
             onCancel={() => setStage('idle')}
          />
      );
  }

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card className="flex flex-col md:flex-row md:items-center justify-between bg-slate-800/80 backdrop-blur gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Active Radar
            <span className="text-[10px] bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700 uppercase tracking-widest">
                Phase 3: Deep Cluster Search
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {leads.length > 0 
                ? `${leads.length} candidates found in last ${getLookbackLabel()}` 
                : "Scanning 5 Search Clusters (15+ Sources)..."}
          </p>
        </div>
        
        {stage === 'idle' || stage === 'complete' ? (
             <div className="flex items-center gap-2">
                {/* Filters */}
                {leads.length > 0 && (
                    <div className="flex items-center gap-2 mr-2">
                         <button 
                            onClick={() => setFilterUrgent(!filterUrgent)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filterUrgent ? 'bg-red-900/40 border-red-500 text-red-300' : 'border-slate-600 text-slate-400 hover:border-slate-400'}`}
                         >
                            🔥 Urgent Only
                         </button>
                         <button 
                            onClick={() => setFilterSalary(!filterSalary)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filterSalary ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300' : 'border-slate-600 text-slate-400 hover:border-slate-400'}`}
                         >
                            💰 With Salary
                         </button>
                    </div>
                )}

                 <Button 
                 onClick={handleInitialize} 
                 className="bg-emerald-600 hover:bg-emerald-500 min-w-[140px]"
               >
                 {leads.length > 0 ? 'Rescan Sector' : 'Initialize Discovery'}
               </Button>
             </div>
        ) : (
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                    <span className="text-indigo-400 font-mono text-sm animate-pulse font-bold">
                        {stage === 'searching' ? "SEARCHING 5 CLUSTERS..." : "BATCH SCORING..."}
                    </span>
                    <span className="text-[10px] text-slate-500">
                        {stage === 'searching' ? "Aggregating 15+ Job Boards" : "Vectorized AI Analysis"}
                    </span>
                </div>
                <Button variant="outline" onClick={handleCancel} className="h-8 text-xs border-red-500/50 text-red-400 hover:bg-red-950">
                    Cancel
                </Button>
            </div>
        )}
      </Card>

      {/* Terminal / Logs View */}
      {(stage === 'searching' || stage === 'scoring' || logs.length > 0) && (
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 font-mono text-xs max-h-48 overflow-y-auto">
              <div className="text-slate-500 mb-2 border-b border-slate-800 pb-1">MISSION LOGS</div>
              <div className="space-y-1">
                  {logs.map((log, i) => (
                      <div key={i} className={`flex gap-3 ${
                          log.type === 'error' ? 'text-red-400' : 
                          log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                      }`}>
                          <span className="opacity-50 text-[10px] min-w-[60px]">{log.time}</span>
                          <span>{log.type === 'success' ? '✓' : log.type === 'error' ? '✗' : '➜'} {log.msg}</span>
                      </div>
                  ))}
                  <div ref={logsEndRef} />
              </div>
          </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <span className="text-xl">🛑</span>
            <div>
                <p className="font-bold">Status Update</p>
                <p className="text-sm opacity-90">{error}</p>
            </div>
        </div>
      )}

      {/* Results Feed */}
      <div className="grid grid-cols-1 gap-6">
        {displayedLeads.map(renderJobCard)}
      </div>

      {/* Outreach Modal */}
      {selectedLead && (
        <OutreachModal 
            lead={selectedLead} 
            onClose={() => setSelectedLead(null)} 
        />
      )}
    </div>
  );
};