import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ScoredLead } from '../lib/scoring';
import { generateOutreachDrafts, OutreachDrafts, findHiringManager, draftReferralMessage } from '../lib/ai';
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
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Hiring Manager Context State
  const [hmName, setHmName] = useState('');
  const [hmLink, setHmLink] = useState('');
  const [hmContext, setHmContext] = useState('');
  const [showDrafts, setShowDrafts] = useState(false);
  const [activeTab, setActiveTab] = useState<'linkedin' | 'email' | 'referral'>('linkedin');
  const [referralDraft, setReferralDraft] = useState('');
  const [linkedinDraft, setLinkedinDraft] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const handleFindHM = async () => {
    if (!lead.company_name || !lead.role_title) return;
    setLoading(true);
    try {
      // auto-find does not require api key in function signature if it uses getActiveLLM inside,
      // BUT findHiringManager is defined as taking (company, role) in our view of lib/ai.ts?
      // WAIT. Let's re-verify findHiringManager signature in lib/ai.ts
      // It is: export const findHiringManager = async (companyName: string, roleTitle: string): Promise<HiringManagerContext | null>
      // So NO API KEY arg.

      const result = await findHiringManager(lead.company_name, lead.role_title);
      if (result && result.name && result.name !== 'Unknown') {
        setHmName(result.name || '');
        setHmContext(result.context || '');
      } else {
        setError("Could not identify a specific person. Please enter Name/URL manually.");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to find Hiring Manager.");
    } finally {
      setLoading(false);
    }
  };

  const generateDrafts = async () => {
    setLoading(true);
    setError(null);
    try {
      const config = getConfig();
      if (!config) throw new Error("Configuration missing");

      const context = {
        name: hmName,
        linkedinUrl: hmLink,
        context: hmContext
      };

      // Parallel generation
      // draftReferralMessage signature: (userConfig: CandidateProfile, lead: any, mutualConnectionName?: string)
      const [outreach, referral] = await Promise.all([
        generateOutreachDrafts(getKey(STORAGE_KEYS.PERPLEXITY_KEY) || getKey(STORAGE_KEYS.GEMINI_KEY) || "", config, lead, context),
        draftReferralMessage(config, lead)
      ]);

      setDrafts(outreach);
      // using short message for now or join them?
      // Let's store long message too if needed, but for now specific field
      // UI expects string for defaultValue={referralDraft}
      // Let's combine them or just show short?
      // Referral tab has "Referral Ask" textarea.
      setReferralDraft(`SUBJECT: Referral for ${lead.role_title}\n\n${referral.long_message}\n\n---\n\nCONNECTION REQUEST:\n${referral.short_message}`);
      setLinkedinDraft(outreach.linkedin_dm);
      setEmailSubject(outreach.email_subject);
      setEmailBody(outreach.email_body);
      setShowDrafts(true);
    } catch (err: any) {
      console.error("Outreach Generation Error:", err);
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
      className="fixed inset-0 apple-glass flex items-center justify-center z-50 p-4 animate-in fade-in duration-300"
      onClick={handleBackdropClick}
    >
      <div className="max-w-2xl w-full">
        <Card className="bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-slate-800 shadow-[0_20px_60px_rgb(0,0,0,0.15)] rounded-[32px] overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex justify-between items-start mb-6 shrink-0 pt-2 px-2">
            <div>
              <h2 className="text-2xl tracking-tight font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>✍️</span> Outreach Copilot
              </h2>
              <p className="text-slate-500 font-medium text-sm mt-1">
                Target: <span className="text-[#0071E3] font-bold">{lead.role_title}</span> at <span className="text-slate-700 dark:text-slate-300 font-bold">{lead.company_name}</span>
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {!showDrafts ? (
            /* INPUT STEP */
            <div className="space-y-6 overflow-y-auto px-2 pb-2">
              <div className="bg-[#5856D6]/10 border border-[#5856D6]/20 p-4 rounded-2xl">
                <p className="text-sm font-medium text-[#5856D6] dark:text-[#5856D6] leading-relaxed">
                  <strong>Strategy Tip:</strong> Provide context about the Hiring Manager to make the pitch authentic.
                  If you don't know, leave it blank, and we'll write a generic "Hiring Team" pitch.
                </p>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Hiring Manager Name (Optional)"
                    placeholder="e.g. John Doe"
                    value={hmName}
                    onChange={(e) => setHmName(e.target.value)}
                  />
                  <div className="flex items-end">
                    <Button onClick={handleFindHM} variant="secondary" className="h-10 text-xs w-full bg-[#5856D6]/10 text-[#5856D6] hover:bg-[#5856D6]/20 font-bold rounded-xl" title="Use AI to find likely hiring manager">
                      🔍 Auto-Find HM
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <Input
                    label="HM LinkedIn URL (Optional)"
                    placeholder="linkedin.com/in/..."
                    value={hmLink}
                    onChange={(e) => setHmLink(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Context / Intel (Optional)</label>
                  <textarea
                    className="w-full h-24 bg-slate-50 dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] text-sm font-medium transition-all resize-none shadow-sm"
                    placeholder="e.g. He recently posted about scaling their Payment API. He loves sailing. We both worked at Uber."
                    value={hmContext}
                    onChange={(e) => setHmContext(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/20 p-4 rounded-2xl text-[#FF3B30] text-sm font-bold">
                  {error}
                </div>
              )}

              <Button
                onClick={generateDrafts}
                isLoading={loading}
                className="w-full h-14 text-lg bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-2xl shadow-[0_4px_14px_rgba(0,113,227,0.3)] font-bold active:scale-[0.98] transition-all"
              >
                Generate Personalized Pitch 🚀
              </Button>
            </div>
          ) : (
            /* RESULTS STEP */
            <div className="flex flex-col h-full overflow-hidden px-2 pb-2">
              {/* Tabs */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-5 shrink-0">
                <button
                  onClick={() => setActiveTab('linkedin')}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'linkedin' ? 'bg-white dark:bg-slate-700 text-[#0071E3] shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  LinkedIn DM
                </button>
                <button
                  onClick={() => setActiveTab('email')}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'email' ? 'bg-white dark:bg-slate-700 text-[#34C759] shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  Cold Email
                </button>
                <button
                  onClick={() => setActiveTab('referral')}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'referral' ? 'bg-white dark:bg-slate-700 text-[#FF9500] shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  Referral Request
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
                {activeTab === 'linkedin' ? (
                  <div className="space-y-2 h-full">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Message Body</label>
                    <textarea
                      className="w-full h-full min-h-[250px] bg-slate-50 dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-slate-900 dark:text-white focus:outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] resize-none text-sm leading-relaxed shadow-sm font-medium"
                      value={linkedinDraft}
                      onChange={(e) => setLinkedinDraft(e.target.value)}
                    ></textarea>
                  </div>
                ) : activeTab === 'referral' ? (
                  <div className="space-y-2 h-full">
                    <div className="bg-[#FF9500]/10 border border-[#FF9500]/20 p-4 rounded-2xl mb-3 text-sm text-[#FF9500] font-medium">
                      <strong>Tip:</strong> Send this to a 2nd degree connection (someone who knows the HM or works at the company).
                    </div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Referral Ask</label>
                    <textarea
                      className="w-full h-full min-h-[250px] bg-slate-50 dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-slate-900 dark:text-white focus:outline-none focus:border-[#FF9500] focus:ring-1 focus:ring-[#FF9500] resize-none text-sm leading-relaxed shadow-sm font-medium"
                      value={referralDraft}
                      onChange={(e) => setReferralDraft(e.target.value)}
                    ></textarea>
                  </div>
                ) : (
                  <div className="space-y-4 h-full">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Subject Line</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-[#34C759] focus:ring-1 focus:ring-[#34C759] text-sm font-bold shadow-sm"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 flex-1 pt-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Email Body</label>
                      <textarea
                        className="w-full h-[300px] bg-slate-50 dark:bg-[#2C2C2E] border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-slate-900 dark:text-white focus:outline-none focus:border-[#34C759] focus:ring-1 focus:ring-[#34C759] resize-none text-sm leading-relaxed shadow-sm font-medium"
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                      ></textarea>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="mt-5 flex items-center justify-between shrink-0">
                <Button variant="ghost" onClick={() => setShowDrafts(false)} className="text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full px-4 text-sm">
                  ← Back
                </Button>
                <div className="flex items-center gap-3">
                  {copyStatus && <span className="text-[#34C759] text-sm font-bold animate-in fade-in">{copyStatus}</span>}
                  <Button
                    onClick={() => handleCopy(activeTab === 'linkedin' ? linkedinDraft : activeTab === 'referral' ? referralDraft : `${emailSubject}\n\n${emailBody}`)}
                    className={`rounded-full px-6 font-bold shadow-sm ${activeTab === 'linkedin' ? 'bg-[#0071E3] hover:bg-[#0077ED]' : activeTab === 'referral' ? 'bg-[#FF9500] hover:bg-[#FF9E1A]' : 'bg-[#34C759] hover:bg-[#3CD062]'}`}
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