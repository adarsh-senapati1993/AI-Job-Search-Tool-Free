import React, { useState, useEffect, useRef } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { parseCandidateProfile, ExplicitConstraints, ProfileInputs, CandidateProfile, generateSearchStrategy, expandLocations, expandRoles, expandTargetRoles } from '../lib/ai';
import { getKey, STORAGE_KEYS, saveKey, clearLatestRun } from '../lib/storage';
import { useAppStore } from '../lib/store';
import { logErrorToStorage } from '../lib/api-utils';
import { CustomSelect } from './CustomSelect';
// Use legacy build for maximum Vite compatibility.
import * as pdfjsLibProxy from 'pdfjs-dist/legacy/build/pdf';
import { performOCR, isImageFile } from '../lib/ocr';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';

const pdfjsLib: any = pdfjsLibProxy;

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  // Use local worker bundle via Vite to avoid external CDN latency/blocking.
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

interface ProfileConfigProps {
  onComplete: () => void;
  onBack: () => void;
}

export const ProfileConfig = ({ onComplete, onBack }: ProfileConfigProps) => {
  const { userConfig, setUserConfig, activeProvider, perplexityKey, geminiKey } = useAppStore();

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
  const [expandedRolesPreview, setExpandedRolesPreview] = useState<string[]>([]);
  const [isExpandingRoles, setIsExpandingRoles] = useState(false);

  // Granular State for the form
  const [roles, setRoles] = useState('');
  const [locations, setLocations] = useState('');
  const [industries, setIndustries] = useState('');
  const [skills, setSkills] = useState('');
  const [avoid, setAvoid] = useState('');
  const [lookback, setLookback] = useState('14d');
  const [depth, setDepth] = useState<'standard' | 'deep' | 'comprehensive'>('standard');
  const [workMode, setWorkMode] = useState<'any' | 'remote' | 'hybrid' | 'onsite'>('any');
  const [remoteBaseCountry, setRemoteBaseCountry] = useState('');

  const [analyzedProfile, setAnalyzedProfile] = useState<CandidateProfile | null>(null);
  const linkedinAutofillTimeoutRef = useRef<number | null>(null);
  const linkedinAutofillInFlightRef = useRef(false);

  // Effect to populate form from the store's userConfig
  useEffect(() => {
    if (userConfig) {
      setRoles(userConfig.target_roles?.join(', ') || '');
      setLocations(userConfig.locations?.join(', ') || '');
      setIndustries(userConfig.industries?.join(', ') || '');
      setSkills(userConfig.skills?.join(', ') || '');
      setAvoid(userConfig.avoid_keywords?.join(', ') || '');
      setLookback(userConfig.search_lookback || '14d');
      setDepth(userConfig.search_depth || 'standard');
      setWorkMode(userConfig.work_mode || 'any');
      setRemoteBaseCountry(userConfig.remote_base_country || '');
      setAnalyzedProfile(userConfig);
    }

    const savedRawResume = getKey(STORAGE_KEYS.RAW_RESUME);
    if (savedRawResume) {
      setResumeText(savedRawResume);
    }
  }, [userConfig]);

  const getActiveApiKey = () => {
    return activeProvider === 'gemini' ? geminiKey : perplexityKey;
  }

  const computeTextHash = (text: string): string => {
    const str = text.slice(0, 20000); // cap to keep hashing fast
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return String(hash);
  };

  const getProfileCache = (): Record<string, any> => {
    try {
      const raw = getKey(STORAGE_KEYS.PROFILE_ANALYSIS_CACHE);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const setProfileCache = (cache: Record<string, any>) => {
    try {
      saveKey(STORAGE_KEYS.PROFILE_ANALYSIS_CACHE, JSON.stringify(cache));
    } catch {
      // ignore quota
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      if (!pdfjsLib) throw new Error("PDF Library not loaded.");
      if (!pdfjsLib.getDocument) throw new Error("PDF Library missing getDocument method.");
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

      // Guard against rare hangs (worker load/network) with a timeout.
      const pdf = await Promise.race([
        loadingTask.promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("PDF load timeout")), 15000))
      ]) as any;

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
      logErrorToStorage('extractTextFromPDF', e);
      console.error("PDF Extraction Failed", e);
      throw new Error("Could not read PDF text.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
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
          text = await performOCR(file);
        } else {
          text = await file.text();
        }
        if (!text || text.length < 50) {
          throw new Error("Extracted text was too short. Please ensure the image/PDF is clear.");
        }
        setResumeText(text);
        // Extraction should feel instant. Kick off AI analysis asynchronously.
        setIsExtracting(false);
        handleAutoFill(text, linkedinUrl);
      } catch (err: any) {
        logErrorToStorage('handleFileChange', err);
        setError(err.message || "Failed to read file.");
        setResumeText('');
      } finally {
        // If extraction already completed, this is a no-op.
        setIsExtracting(false);
      }
    }
  };

  const handleManualLocationExpand = async () => {
    if (!locations.trim()) return;
    setIsExpandingLocs(true);
    try {
      const apiKey = getActiveApiKey();
      const locList = locations.split(',').map(s => s.trim()).filter(Boolean);
      if (locList.length === 0) return;
      
      // Mutual exclusion: Close Roles expansion when starting Locations
      setExpandedRolesPreview([]);
      
      const expanded = await expandLocations(apiKey, locList);
      setExpandedLocsPreview(expanded);
    } catch (e: any) {
      logErrorToStorage('handleManualLocationExpand', e);
      console.error("Manual Expansion Failed", e);
    } finally {
      setIsExpandingLocs(false);
    }
  };

  const handleManualRoleExpand = async () => {
    if (!roles.trim()) return;
    setIsExpandingRoles(true);
    try {
      const apiKey = getActiveApiKey();
      const roleList = roles.split(',').map(s => s.trim()).filter(Boolean);
      const indList = industries.split(',').map(s => s.trim()).filter(Boolean);
      const seniority = analyzedProfile?.seniority_level || 'Unknown';
      if (roleList.length === 0) return;
      
      // Mutual exclusion: Close Locations expansion when starting Roles
      setExpandedLocsPreview([]);
      
      const expanded = await expandTargetRoles(apiKey, roleList, seniority, indList, analyzedProfile || undefined);
      // Apply suggestions immediately to the editable "Target Roles" field.
      // Users can still deselect any pill afterwards.
      const existingLower = new Set(roleList.map(r => r.toLowerCase()));
      const merged = [...roleList];
      expanded.forEach(r => {
        const t = String(r || '').trim();
        const key = t.toLowerCase();
        if (!t || existingLower.has(key)) return;
        existingLower.add(key);
        merged.push(t);
      });

      setRoles(merged.join(', '));
      setExpandedRolesPreview(expanded);
    } catch (e: any) {
      logErrorToStorage('handleManualRoleExpand', e);
      console.error("Manual Roles Expansion Failed", e);
    } finally {
      setIsExpandingRoles(false);
    }
  };

  const handleToggleExpandedRole = (roleToToggle: string) => {
    const current = roles.split(',').map(s => s.trim()).filter(Boolean);
    const exists = current.some(r => r.toLowerCase() === roleToToggle.toLowerCase());
    
    if (exists) {
       setRoles(current.filter(r => r.toLowerCase() !== roleToToggle.toLowerCase()).join(', '));
    } else {
       setRoles([...current, roleToToggle].join(', '));
    }
  };

  const handleToggleExpandedLoc = (locToToggle: string) => {
    const current = locations.split(',').map(s => s.trim()).filter(Boolean);
    const exists = current.some(l => l.toLowerCase() === locToToggle.toLowerCase());
    
    if (exists) {
       setLocations(current.filter(l => l.toLowerCase() !== locToToggle.toLowerCase()).join(', '));
    } else {
       setLocations([...current, locToToggle].join(', '));
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
    setLoadingMsg("Analysing & Expanding Profile...");
    setError(null);
    const apiKey = getActiveApiKey();

    try {
      const inputs: ProfileInputs = { text: textToUse, linkedinUrl: urlToUse };
      // Cache key: based on resume text + active provider + version (to bust old caches with new prompts).
      const cacheKey = `V5_SMART:${activeProvider}:${computeTextHash(textToUse)}:${(urlToUse || '').trim()}`;
      const cache = getProfileCache();

      let profile: any = cache[cacheKey] || null;
      if (!profile) {
        profile = await parseCandidateProfile(apiKey, inputs, {});
        cache[cacheKey] = profile;
        setProfileCache(cache);
      }

      // Validate shape to avoid silent no-ops when the LLM returns null/invalid JSON.
      if (!profile || typeof profile !== 'object') {
        throw new Error("Profile analysis returned empty/invalid JSON. Please retry.");
      }
      const targetRoles = Array.isArray(profile.target_roles) ? profile.target_roles.filter(Boolean) : [];
      const locs = Array.isArray(profile.locations) ? profile.locations.filter(Boolean) : [];
      const inds = Array.isArray(profile.industries) ? profile.industries.filter(Boolean) : [];
      const sks = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
      const av = Array.isArray(profile.avoid_keywords) ? profile.avoid_keywords.filter(Boolean) : [];

      if (targetRoles.length === 0 && locs.length === 0 && sks.length === 0) {
        throw new Error("Profile analysis did not extract roles/locations/skills. Try pasting resume text directly or retry.");
      }

      const normalizedProfile: CandidateProfile = {
        professional_bio: String(profile.professional_bio || ''),
        seniority_level: String(profile.seniority_level || 'Unknown'),
        target_roles: targetRoles,
        locations: locs,
        skills: sks,
        industries: inds,
        avoid_keywords: av,
        achievements: Array.isArray(profile.achievements) ? profile.achievements.filter(Boolean) : [],
      };

      setAnalyzedProfile(normalizedProfile);
      setRoles(normalizedProfile.target_roles.join(', '));
      setLocations(normalizedProfile.locations.join(', '));
      setIndustries(normalizedProfile.industries.join(', '));
      setSkills(normalizedProfile.skills.join(', '));
      setAvoid(normalizedProfile.avoid_keywords.join(', '));
    } catch (err: any) {
      logErrorToStorage('handleAutoFill', err);
      console.error("Auto-Fill Error:", err);
      setError(`⚠️ AI Analysis failed: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMsg("");
    }
  };

  const scheduleLinkedinAutofill = (url: string) => {
    const trimmed = (url || '').trim();
    if (!trimmed) return;

    if (linkedinAutofillTimeoutRef.current) {
      window.clearTimeout(linkedinAutofillTimeoutRef.current);
      linkedinAutofillTimeoutRef.current = null;
    }

    // Debounce: avoid firing multiple times when user tabs quickly.
    linkedinAutofillTimeoutRef.current = window.setTimeout(async () => {
      if (linkedinAutofillInFlightRef.current) return;
      linkedinAutofillInFlightRef.current = true;
      try {
        await handleAutoFill(undefined, trimmed);
      } finally {
        linkedinAutofillInFlightRef.current = false;
      }
    }, 500);
  };

  const handleSubmit = async () => {
    const currentConstraints: Partial<CandidateProfile> = {
      target_roles: roles.split(',').map(s => s.trim()).filter(Boolean),
      locations: locations.split(',').map(s => s.trim()).filter(Boolean),
      industries: industries.split(',').map(s => s.trim()).filter(Boolean),
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      avoid_keywords: avoid.split(',').map(s => s.trim()).filter(Boolean),
      search_lookback: lookback,
      search_depth: depth,
      work_mode: workMode,
      remote_base_country: workMode === 'remote' ? remoteBaseCountry.trim() : undefined
    };

    if (currentConstraints.target_roles?.length === 0) {
      setError("Please provide at least one Target Role.");
      return;
    }

    setIsLoading(true);
    setLoadingMsg("Calibrating Mission...");
    setError(null);
    const apiKey = getActiveApiKey();

    try {
      let finalProfile: CandidateProfile = {
        ...analyzedProfile,
        ...currentConstraints,
        professional_bio: analyzedProfile?.professional_bio || `Professional targeting ${currentConstraints.target_roles?.join(' / ')} roles.`, 
        achievements: analyzedProfile?.achievements || [],
        seniority_level: analyzedProfile?.seniority_level || "Unknown",
      } as CandidateProfile;

      setLoadingMsg("Generating Search Strategy & Brainstorming Synonyms...");
      try {
        const strategy = await generateSearchStrategy(apiKey, finalProfile.target_roles, finalProfile.locations, finalProfile.industries || []);
        finalProfile.expanded_roles = strategy.expanded_roles;
        finalProfile.expanded_locations = strategy.expanded_locations;
        finalProfile.regional_boards = strategy.regional_boards;
        // Optional: Save search focus or print it to logs? 
        console.log("AI Strategy Focus:", strategy.search_focus);
      } catch (e: any) {
        logErrorToStorage('generateSearchStrategy (Fallback Triggered)', e);
        console.warn("Strategy expansion failed, using defaults", e);
        finalProfile.expanded_roles = finalProfile.target_roles;
        finalProfile.expanded_locations = finalProfile.locations;
      }

      setUserConfig(finalProfile);
      if (resumeText.trim()) saveKey(STORAGE_KEYS.RAW_RESUME, resumeText);
      clearLatestRun();
      onComplete();
    } catch (err: any) {
      logErrorToStorage('handleSubmit Calibration', err);
      console.error("Submission Error:", err);
      setError(`⚠️ AI Error during final calibration: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMsg("");
    }
  };

  const isFastTrackReady = roles.length > 0 && locations.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAFAFA] dark:bg-slate-900 overflow-y-auto">
      <div className="max-w-5xl w-full my-8">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} className="flex items-center gap-2 text-[#86868B] dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            <span className="font-medium">Back to Keys</span>
          </button>
        </div>

        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-indigo-200 dark:border-indigo-900/50">
          <div className="space-y-6">
            <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
              <h2 className="text-2xl font-bold text-[#1D1D1F] dark:text-white flex items-center gap-2">
                <span>🛰️</span> Mission Configuration
              </h2>
              <p className="text-[#86868B] dark:text-slate-400 mt-1">
                Define your search parameters. Upload a resume to auto-fill.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* LEFT COLUMN: Sources */}
              <div className="space-y-6">
                <label className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                  Step 1: Upload Intelligence
                </label>

                <div className="space-y-4">
                  <div className="p-4 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors text-center cursor-pointer relative" onClick={() => !isExtracting && fileInputRef.current?.click()}>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={handleFileChange} disabled={isExtracting} />
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-indigo-600 dark:text-indigo-400">
                      {isExtracting ? <span className="animate-spin text-xl">↻</span> : <span className="text-xl">📄</span>}
                    </div>
                    <p className="text-sm text-[#1D1D1F] dark:text-slate-300 font-medium">{selectedFile ? selectedFile.name : "Upload Resume / CV (PDF or Image)"}</p>
                    <p className="text-xs text-slate-500 mt-1">{isExtracting ? "Extracting & Analyzing..." : selectedFile ? "Ready" : "Click to select"}</p>
                  </div>

                  <div className="bg-[#F5F5F7] dark:bg-slate-950 border border-transparent dark:border-slate-700 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <Input
                      label="LinkedIn URL"
                      placeholder="https://linkedin.com/in/..."
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      onBlur={() => scheduleLinkedinAutofill(linkedinUrl)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Text Content</label>
                      {resumeText && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ {resumeText.length} chars</span>}
                    </div>
                    <textarea
                      className="w-full h-[150px] bg-[#F5F5F7] dark:bg-slate-950 border border-transparent dark:border-slate-700 focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/20 rounded-lg p-3 text-[#1D1D1F] dark:text-slate-300 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Resume text..."
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                    />
                  </div>

                  <Button
                    onClick={() => handleAutoFill()}
                    disabled={isLoading || isExtracting || (!resumeText && !linkedinUrl)}
                    variant="secondary"
                    className="w-full border border-indigo-500/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  >
                    ✨ Analyze Text Manual Entry
                  </Button>
                </div>
              </div>

              {/* RIGHT COLUMN: Explicit Overrides */}
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                    Step 2: Mission Parameters
                  </label>
                  <p className="text-xs text-slate-500 mt-1 italic">
                    🔴 EXPLICIT overrides. Values entered here take absolute priority over your resume content.
                  </p>
                </div>

                <div className="p-4 premium-panel space-y-4">
                    <div className="relative">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Input label="Target Roles" placeholder="e.g. Product Manager, senior, staff" value={roles} onChange={(e) => setRoles(e.target.value)} />
                        </div>
                        <Button
                          onClick={handleManualRoleExpand}
                          disabled={isExpandingRoles || !roles.trim()}
                          variant="secondary"
                          className="mb-[2px] h-10 px-3 text-xs border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                          title="AI Expand Roles"
                        >
                          {isExpandingRoles ? '✨...' : '✨ Expand'}
                        </Button>
                      </div>

                      {expandedRolesPreview.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <span className="text-indigo-500">✨</span> AI Suggested Roles
                            </span>
                            <button onClick={() => setExpandedRolesPreview([])} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg transition-colors">Done</button>
                          </div>
                          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                            {[...new Set(expandedRolesPreview)].map((r, i) => {
                              const isSelected = roles.split(',').map(s => s.trim().toLowerCase()).includes(r.toLowerCase());
                              return (
                                <button 
                                  key={i} 
                                  onClick={() => handleToggleExpandedRole(r)}
                                  className={`text-[12px] px-3 py-1.5 rounded-full border transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600'}`}
                                >
                                  {r} {isSelected ? '✓' : '+'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Input label="Locations" placeholder="e.g. Remote, London" value={locations} onChange={(e) => setLocations(e.target.value)} />
                        </div>
                        <Button
                          onClick={handleManualLocationExpand}
                          disabled={isExpandingLocs || !locations.trim()}
                          variant="secondary"
                          className="mb-[2px] h-10 px-3 text-xs border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                          title="AI Expand Locations"
                        >
                          {isExpandingLocs ? '✨...' : '✨ Expand'}
                        </Button>
                      </div>

                      {expandedLocsPreview.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <span className="text-emerald-500">✨</span> AI Suggested Locations
                            </span>
                            <button onClick={() => setExpandedLocsPreview([])} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg transition-colors">Done</button>
                          </div>
                          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                            {[...new Set(expandedLocsPreview)].map((loc, i) => {
                              const isSelected = locations.split(',').map(s => s.trim().toLowerCase()).includes(loc.toLowerCase());
                              return (
                                <button 
                                  key={i} 
                                  onClick={() => handleToggleExpandedLoc(loc)}
                                  className={`text-[12px] px-3 py-1.5 rounded-full border transition-all ${isSelected ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-600'}`}
                                >
                                  {loc} {isSelected ? '✓' : '+'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 pt-2">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-[#1D1D1F] dark:text-slate-300 block">Search Depth</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[{"id": "standard", "label": "Standard", "desc": "Fast, Broad"},{"id": "deep", "label": "Deep", "desc": "Thorough"},{"id": "comprehensive", "label": "Max", "desc": "All Corners"}].map((opt) => (
                          <div
                            key={opt.id}
                            onClick={() => setDepth(opt.id as any)}
                            className={`cursor-pointer rounded-lg p-2 border transition-all text-center ${depth === opt.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-[#86868B] dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                          >
                            <div className="text-xs font-bold uppercase">{opt.label}</div>
                            <div className="text-[10px] opacity-70">{opt.desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-[#1D1D1F] dark:text-slate-300 block">Time Horizon</label>
                      <CustomSelect 
                        value={lookback} 
                        onChange={(e: any) => setLookback(e.target.value)} 
                        options={[
                          { value: "1d", label: "Last 24 Hours (Fresh)" },
                          { value: "3d", label: "Last 3 Days" },
                          { value: "7d", label: "Last 7 Days (Standard)" },
                          { value: "14d", label: "Last 14 Days" },
                          { value: "30d", label: "Last 30 Days (Max)" }
                        ]}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm font-medium text-[#1D1D1F] dark:text-slate-300 block">Work Mode</label>
                      <div className="grid grid-cols-4 gap-2">
                        {([{id: 'any', label: 'Any', desc: 'All types'}, {id: 'remote', label: 'Remote', desc: 'WFH'}, {id: 'hybrid', label: 'Hybrid', desc: 'Mix'}, {id: 'onsite', label: 'Onsite', desc: 'In-Office'}] as const).map((opt) => (
                          <div
                            key={opt.id}
                            onClick={() => setWorkMode(opt.id)}
                            className={`cursor-pointer rounded-lg p-2 border transition-all text-center ${workMode === opt.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-[#86868B] dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                          >
                            <div className="text-xs font-bold uppercase">{opt.label}</div>
                            <div className="text-[10px] opacity-70">{opt.desc}</div>
                          </div>
                        ))}
                      </div>
                      {workMode === 'remote' && (
                        <div className="mt-2">
                          <Input label="Base Country (where you'll work from)" placeholder="e.g. India, Germany" value={remoteBaseCountry} onChange={(e) => setRemoteBaseCountry(e.target.value)} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 premium-panel space-y-4">
                  <Input label="Industries" placeholder="e.g. Fintech, SaaS" value={industries} onChange={(e) => setIndustries(e.target.value)} />
                  <Input label="Skills" placeholder="e.g. React, Python" value={skills} onChange={(e) => setSkills(e.target.value)} />
                  <Input label="Avoid" placeholder="e.g. Crypto, Unpaid" value={avoid} onChange={(e) => setAvoid(e.target.value)} className="border-red-300 dark:border-red-900/50" />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/50 p-4 rounded-lg text-amber-800 dark:text-amber-200 text-sm animate-in fade-in">
                <div className="flex items-center gap-2 font-bold mb-1"><span>⚠️</span> Notice</div>
                <p>{error}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
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
