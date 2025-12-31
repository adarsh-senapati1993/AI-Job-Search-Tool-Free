import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ScoredLead } from '../lib/scoring';
import { generateOutreachDrafts, OutreachDrafts } from '../lib/ai'; 
import { getKey, getConfig, STORAGE_KEYS } from '../lib/storage';
import { Input } from './ui/Input';

interface OutreachModalProps {
  lead: ScoredLead;
  onClose: () => void;
}

export const OutreachModal = ({ lead, onClose }: OutreachModalProps) => {
  const [drafts, setDrafts] = useState<OutreachDrafts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'linkedin' | 'email'>('linkedin');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Hiring Manager Context State
  const [hmName, setHmName] = useState('');
  const [hmLink, setHmLink] = useState('');
  const [hmContext, setHmContext] = useState('');
  const [showDrafts, setShowDrafts] = useState(false);

  const generateDrafts = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiKey = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || getKey(STORAGE_KEYS.GEMINI_KEY) || "dummy";
        const config = getConfig();
        if (!config) throw new Error("Configuration missing");

        const context = {
            name: hmName,
            linkedinUrl: hmLink,
            context: hmContext
        };

        const result = await generateOutreachDrafts(apiKey, config, lead, context);
        setDrafts(result);
        setShowDrafts(true);
      } catch (err: any) {
        setError(err.message || "Failed to generate drafts");
      } finally {
        setLoading(false);
      }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus("Copied!");
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
        onClose();
    }
  }

  return (
    <div 
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
        onClick={handleBackdropClick}
    >
      <div className="max-w-2xl w-full">
        <Card className="bg-slate-900 border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex justify-between items-start mb-6 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>✍️</span> Outreach Copilot
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Target: <span className="text-indigo-400 font-semibold">{lead.role_title}</span> at <span className="text-white">{lead.company_name}</span>
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {!showDrafts ? (
              /* INPUT STEP */
              <div className="space-y-6 overflow-y-auto px-1">
                  <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-lg">
                      <p className="text-sm text-indigo-200">
                         <strong>Strategy Tip:</strong> Provide context about the Hiring Manager to make the pitch authentic. 
                         If you don't know, leave it blank, and we'll write a generic "Hiring Team" pitch.
                      </p>
                  </div>

                  <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <Input 
                             label="Hiring Manager Name (Optional)" 
                             placeholder="e.g. John Doe" 
                             value={hmName}
                             onChange={(e) => setHmName(e.target.value)}
                          />
                           <Input 
                             label="HM LinkedIn URL (Optional)" 
                             placeholder="linkedin.com/in/..." 
                             value={hmLink}
                             onChange={(e) => setHmLink(e.target.value)}
                          />
                      </div>
                      
                      <div className="space-y-1">
                          <label className="text-sm font-medium text-slate-300">Context / Intel (Optional)</label>
                          <textarea 
                             className="w-full h-24 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                             placeholder="e.g. He recently posted about scaling their Payment API. He loves sailing. We both worked at Uber."
                             value={hmContext}
                             onChange={(e) => setHmContext(e.target.value)}
                          />
                      </div>
                  </div>

                  {error && <p className="text-red-400 text-sm">{error}</p>}

                  <Button 
                    onClick={generateDrafts} 
                    isLoading={loading}
                    className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/30"
                  >
                     Generate Personalized Pitch 🚀
                  </Button>
              </div>
          ) : (
             /* RESULTS STEP */
             <div className="flex flex-col h-full overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-slate-700 mb-4 shrink-0">
                  <button
                    onClick={() => setActiveTab('linkedin')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'linkedin' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-white'}`}
                  >
                    LinkedIn DM
                  </button>
                  <button
                    onClick={() => setActiveTab('email')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'email' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-white'}`}
                  >
                    Cold Email
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-0">
                  {activeTab === 'linkedin' ? (
                    <div className="space-y-2 h-full">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Message Body</label>
                      <textarea 
                        className="w-full h-full min-h-[200px] bg-slate-950 border border-slate-700 rounded-lg p-4 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-sans text-sm leading-relaxed"
                        defaultValue={drafts?.linkedin_dm}
                      ></textarea>
                    </div>
                  ) : (
                    <div className="space-y-4 h-full">
                       <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Subject Line</label>
                          <input 
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                              defaultValue={drafts?.email_subject}
                          />
                       </div>
                       <div className="space-y-1 flex-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Email Body</label>
                          <textarea 
                              className="w-full h-64 bg-slate-950 border border-slate-700 rounded-lg p-4 text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-sans text-sm leading-relaxed"
                              defaultValue={drafts?.email_body}
                          ></textarea>
                       </div>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between shrink-0">
                  <Button variant="ghost" onClick={() => setShowDrafts(false)} className="text-slate-400">
                     ← Back to Inputs
                  </Button>
                  <div className="flex gap-3">
                     {copyStatus && <span className="text-emerald-400 text-sm font-medium animate-in fade-in py-2">{copyStatus}</span>}
                     <Button 
                        onClick={() => handleCopy(activeTab === 'linkedin' ? drafts!.linkedin_dm : `${drafts!.email_subject}\n\n${drafts!.email_body}`)}
                        className={activeTab === 'linkedin' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'}
                     >
                        Copy to Clipboard
                     </Button>
                  </div>
                </div>
              </div>
          )}
        </Card>
      </div>
    </div>
  );
};