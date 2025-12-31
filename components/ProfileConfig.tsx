import React, { useState, useEffect, useRef } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { parseCandidateProfile, ExplicitConstraints, ProfileInputs, CandidateProfile } from '../lib/ai';
import { getKey, saveConfig, STORAGE_KEYS, getConfig, saveDraft, getDraft, clearDraft, saveKey } from '../lib/storage';
import * as pdfjsLibProxy from 'pdfjs-dist';

// Handle ESM/CJS interop for pdfjs-dist
let pdfjsLib: any = pdfjsLibProxy;
// If the import is wrapped in a default object (CommonJS/UMD interop), unwrap it
if ((pdfjsLibProxy as any).default) {
    pdfjsLib = (pdfjsLibProxy as any).default;
}

// Initialize PDF Worker
// usage of specific version from cdnjs to ensure worker compatibility
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
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Granular State
  const [roles, setRoles] = useState('');
  const [locations, setLocations] = useState('');
  const [industries, setIndustries] = useState('');
  const [skills, setSkills] = useState('');
  const [avoid, setAvoid] = useState('');
  const [lookback, setLookback] = useState('14d'); // Default 14 days
  
  // Holds the full AI-analyzed profile (bio, achievements)
  const [analyzedProfile, setAnalyzedProfile] = useState<CandidateProfile | null>(null);

  // Hydrate state
  useEffect(() => {
    // 1. Check Draft (In-progress edits)
    const draft = getDraft();
    if (draft) {
        setRoles(draft.roles || '');
        setLocations(draft.locations || '');
        setIndustries(draft.industries || '');
        setSkills(draft.skills || '');
        setAvoid(draft.avoid || '');
        setLookback(draft.lookback || '14d');
        setResumeText(draft.resumeText || '');
        setLinkedinUrl(draft.linkedinUrl || '');
        return;
    }

    // 2. Fallback to Saved Config + Raw Resume (Persistent)
    const config = getConfig();
    if (config) {
        if (config.target_roles) setRoles(config.target_roles.join(', '));
        if (config.locations) setLocations(config.locations.join(', '));
        if (config.industries) setIndustries(config.industries.join(', '));
        if (config.skills) setSkills(config.skills.join(', '));
        if (config.avoid_keywords) setAvoid(config.avoid_keywords.join(', '));
        if (config.search_lookback) setLookback(config.search_lookback);
        
        // Retain the full analyzed profile if it exists in config
        setAnalyzedProfile(config);
    }
    
    // Load the raw resume text if available
    const savedRawResume = getKey(STORAGE_KEYS.RAW_RESUME);
    if (savedRawResume) {
        setResumeText(savedRawResume);
    }
  }, []);

  // Auto-Save Draft on Change
  useEffect(() => {
    const draft = {
        roles,
        locations,
        industries,
        skills,
        avoid,
        lookback,
        resumeText,
        linkedinUrl
    };
    saveDraft(draft);
  }, [roles, locations, industries, skills, avoid, lookback, resumeText, linkedinUrl]);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
        if (!pdfjsLib) throw new Error("PDF Library not loaded.");
        if (!pdfjsLib.getDocument) throw new Error("PDF Library missing getDocument method.");

        const arrayBuffer = await file.arrayBuffer();
        
        // Use pdfjsLib from the proxy resolution above
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            // IMPROVEMENT: Join with newlines to preserve list structure/bullets better than spaces
            const pageText = textContent.items.map((item: any) => item.str).join('\n');
            fullText += pageText + '\n\n';
        }
        
        if (!fullText.trim()) {
            throw new Error("PDF text extracted was empty. It might be an image-only PDF.");
        }
        
        return fullText;
    } catch (e: any) {
        console.error("PDF Extraction Failed", e);
        // Provide more detailed error messages
        let msg = "Could not read PDF text.";
        if (e.name === 'MissingPDFException') msg = "Invalid PDF file.";
        else if (e.name === 'InvalidPDFException') msg = "Corrupt PDF file.";
        else if (e.message) msg = `PDF Error: ${e.message}`;
        
        throw new Error(msg);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if (file.size > 5 * 1024 * 1024) {
        alert("File too large. Please upload a file smaller than 5MB.");
        return;
      }

      setSelectedFile(file);
      setIsExtracting(true);
      setError(null);

      try {
        if (file.type === 'application/pdf') {
            const text = await extractTextFromPDF(file);
            setResumeText(text); 
        } else {
            const text = await file.text();
            setResumeText(text);
        }
      } catch (err: any) {
        setError(err.message || "Failed to read file.");
        setResumeText('');
      } finally {
        setIsExtracting(false);
      }
    }
  };

  // Explicit Analysis Action
  const handleAutoFill = async () => {
    if (!resumeText.trim() && !linkedinUrl.trim()) {
        setError("Upload a resume or paste text first.");
        return;
    }

    setIsLoading(true);
    setError(null);
    const apiKey = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || getKey(STORAGE_KEYS.GEMINI_KEY) || "";

    try {
        const inputs: ProfileInputs = {
            text: resumeText, 
            linkedinUrl: linkedinUrl
        };
        
        // We pass empty constraints to let AI infer everything fresh
        const profile = await parseCandidateProfile(apiKey, inputs, {});
        
        // Auto-Fill States
        if (profile.target_roles) setRoles(profile.target_roles.join(', '));
        if (profile.locations) setLocations(profile.locations.join(', '));
        if (profile.industries) setIndustries(profile.industries.join(', '));
        if (profile.skills) setSkills(profile.skills.join(', '));
        if (profile.avoid_keywords) setAvoid(profile.avoid_keywords.join(', '));
        
        setAnalyzedProfile(profile);
        
    } catch (err: any) {
        setError(err.message || "Failed to extract profile data.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    // Collect current values from UI inputs
    const currentConstraints = {
        target_roles: roles.split(',').map(s => s.trim()).filter(Boolean),
        locations: locations.split(',').map(s => s.trim()).filter(Boolean),
        industries: industries.split(',').map(s => s.trim()).filter(Boolean),
        skills: skills.split(',').map(s => s.trim()).filter(Boolean),
        avoid_keywords: avoid.split(',').map(s => s.trim()).filter(Boolean),
        search_lookback: lookback
    };
    
    // Validation
    const hasExistingConfig = !!getConfig();
    const hasNewSource = !!(resumeText.trim() || linkedinUrl.trim());
    
    // If no new inputs, no existing config, and no manual roles -> Error
    if (!hasNewSource && !hasExistingConfig && currentConstraints.target_roles.length === 0) {
      setError("Please provide Resume/URL OR manually fill the Target Roles.");
      return;
    }

    setIsLoading(true);
    setError(null);
    const apiKey = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || getKey(STORAGE_KEYS.GEMINI_KEY) || "";

    try {
      let finalProfile: any = {};

      // === FAST TRACK LOGIC (THE FIX) ===
      // If the user has manually entered Roles & Locations, we TRUST them.
      // We SKIP the slow AI analysis step and generate a synthetic profile instantly.
      const isManualFastTrack = currentConstraints.target_roles.length > 0 && currentConstraints.locations.length > 0;

      if (isManualFastTrack) {
          // Construct a synthetic bio if we don't have a high-quality one yet
          let bio = analyzedProfile?.professional_bio || "";
          
          if (!bio) {
             // Fallback Bio using inputs - Instant Generation
             const roleStr = currentConstraints.target_roles.join(' / ');
             const skillStr = currentConstraints.skills.join(', ') || "Key Industry Skills";
             bio = `Professional targeting ${roleStr} roles in ${currentConstraints.locations.join(', ')}. Core competencies include: ${skillStr}. Interested in ${currentConstraints.industries.join(', ') || "Technology"} sectors.`;
          }

          finalProfile = {
              ...analyzedProfile, // Keep any pre-existing AI data
              ...currentConstraints, // User inputs override everything
              professional_bio: bio,
              achievements: analyzedProfile?.achievements || [], // If we skip AI, we might lack achievements, but speed is priority.
              search_lookback: lookback
          };
      } 
      // === SLOW TRACK ===
      // User left fields empty, so we MUST ask AI to read the resume to figure out what they want.
      else if (hasNewSource) {
          const inputs: ProfileInputs = {
              text: resumeText, 
              linkedinUrl: linkedinUrl
          };
          
          const explicitConstraints: ExplicitConstraints = {
              roles: roles,
              locations: locations,
              industries: industries,
              skills: skills,
              avoid: avoid
          };

          const freshProfile = await parseCandidateProfile(apiKey, inputs, explicitConstraints);
          finalProfile = { ...freshProfile, search_lookback: lookback };
      }
      // === EDIT TRACK ===
      // Just updating settings
      else if (hasExistingConfig) {
           const prev = getConfig();
           finalProfile = {
              ...prev,
              ...currentConstraints,
              search_lookback: lookback
           };
      }
      
      // Save Persistent Config
      saveConfig(finalProfile);
      
      // Save Raw Resume Text persistently for future edits
      if (resumeText.trim()) {
          saveKey(STORAGE_KEYS.RAW_RESUME, resumeText);
      }

      clearDraft(); 
      onComplete();
    } catch (err: any) {
      console.error("Profile Parsing Error:", err);
      setError(err.message || "Failed to analyze profile.");
    } finally {
      setIsLoading(false);
    }
  };

  const isFastTrackReady = roles.length > 0 && locations.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 overflow-y-auto">
      <div className="max-w-5xl w-full my-8">
        
        {/* Navigation Header */}
        <div className="flex items-center gap-2 mb-4">
             <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
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
                Define your search parameters. Upload your Resume or paste text so Perplexity/Gemini can analyze your background.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* LEFT COLUMN: Sources */}
                <div className="space-y-6">
                    <label className="text-sm font-bold text-indigo-400 uppercase tracking-wider block">
                       Step 1: Upload Intelligence
                    </label>
                    
                    <div className="space-y-4">
                        {/* Option 1: File Upload */}
                        <div className="p-4 border border-dashed border-slate-600 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors text-center cursor-pointer relative" onClick={() => !isExtracting && fileInputRef.current?.click()}>
                           <input 
                              type="file" 
                              ref={fileInputRef} 
                              className="hidden" 
                              accept=".pdf,.txt"
                              onChange={handleFileChange}
                           />
                           
                           <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-indigo-400">
                                {isExtracting ? (
                                    <span className="animate-spin text-xl">↻</span>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                )}
                           </div>
                           <p className="text-sm text-slate-300 font-medium">
                                {selectedFile ? selectedFile.name : "Upload Resume / CV (PDF)"}
                           </p>
                           <p className="text-xs text-slate-500 mt-1">
                               {isExtracting ? "Extracting text..." : selectedFile ? "File loaded & text extracted." : "Click to select file"}
                           </p>
                        </div>

                        {/* Option 2: LinkedIn URL */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-700">
                             <Input
                                label="LinkedIn Profile URL"
                                placeholder="https://www.linkedin.com/in/..."
                                value={linkedinUrl}
                                onChange={(e) => setLinkedinUrl(e.target.value)}
                                className="bg-slate-900"
                            />
                        </div>

                        {/* Option 3: Text Paste */}
                        <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Extracted / Pasted Text</label>
                                {resumeText && (
                                    <span className="text-xs text-emerald-400">✓ Content Ready ({resumeText.length} chars)</span>
                                )}
                             </div>
                             <textarea
                                className="w-full h-[200px] bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono leading-relaxed resize-none"
                                placeholder="Resume text will appear here automatically after upload..."
                                value={resumeText}
                                onChange={(e) => setResumeText(e.target.value)}
                            />
                        </div>

                        {/* NEW: Pre-Fill Button */}
                        <Button 
                            onClick={handleAutoFill} 
                            disabled={isLoading || isExtracting || (!resumeText && !linkedinUrl)}
                            variant="secondary"
                            className="w-full border border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/20"
                        >
                             ✨ Auto-Fill Parameters from Resume
                        </Button>
                    </div>
                </div>

                {/* RIGHT COLUMN: Explicit Overrides */}
                <div className="space-y-6">
                    <label className="text-sm font-bold text-emerald-400 uppercase tracking-wider block">
                       Step 2: Mission Parameters
                    </label>

                    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                        <h3 className="text-sm font-semibold text-white mb-2">Target Lock 🎯</h3>
                        
                        <Input
                            label="Target Roles"
                            placeholder="e.g. Senior Product Manager, VP of Engineering, Staff Engineer"
                            value={roles}
                            onChange={(e) => setRoles(e.target.value)}
                            className="bg-slate-900"
                        />
                        <p className="text-xs text-slate-500 -mt-2">Specific job titles you want to find.</p>

                        <Input
                            label="Locations"
                            placeholder="e.g. Remote, New York, London, Berlin (Hybrid)"
                            value={locations}
                            onChange={(e) => setLocations(e.target.value)}
                            className="bg-slate-900"
                        />
                        <p className="text-xs text-slate-500 -mt-2">Where should we look?</p>

                        <div className="space-y-1 w-full">
                           <label className="text-sm font-medium text-slate-300 block">Search Lookback Period</label>
                           <select 
                              value={lookback} 
                              onChange={(e) => setLookback(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                           >
                              <option value="1d">Last 24 Hours (Fresh)</option>
                              <option value="3d">Last 3 Days</option>
                              <option value="7d">Last 7 Days (Weekly)</option>
                              <option value="14d">Last 14 Days (Standard)</option>
                              <option value="30d">Last 30 Days (Wide Net)</option>
                           </select>
                           <p className="text-xs text-slate-500">Only find jobs posted within this time.</p>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                        <h3 className="text-sm font-semibold text-white mb-2">Refinement ⚡</h3>
                        
                        <Input
                            label="Target Industries"
                            placeholder="e.g. Fintech, AI/ML, HealthTech, B2B SaaS"
                            value={industries}
                            onChange={(e) => setIndustries(e.target.value)}
                            className="bg-slate-900"
                        />
                        
                        <Input
                            label="Priority Skills / Keywords"
                            placeholder="e.g. React, Python, Growth, Go-to-Market"
                            value={skills}
                            onChange={(e) => setSkills(e.target.value)}
                            className="bg-slate-900"
                        />

                        <Input
                            label="Red Lines / Exclusions"
                            placeholder="e.g. Crypto, Gambling, Agency, Unpaid"
                            value={avoid}
                            onChange={(e) => setAvoid(e.target.value)}
                            className="bg-slate-900 border-red-900/50 focus:ring-red-500"
                        />
                    </div>
                </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg text-red-300 text-sm">
                <div className="flex items-center gap-2 font-bold mb-2">
                    <span>⚠️</span> Error
                </div>
                <p>{error}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-700 flex gap-4">
              <Button 
                onClick={handleSubmit} 
                isLoading={isLoading} 
                disabled={isExtracting}
                className={`w-full h-14 text-lg font-bold border-0 shadow-lg ${
                    isFastTrackReady 
                        ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/50' 
                        : 'bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 shadow-indigo-900/50'
                }`}
              >
                {isLoading ? 'Processing...' : (
                    isFastTrackReady 
                        ? 'Save & Launch System (Instant ⚡)' 
                        : 'Analyze Profile & Initialize (Using AI)'
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};