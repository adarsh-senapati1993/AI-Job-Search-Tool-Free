import React, { useState, useEffect, useRef } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { parseCandidateProfile, ExplicitConstraints, ProfileInputs, CandidateProfile, identifyRegionalBoards, expandLocations, expandRoles } from '../lib/ai';
import { getKey, saveConfig, STORAGE_KEYS, getConfig, saveDraft, getDraft, clearDraft, saveKey, clearLatestRun } from '../lib/storage';
import * as pdfjsLibProxy from 'pdfjs-dist';
import { performOCR, isImageFile } from '../lib/ocr';

// ... (keep imports)

// Handle ESM/CJS interop for pdfjs-dist
let pdfjsLib: any = pdfjsLibProxy;
if ((pdfjsLibProxy as any).default) {
  pdfjsLib = (pdfjsLibProxy as any).default;
}

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

interface ProfileConfigProps {
  onComplete: () => void;
  onBack: () => void;
}

export const ProfileConfig = ({ onComplete, onBack }: ProfileConfigProps) => {
  const [resumeText, setResumeText] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLocsPreview, setExpandedLocsPreview] = useState<string[]>([]);
  const [isExpandingLocs, setIsExpandingLocs] = useState(false);

  // Granular State
  const [roles, setRoles] = useState('');
  const [locations, setLocations] = useState('');
  const [industries, setIndustries] = useState('');
  const [skills, setSkills] = useState('');
  const [avoid, setAvoid] = useState('');
  const [lookback, setLookback] = useState('14d');
  const [depth, setDepth] = useState<'standard' | 'deep' | 'comprehensive'>('standard');

  const [analyzedProfile, setAnalyzedProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    const draft = getDraft();
    if (draft) {
      setRoles(draft.roles || '');
      setLocations(draft.locations || '');
      setIndustries(draft.industries || '');
      setSkills(draft.skills || '');
      setAvoid(draft.avoid || '');
      setLookback(draft.lookback || '14d');
      setDepth(draft.depth || 'standard');
      setResumeText(draft.resumeText || '');
      setLinkedinUrl(draft.linkedinUrl || '');
      return;
    }

    const config = getConfig();
    if (config) {
      if (config.target_roles) setRoles(config.target_roles.join(', '));
      if (config.locations) setLocations(config.locations.join(', '));
      if (config.industries) setIndustries(config.industries.join(', '));
      if (config.skills) setSkills(config.skills.join(', '));
      if (config.avoid_keywords) setAvoid(config.avoid_keywords.join(', '));
      if (config.search_lookback) setLookback(config.search_lookback);
      if (config.search_depth) setDepth(config.search_depth);
      setAnalyzedProfile(config);
    }

    const savedRawResume = getKey(STORAGE_KEYS.RAW_RESUME);
    if (savedRawResume) {
      setResumeText(savedRawResume);
    }
  }, []);

  useEffect(() => {
    const draft = { roles, locations, industries, skills, avoid, lookback, depth, resumeText, linkedinUrl };
    saveDraft(draft);
  }, [roles, locations, industries, skills, avoid, lookback, depth, resumeText, linkedinUrl]);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    // ... (keep logic same)
    try {
      if (!pdfjsLib) throw new Error("PDF Library not loaded.");
      if (!pdfjsLib.getDocument) throw new Error("PDF Library missing getDocument method.");

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join('\n');
        fullText += pageText + '\n\n';
      }

      if (!fullText.trim()) throw new Error("PDF text extracted was empty.");
      return fullText;
    } catch (e: any) {
      console.error("PDF Extraction Failed", e);
      throw new Error("Could not read PDF text.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) { // Increased limit for detailed images
        alert("File too large. Max 10MB.");
        return;
      }
      setSelectedFile(file);
      setIsExtracting(true);
      setError(null);
      try {
        let text = '';
        if (file.type === 'application/pdf') {
          text = await extractTextFromPDF(file);
        } else if (isImageFile(file)) {
          // NEW: OCR Processing for Images
          text = await performOCR(file);
        } else {
          text = await file.text();
        }

        if (!text || text.length < 50) {
          throw new Error("Extracted text was too short. Please ensure the image/PDF is clear.");
        }

        setResumeText(text);

        // AUTO-TRIGGER: File is ready, run analysis immediately.
        await handleAutoFill(text, linkedinUrl);

      } catch (err: any) {
        setError(err.message || "Failed to read file.");
        setResumeText('');
      } finally {
        setIsExtracting(false);
      }
    }
  };

  const heuristicParse = (text: string) => {
    // ... (keep logic same)
    const email = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi)?.[0] || "";
    const linkedin = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/)?.[0] || "";

    const skillsMatch = text.match(/(?:skills|technologies|stack):?(.+?)(?:\n\n|\n[A-Z])/i);
    const skillsFound = skillsMatch ? skillsMatch[1].split(/,|•|\/|\|/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 20).slice(0, 10) : [];

    const commonRoles = ["Product Manager", "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack", "Data Scientist", "Designer", "Founder", "CTO"];
    const rolesFound = commonRoles.filter(r => text.includes(r));

    return {
      skills: skillsFound,
      roles: rolesFound.length ? rolesFound : [],
      locations: [],
      linkedin
    };
  };

  const handleManualLocationExpand = async () => {
    if (!locations.trim()) return;
    setIsExpandingLocs(true);
    try {
      const apiKey = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || "";
      const locList = locations.split(',').map(s => s.trim()).filter(Boolean);
      if (locList.length === 0) return;

      const expanded = await expandLocations(apiKey, locList);
      setExpandedLocsPreview(expanded);
    } catch (e) {
      console.error("Manual Expansion Failed", e);
    } finally {
      setIsExpandingLocs(false);
    }
  };

  const handleAutoFill = async (overrideText?: string, overrideUrl?: string) => {
    const textToUse = overrideText !== undefined ? overrideText : resumeText;
    const urlToUse = overrideUrl !== undefined ? overrideUrl : linkedinUrl;

    if (!textToUse.trim() && !urlToUse.trim()) {
      if (!overrideText && !overrideUrl) setError("Please upload a resume, enter a URL, or paste text first.");
      return;
    }

    setIsLoading(true);
    setLoadingMsg("Analyzing Profile...");
    setError(null);
    const apiKey = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || "";

    const quickData = heuristicParse(textToUse);
    if (quickData.skills.length > 0 && !skills) setSkills(quickData.skills.join(', '));
    // Don't set roles from heuristic yet, wait for AI for better accuracy usually. unless empty.
    if (quickData.roles.length > 0 && !roles) setRoles(quickData.roles.join(', '));
    if (quickData.linkedin && !linkedinUrl) setLinkedinUrl(`https://${quickData.linkedin}`);

    try {
      const inputs: ProfileInputs = { text: textToUse, linkedinUrl: urlToUse };
      const profile = await parseCandidateProfile(apiKey, inputs, {});

      setAnalyzedProfile(profile);

      // Populate text fields
      if (profile.locations) setLocations(profile.locations.join(', '));
      if (profile.industries) setIndustries(profile.industries.join(', '));
      if (profile.skills) setSkills(profile.skills.join(', '));
      if (profile.avoid_keywords) setAvoid(profile.avoid_keywords.join(', '));

      // IMMEDIATE ROLE EXPANSION (Feedback Fix)
      // We expand immediately so user can edit the expanded list.
      if (profile.target_roles && profile.target_roles.length > 0) {
        setLoadingMsg("Expanding & Optimizing Role Synonyms...");
        try {
          // Only expand if we have roles
          const expanded = await expandRoles(apiKey, profile.target_roles);
          // Merge original + expanded for the text box
          const combinedRoles = [...new Set([...profile.target_roles, ...expanded])];
          setRoles(combinedRoles.join(', '));
        } catch (e) {
          console.warn("Immediate role expansion failed", e);
          // Fallback to just the identified roles
          setRoles(profile.target_roles.join(', '));
        }
      } else {
        setRoles('');
      }

    } catch (err: any) {
      console.error("Auto-Fill Error:", err);
      setError("⚠️ AI Analysis failed. We've done a basic text scan instead. Please verify.");
    } finally {
      setIsLoading(false);
      setLoadingMsg("");
    }
  };

  const handleSubmit = async () => {
    // ... (keep logic mostly same, but remove the DUPLICATE expansion call since we do it upfront now)
    const currentConstraints = {
      target_roles: roles.split(',').map(s => s.trim()).filter(Boolean),
      locations: locations.split(',').map(s => s.trim()).filter(Boolean),
      industries: industries.split(',').map(s => s.trim()).filter(Boolean),
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      avoid_keywords: avoid.split(',').map(s => s.trim()).filter(Boolean),
      search_lookback: lookback,
      search_depth: depth
    };

    const hasExistingConfig = !!getConfig();
    const hasNewSource = !!(resumeText.trim() || linkedinUrl.trim());

    if (!hasNewSource && !hasExistingConfig && currentConstraints.target_roles.length === 0) {
      setError("Please provide Resume/URL OR manually fill the Target Roles.");
      return;
    }

    setIsLoading(true);
    setLoadingMsg("Calibrating Mission...");
    setError(null);
    const apiKey = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || "";

    try {
      let finalProfile: any = {};

      const isManualFastTrack = currentConstraints.target_roles.length > 0 && currentConstraints.locations.length > 0;

      if (isManualFastTrack) {
        let bio = analyzedProfile?.professional_bio || "";
        if (!bio) {
          const roleStr = currentConstraints.target_roles.join(' / ');
          const skillStr = currentConstraints.skills.join(', ') || "Key Skills";
          bio = `Professional targeting ${roleStr} roles. Competencies: ${skillStr}.`;
        }

        finalProfile = {
          ...analyzedProfile,
          ...currentConstraints,
          professional_bio: bio,
          achievements: analyzedProfile?.achievements || [],
          seniority_level: analyzedProfile?.seniority_level || "Unknown",
          search_lookback: lookback,
          search_depth: depth
        };
      }
      else if (hasNewSource) {
        // This path is rare now if we auto-filled, but kept for safety
        const inputs: ProfileInputs = { text: resumeText, linkedinUrl: linkedinUrl };
        const explicitConstraints: ExplicitConstraints = {
          roles: roles, locations: locations, industries: industries, skills: skills, avoid: avoid
        };
        const freshProfile = await parseCandidateProfile(apiKey, inputs, explicitConstraints);
        finalProfile = { ...freshProfile, search_lookback: lookback, search_depth: depth };
      }
      else if (hasExistingConfig) {
        const prev = getConfig();
        finalProfile = { ...prev, ...currentConstraints, search_lookback: lookback, search_depth: depth };
      }

      // Location Expansion still happens here because user might have just typed "Germany" manually
      if (finalProfile.locations && finalProfile.locations.length > 0) {
        setLoadingMsg("Discovering Regional Job Boards...");
        try {
          const boards = await identifyRegionalBoards(apiKey, finalProfile.locations, finalProfile.industries || []);
          finalProfile.regional_boards = boards;
        } catch (e) { console.warn(e); }

        setLoadingMsg("Optimizing Location Precision...");
        try {
          const expanded = await expandLocations(apiKey, finalProfile.locations);
          finalProfile.expanded_locations = expanded;
        } catch (e) { console.warn(e); }
      }

      // Removed the Role Expansion blocked here since we do it interactively now.
      // But we should ensure expanded_roles is set if it exists in finalProfile?
      // Actually, since roles are now EXPLICIT in target_roles (because we expanded upfront),
      // we don't strictly *need* a separate expanded_roles list, OR we can treat target_roles as the expanded list.
      // The discovery logic uses target_roles.
      // Let's just set expanded_roles = target_roles to be safe for any downstream logic relying on it.
      finalProfile.expanded_roles = finalProfile.target_roles;

      saveConfig(finalProfile);
      if (resumeText.trim()) saveKey(STORAGE_KEYS.RAW_RESUME, resumeText);
      clearLatestRun();
      clearDraft();
      onComplete();
    } catch (err: any) {
      console.error("Submission Error:", err);
      if (currentConstraints.target_roles.length > 0) {
        const fallbackProfile = {
          ...currentConstraints,
          professional_bio: "Profile created via manual entry (AI unavailable).",
          achievements: [],
          seniority_level: "Unknown"
        };
        saveConfig(fallbackProfile);
        clearLatestRun();
        clearDraft();
        onComplete();
        return;
      }
      setError("⚠️ AI Error. Please manually fill the 'Target Roles' and 'Locations' boxes to proceed.");
    } finally {
      setIsLoading(false);
      setLoadingMsg("");
    }
  };

  const isFastTrackReady = roles.length > 0 && locations.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 overflow-y-auto">
      <div className="max-w-5xl w-full my-8">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            <span className="font-medium">Back to Keys</span>
          </button>
        </div>

        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-indigo-900/50">
          <div className="space-y-6">
            <div className="border-b border-slate-700 pb-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>🛰️</span> Mission Configuration
              </h2>
              <p className="text-slate-400 mt-1">
                Define your search parameters. Upload Resume to auto-fill.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* LEFT COLUMN: Sources */}
              <div className="space-y-6">
                <label className="text-sm font-bold text-indigo-400 uppercase tracking-wider block">
                  Step 1: Upload Intelligence
                </label>

                <div className="space-y-4">
                  <div className="p-4 border border-dashed border-slate-600 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors text-center cursor-pointer relative" onClick={() => !isExtracting && fileInputRef.current?.click()}>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={handleFileChange} />
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-indigo-400">
                      {isExtracting ? <span className="animate-spin text-xl">↻</span> : <span className="text-xl">📄</span>}
                    </div>
                    <p className="text-sm text-slate-300 font-medium">{selectedFile ? selectedFile.name : "Upload Resume / CV (PDF or Image)"}</p>
                    <p className="text-xs text-slate-500 mt-1">{isExtracting ? "Extracting & Analyzing..." : selectedFile ? "Ready" : "Click to select"}</p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-700">
                    <Input
                      label="LinkedIn URL"
                      placeholder="https://linkedin.com/in/..."
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      onBlur={() => handleAutoFill(undefined, linkedinUrl)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Text Content</label>
                      {resumeText && <span className="text-xs text-emerald-400">✓ {resumeText.length} chars</span>}
                    </div>
                    <textarea
                      className="w-full h-[150px] bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Resume text..."
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                    />
                  </div>

                  <Button
                    onClick={() => handleAutoFill()}
                    disabled={isLoading || isExtracting || (!resumeText && !linkedinUrl)}
                    variant="secondary"
                    className="w-full border border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/20"
                  >
                    ✨ Analyze Text Manual Entry
                  </Button>
                </div>
              </div>

              {/* RIGHT COLUMN: Explicit Overrides */}
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-bold text-emerald-400 uppercase tracking-wider block">
                    Step 2: Mission Parameters
                  </label>
                  <p className="text-xs text-slate-500 mt-1 italic">
                    🔴 EXPLICIT overrides. Values entered here take absolute priority over your resume content.
                  </p>
                </div>

                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                  <Input label="Target Roles" placeholder="e.g. Product Manager, senior, staff" value={roles} onChange={(e) => setRoles(e.target.value)} />

                  <div className="space-y-1">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input label="Locations" placeholder="e.g. Remote, London" value={locations} onChange={(e) => setLocations(e.target.value)} />
                      </div>
                      <Button
                        onClick={handleManualLocationExpand}
                        disabled={isExpandingLocs || !locations.trim()}
                        variant="secondary"
                        className="mb-[2px] h-10 px-3 text-xs border border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/20"
                        title="AI Expand Locations"
                      >
                        {isExpandingLocs ? '✨...' : '✨ Expand'}
                      </Button>
                    </div>
                    {expandedLocsPreview.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 pl-1">
                        <span className="text-[10px] text-emerald-400 font-mono">Expanded:</span>
                        {expandedLocsPreview.slice(0, 5).map((loc, i) => (
                          <span key={i} className="text-[10px] px-1 rounded bg-emerald-900/20 text-emerald-300 border border-emerald-900/30">{loc}</span>
                        ))}
                        {expandedLocsPreview.length > 5 && <span className="text-[10px] text-slate-500">+{expandedLocsPreview.length - 5} more</span>}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-300 block">Search Depth</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'standard', label: 'Standard', desc: 'Fast, Broad' },
                          { id: 'deep', label: 'Deep', desc: 'Thorough' },
                          { id: 'comprehensive', label: 'Max', desc: 'All Corners' }
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            onClick={() => setDepth(opt.id as any)}
                            className={`cursor-pointer rounded-lg p-2 border transition-all text-center ${depth === opt.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                          >
                            <div className="text-xs font-bold uppercase">{opt.label}</div>
                            <div className="text-[10px] opacity-70">{opt.desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-300 block">Time Horizon</label>
                      <select value={lookback} onChange={(e) => setLookback(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm">
                        <option value="1d">Last 24 Hours (Fresh)</option>
                        <option value="3d">Last 3 Days</option>
                        <option value="7d">Last 7 Days (Standard)</option>
                        <option value="14d">Last 14 Days</option>
                        <option value="30d">Last 30 Days (Max)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                  <Input label="Industries" placeholder="e.g. Fintech, SaaS" value={industries} onChange={(e) => setIndustries(e.target.value)} />
                  <Input label="Skills" placeholder="e.g. React, Python" value={skills} onChange={(e) => setSkills(e.target.value)} />
                  <Input label="Avoid" placeholder="e.g. Crypto, Unpaid" value={avoid} onChange={(e) => setAvoid(e.target.value)} className="border-red-900/50" />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-amber-500/10 border border-amber-500/50 p-4 rounded-lg text-amber-200 text-sm animate-in fade-in">
                <div className="flex items-center gap-2 font-bold mb-1"><span>⚠️</span> Notice</div>
                <p>{error}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-700">
              <Button
                onClick={handleSubmit}
                isLoading={isLoading}
                disabled={isExtracting}
                className={`w-full h-14 text-lg font-bold border-0 shadow-lg ${isFastTrackReady ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                {isLoading ? (loadingMsg || 'Processing...') : (isFastTrackReady ? 'Save & Launch 🚀' : 'Analyze & Save')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};