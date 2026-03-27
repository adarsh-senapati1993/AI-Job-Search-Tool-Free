import { generateScoringJSON } from "./ai";
import type { CompanyNewsSnippet, CandidateProfile } from "./ai";
import { RawSignal, extractCompanyFromUrl } from './discovery';
import { getKey, STORAGE_KEYS } from "./storage";
import pLimit from 'p-limit';
import { logErrorToStorage } from './api-utils';

const extractLocationFallback = (title: string, userLocations: string[]): string | undefined => {
    if (!userLocations || userLocations.length === 0) return undefined;
    const lowerTitle = title.toLowerCase();
    for (const loc of userLocations) {
        const lowerLoc = loc.toLowerCase();
        if (lowerTitle.includes(lowerLoc)) return loc;
        // Extra resilience for India if present in title
        if (lowerTitle.includes('india')) return 'India';
        // Common aliases
        if (lowerTitle.includes('bangalore') && lowerLoc.includes('bengaluru')) return 'Bengaluru';
        if (lowerTitle.includes('bengaluru') && lowerLoc.includes('bangalore')) return 'Bangalore';
    }
    return undefined;
};

export interface ScoreBreakdown {
    role_fit: number;
    location_fit: number;
    experience_fit: number;
    domain_fit: number;
}

export interface LocationData {
    city?: string;
    region?: string;
    country?: string;
    is_remote?: boolean;
    raw?: string;
}

export interface ScoredLead extends RawSignal {
    score: number;
    breakdown: ScoreBreakdown;
    company_name: string;
    role_title: string;
    inferred_location: string | LocationData;
    reasoning: string[];
    red_flags: string[];
    status: 'new' | 'approved' | 'rejected' | 'maybe' | 'failed';
    decision: string;
    days_since_posted?: number | null;
    salary?: string;
    urgency_score: number;
    urgency_signals: string[];
    is_local_fallback?: boolean; // Flag to indicate if LLM was bypassed
    pros: string[];
    cons: string[];
    matched_skills?: string[]; // NEW: Skills that matched job requirements
    missing_skills?: string[]; // NEW: Skills required but user doesn't have
    company_news?: CompanyNewsSnippet; // Company news enrichment
}

const extractUrgencySignals = (snippet: string, title: string) => {
    const urgency = { score: 0, signals: [] as string[] };
    const text = (snippet + " " + title).toLowerCase();

    // V3 Patterns — Boosted weights for dead link mitigation
    const patterns = [
        { regex: /\b(urgent|immediate|asap|quickly)\b/i, score: 25, label: "🔥 Urgent" },
        { regex: /\bhiring now\b/i, score: 20, label: "⚡ Active" },
        { regex: /\bclosing (soon|friday|this week)\b/i, score: 20, label: "⏳ Closing Soon" },
        { regex: /\bjust posted\b/i, score: 15, label: "✨ Fresh" },
        { regex: /\bfew applicants\b/i, score: 15, label: "📉 Low Competition" },
        { regex: /\btoday\b/i, score: 10, label: "📅 Posted Today" },
    ];

    patterns.forEach(p => {
        if (p.regex.test(text)) {
            urgency.score += p.score;
            if (!urgency.signals.includes(p.label)) urgency.signals.push(p.label);
        }
    });

    return { score: Math.min(urgency.score, 40), signals: urgency.signals };
};

// IMPROVED: Enhanced recency parsing for weeks/months
const calculateDaysSincePosted = (dateStr?: string): number => {
    if (!dateStr) return 0;
    const lower = dateStr.toLowerCase();
    if (lower.includes('hour') || lower.includes('minute') || lower.includes('just now')) return 0;

    // Parse days
    const dayMatch = lower.match(/(\d+)\s*day/);
    if (dayMatch) return parseInt(dayMatch[1]);

    // Parse weeks
    const weekMatch = lower.match(/(\d+)\s*week/);
    if (weekMatch) return parseInt(weekMatch[1]) * 7;

    // Parse months
    const monthMatch = lower.match(/(\d+)\s*month/);
    if (monthMatch) return parseInt(monthMatch[1]) * 30;

    return 0;
};

export const scoreSignals = async (
    signals: RawSignal[],
    userConfig: CandidateProfile,
    onProgress?: (msg: string) => void,
    onChunkScored?: (chunk: ScoredLead[]) => void,
    baseConcurrency = 8
): Promise<ScoredLead[]> => {
    if (signals.length === 0) return [];

    const provider = getKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER) || 'perplexity';
    let safeConcurrency = baseConcurrency;
    let pacingDelayMs = 1000;
    
    if (provider === 'gemini') {
        safeConcurrency = 1; // 1 concurrent request protects the 15 RPM limit
        pacingDelayMs = 4000; // 4s delay = exactly 15 Requests Per Minute
    } else if (provider === 'openai') {
        safeConcurrency = 5;
        pacingDelayMs = 1000;
    } else if (provider === 'perplexity') {
        safeConcurrency = 2; 
        pacingDelayMs = 2000;
    } else if (provider === 'groq') {
        safeConcurrency = 1; // Free tier limits are tight (~14k TPM / 30 RPM) so pacing is mandatory
        pacingDelayMs = 2100; // ~28 requests per minute ensures perfect compliance without 429s
    } else {
        safeConcurrency = 3;
        pacingDelayMs = 1500;
    }
    
    // Concurrency limit: higher = faster, but beware provider rate limits.
    // Allow optional override via userConfig.scoring_concurrency.
    const configured = Number((userConfig as any)?.scoring_concurrency);
    const desired = Number.isFinite(configured) ? configured : safeConcurrency; // Use safeConcurrency as default
    const concurrency = Math.max(1, Math.min(12, desired));
    const limit = pLimit(concurrency);

    if (onProgress) onProgress(`Deep Scoring ${signals.length} high-signal leads (concurrency=${concurrency})...`);

    const results: ScoredLead[] = [];
    let completed = 0;

    const processSingleSignal = async (s: RawSignal): Promise<ScoredLead> => {
        const heuristicScore = (errorMessage?: string): ScoredLead => {
            const urgency = extractUrgencySignals(s.snippet, s.title);
            const daysOld = calculateDaysSincePosted(s.timestamp);

            const jobText = `${s.title || ''} ${s.snippet || ''}`.toLowerCase();

            const significantTokens = new Set<string>();
            (userConfig.target_roles || []).forEach(role => {
                String(role || '')
                    .toLowerCase()
                    .split(/[\s/-]+/)
                    .forEach(w => {
                        const ww = String(w || '').trim();
                        if (!ww) return;
                        if (ww.length < 3) return;
                        if (['senior', 'lead', 'junior', 'staff', 'principal', 'vp', 'director', 'manager'].includes(ww)) return;
                        significantTokens.add(ww);
                    });
            });
            const overlap = Array.from(significantTokens).some(tok => new RegExp(`\\b${tok}\\b`, 'i').test(jobText));
            const role_fit = overlap ? 30 : 10;

            // Location fit: keep strict and conservative.
            const workMode = String(userConfig.work_mode || 'any').toLowerCase();
            const userLocs = [
                ...(userConfig.expanded_locations || []),
                ...(userConfig.locations || []),
            ].filter(Boolean);

            const hasRemote = /\b(remote|work from home|wfh|distributed|virtual)\b/i.test(`${s.title} ${s.snippet} ${s.location || ''}`);
            const hasHybrid = /\bhybrid\b/i.test(`${s.title} ${s.snippet} ${s.location || ''}`);
            const hasOnsite = /\bon[-\s]?site|in[-\s]?office|in office|office based\b/i.test(`${s.title} ${s.snippet} ${s.location || ''}`);

            const locationText = `${s.location || ''} ${s.title || ''} ${s.snippet || ''}`.toLowerCase();
            const locationMatch =
                userLocs.length === 0
                    ? true
                    : userLocs.some(l => {
                        const ll = String(l || '').toLowerCase().trim();
                        if (!ll) return false;
                        if (ll.includes('remote')) return hasRemote;
                        if (ll.length === 2) return new RegExp(`\\b${ll}\\b`, 'i').test(locationText);
                        return locationText.includes(ll);
                    });

            let location_fit = 10;
            if (userLocs.length === 0) {
                location_fit = 20;
            } else if (workMode === 'remote') {
                location_fit = hasRemote ? 20 : 5;
            } else if (workMode === 'hybrid') {
                location_fit = (hasHybrid && locationMatch) ? 20 : (locationMatch ? 15 : 5);
            } else if (workMode === 'onsite') {
                location_fit = (hasOnsite && locationMatch) ? 20 : (locationMatch ? 15 : 5);
            } else {
                location_fit = locationMatch ? 20 : 5;
            }

            // Experience fit: purely test the job title to prevent false-positives from "mentor junior staff" body text
            const sl = String(userConfig.seniority_level || '').toLowerCase();
            const jobTitle = String(s.title || '').toLowerCase();
            const hasSeniorityKeyword = (() => {
                if (!sl) return true;
                if (sl.includes('junior')) return /\b(junior|associate|entry)\b/i.test(jobTitle);
                if (sl.includes('staff')) return /\b(staff|principal)\b/i.test(jobTitle) || /\bsenior\b/i.test(jobTitle);
                if (sl.includes('principal')) return /\b(principal|staff)\b/i.test(jobTitle);
                if (sl.includes('vp') || sl.includes('vice president')) return /\b(vp|vice president)\b/i.test(jobTitle);
                if (sl.includes('c-level') || sl.includes('c level') || sl.includes('chief')) return /\b(ceo|cfo|coo|cdo|cso|chief)\b/i.test(jobTitle);
                return /\b(senior|staff|lead|principal)\b/i.test(jobTitle);
            })();

            const experience_fit = hasSeniorityKeyword ? 20 : 10;

            // Domain fit: industries overlap.
            const industryTokens = (userConfig.industries || []).flatMap(ind => {
                return String(ind || '')
                    .toLowerCase()
                    .split(/[\s/-]+/)
                    .map(x => x.trim())
                    .filter(x => x.length >= 4);
            });
            const domainHit = industryTokens.length === 0 ? true : industryTokens.some(tok => jobText.includes(tok));
            const domain_fit = domainHit ? 30 : 10;

            const breakdown: ScoreBreakdown = { role_fit, location_fit, experience_fit, domain_fit };

            const avoidHit = (userConfig.avoid_keywords || []).some(k => k.trim().length > 2 && jobText.includes(k.toLowerCase().trim()));
            let score = role_fit + location_fit + experience_fit + domain_fit;
            if (avoidHit) score = Math.max(0, score - 60); // Critical 60-point penalty for mapped avoid-keywords

            const decision = score >= 70 ? 'APPROVED' : (score > 60 ? 'REVIEW' : 'FAILED');
            const status = score >= 70 ? 'approved' : 'failed';

            const inferredLocation =
                (s.location && s.location !== 'Unknown')
                    ? s.location
                    : extractLocationFallback(s.title, [
                        ...(userConfig.expanded_locations || []),
                        ...(userConfig.locations || []),
                    ]) || 'Unknown';

            const pros: string[] = [];
            if (overlap) pros.push('Role alignment detected');
            if (locationMatch) pros.push('Location/work-mode alignment detected');
            if (pros.length === 0) pros.push('Potential fit based on role/title similarity');

            const cons: string[] = [];
            const msg = String(errorMessage || '').toLowerCase();
            const raw = String(errorMessage || '');
            if (msg.includes('429')) {
                cons.push('LLM rate-limited (429). Using heuristic matching.');
            } else if (msg.includes('timeout')) {
                cons.push('LLM timed out. Using heuristic matching.');
            } else if (msg.includes('json')) {
                cons.push('LLM returned invalid JSON. Using heuristic matching.');
            } else if (msg.includes('local algorithm')) {
                cons.push('Evaluated instantly via Local CPU Rules Engine.');
            } else if (msg) {
                cons.push(`API Error: ${raw.slice(0, 60)}...`);
            } else {
                cons.push('LLM scoring unavailable. Using heuristic matching.');
            }

            return {
                ...s,
                score,
                breakdown,
                company_name: extractCompanyFromUrl(s.url) || s.company || 'Unknown',
                role_title: s.title,
                inferred_location: inferredLocation,
                reasoning: [msg.includes('local algorithm') ? `Local Algorithm computed a score of ${score}/100. Minimum required is 70.` : (errorMessage ? `Automation aborted: ${errorMessage}` : `Heuristic fallback triggered. ${cons[0]}`)],
                pros,
                cons,
                red_flags: score >= 70 ? [] : ['Algorithmic heuristic matched low score'],
                decision,
                salary: s.salary || 'Not disclosed',
                days_since_posted: daysOld,
                urgency_score: urgency.score,
                urgency_signals: urgency.signals,
                matched_skills: [],
                missing_skills: [],
                status,
                is_local_fallback: true
            };
        };

        const urgency = extractUrgencySignals(s.snippet, s.title);
        const daysOld = calculateDaysSincePosted(s.timestamp);

        const makePrompt = (snippetLimit: number) => `
      ACT AS: Ruthless Senior Technical Recruiter.
      
      CANDIDATE PROFILE:
      - Bio: ${userConfig.professional_bio || "Not provided"}
      - Seniority Level: ${userConfig.seniority_level || "Unknown"}
      - Skills: ${userConfig.skills?.join(', ') || "Unknown"}

      CANDIDATE TARGET:
      - EXACT Roles Wanted: ${userConfig.target_roles.join(', ')}
      - Locations: ${userConfig.locations.join(', ')}
      - Work Mode Preference: ${userConfig.work_mode || 'any'}${userConfig.remote_base_country ? ` (must allow working from ${userConfig.remote_base_country})` : ''}
      - Industries: ${userConfig.industries?.join(', ') || "Any"}
      - Red Lines (Immediate Disqualifiers): ${userConfig.avoid_keywords?.join(', ') || "None"}
      
      JOB TO EVALUATE:
      TITLE: ${s.title}
      COMPANY: ${s.company || 'Unknown'}
      LOCATION: ${s.location || 'Unknown'}
      LINK: ${s.url}
      SNIPPET: ${(s.clean_snippet || s.snippet).slice(0, snippetLimit)} // Truncated for focus
      
      TASK: Analyze this specific job against the candidate profile. Return exactly ONE JSON object.
      
      STRICT GATEKEEPING RULES:
      1. ROLE MISMATCH HANDLING:
         - Use the Candidate's Seniority Level to judge matches.
         - SENIORITY TOLERANCE: Accept roles +/- 1 level from candidate's seniority.
           * If Candidate is "Senior", accept "Senior", "Staff", and "Lead" roles.
           * If Candidate is "Staff", accept "Senior", "Staff", and "Principal" roles.
           * If Candidate is "Junior", a "Senior" role is a SOFT MISMATCH (not hard reject).
         - For SOFT MISMATCH (close but not exact), set is_role_match = true BUT apply -10 penalty to match_score.
         - For HARD MISMATCH (completely different role type), set is_role_match = false.
      
      2. LOCATION MISMATCH HANDLING:
         - CRITICAL: If LOCATION field says 'Unknown', you MUST attempt to INFER the job location from:
           * The job TITLE (e.g., 'Software Engineer - Remote' or 'Staff Engineer - Mumbai, Bengaluru') -> Look HERE first!
           * The company name (e.g., "Flipkart" = India, "Deutsche Bank" = Germany)
           * The URL domain (e.g., .in = India, .de = Germany, .co.uk = UK)
           * The snippet context (city names, country references, timezone mentions)
         - If User wants specific locations (e.g. "India") and Job Snippet indicates a different location (e.g. "Germany", "US Only"), apply a penalty (-15 points) to the MATCH_SCORE.
         - If location is STILL unknown after inference, cap location_fit at MAX 15/20 and add "Job location could not be verified" to cons.
         - Do NOT assume "Remote" implies "Worldwide" unless explicitly stated.
         - If job is "Hybrid" in a different location, apply a -15 penalty.
      
      3. WORK MODE RULES:
         - If Candidate wants "remote":
           * Jobs marked "Onsite" or "In-office" → apply penalty (-20)
           * If candidate has a remote_base_country (e.g. "India"), jobs that say "Remote - US only" → apply penalty (-20)
           * Jobs that say "Remote" with no geo-restriction → APPROVED (bonus +10)
         - If Candidate wants "hybrid":
           * Job MUST mention hybrid AND match location. Mismatch → apply penalty (-15)
         - If Candidate wants "onsite":
           * Only accept onsite/in-office jobs at user's locations. Mismatch → apply penalty (-20)
         - If Candidate wants "any": No work mode filtering
      
      4. RED LINE VIOLATION.
         - If snippet contains "AVOID" keyword, MATCH_SCORE <= 20.
      
      5. MINIMUM SCORE GUARANTEE:
         - Do NOT give a score of 0 unless the job is complete spam or completely unrelated. For location or mode mismatches, give a low score (10-30) and list the mismatch in "red_flags".
      
      6. INDUSTRY MISMATCH: If user specified Industries, and job is clearly outside, penalty -20 points.
      
      7. SKILLS ANALYSIS:
         - Compare job requirements against candidate skills.
         - List which candidate skills match the job requirements.
         - List which job requirements the candidate is missing.
      
      8. MANDATORY ANALYSIS:
         - You MUST provide at least 1 item in "pros" (even for bad matches, note any positive aspect).
         - You MUST provide at least 1 item in "cons" (even for perfect matches, note a minor consideration).
         - NEVER return empty arrays for pros or cons.
      
      9. COMPANY NAME EXTRACTION:
         - If company name is not obvious from the snippet, extract it from the URL (e.g., "greenhouse.io/company-name" = extract company name).
         - Never return "Unknown" for company_name if ANY context clue exists.
      
      OUTPUT SCHEMA:
      {
        "is_role_match": boolean,
        "is_soft_mismatch": boolean,
        "match_score": number, // 0-100 (Sum of components)
        "components": {
           "role_fit": number, // Max 30 points
           "location_fit": number, // Max 20 points
           "experience_fit": number, // Max 20 points
           "domain_fit": number // Max 30 points
        },
        "company_name": "string",
        "role_title": "string",
         "salary": "string",
         "inferred_location": {
            "city": "string",
            "region": "string (state/province)",
            "country": "string",
            "is_remote": boolean,
            "raw": "string (the original location string from snippet)"
         },
        "matched_skills": ["string"],
        "missing_skills": ["string"],
        "pros": ["string"],
        "cons": ["string"],
        "decision": "APPROVE" | "MAYBE" | "REJECT"
      }
      `;

        // Provider-aware prompt sizing + retry backoff.
        // Goal: maximize valid JSON parsing while reducing provider 429/timeouts.
        // Attempt exactly once per lead, avoiding 6-minute latency spirals on dead APIs.
        const snippetAttempts = [1300];

        const retryDelayBaseMs =
            provider === 'perplexity'
                ? 180
                : provider === 'gemini'
                    ? 350
                    : 250;
        let lastError: any = null;

        for (let attemptIdx = 0; attemptIdx < snippetAttempts.length; attemptIdx++) {
            try {
                // Use JSON model hint "sonar" as before for fast structured parsing
                const prompt = makePrompt(snippetAttempts[attemptIdx]);
                const analysis = await generateScoringJSON(prompt, "sonar");

                if (!analysis || typeof analysis !== 'object') {
                    throw new Error('LLM returned invalid/empty JSON');
                }

                const isRoleMatch = analysis.is_role_match !== false;
                let finalScore = typeof analysis.match_score === 'number' ? analysis.match_score : 35;

                // Hard mismatch penalty if LLM forgot to lower the score itself
                if (!isRoleMatch) {
                    finalScore = Math.max(0, finalScore - 30);
                }

                const breakdown = analysis.components || { role_fit: 10, location_fit: 8, experience_fit: 8, domain_fit: 9 };
                let status: 'new' | 'approved' = finalScore >= 70 ? 'approved' : 'new';

                const lead: ScoredLead = {
                    ...s,
                    score: finalScore,
                    breakdown: breakdown,
                    company_name: analysis.company_name || extractCompanyFromUrl(s.url) || "Unknown",
                    role_title: analysis.role_title || s.title,
                    inferred_location: analysis.inferred_location || s.location || "Unknown",
                    reasoning: [],
                    pros: Array.isArray(analysis.pros) ? analysis.pros : [],
                    cons: Array.isArray(analysis.cons) ? analysis.cons : [],
                    red_flags: [],
                    decision: analysis.decision || (isRoleMatch ? "REVIEW" : "REJECT_MISMATCH"),
                    salary: analysis.salary || s.salary || "Not disclosed",
                    days_since_posted: daysOld,
                    urgency_score: urgency.score,
                    urgency_signals: urgency.signals,
                    matched_skills: Array.isArray(analysis.matched_skills) ? analysis.matched_skills : [],
                    missing_skills: Array.isArray(analysis.missing_skills) ? analysis.missing_skills : [],
                    status: status
                };
                return lead;

            } catch (e: any) {
                lastError = e;
                const msg = String(e?.message || '').toLowerCase();
                const is429 = msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests');
                const isTimeout = msg.includes('timeout');

                logErrorToStorage(`Scoring Error (Attempt ${attemptIdx + 1}) for ${s.url}`, e);

                // Back off more aggressively on rate limits.
                const waitMultiplier = is429 ? 5 : isTimeout ? 2 : 1;

                // Wait a bit before retrying with smaller prompt.
                await new Promise(r => setTimeout(r, retryDelayBaseMs * (attemptIdx + 1) * waitMultiplier));
            }
        }

        // Both attempts failed; use conservative heuristic score.
        return heuristicScore(lastError?.message || lastError?.toString?.());
    };

    const scoringPromises = signals.map(sig =>
        limit(async () => {
            const scoredLead = await processSingleSignal(sig);
            results.push(scoredLead);
            completed++;

            // Stream the single lead directly to the UI immediately
            if (onChunkScored) {
                onChunkScored([scoredLead]);
            }

            if (onProgress && (completed % 2 === 0 || completed === signals.length)) {
                onProgress(`Scored ${completed}/${signals.length} leads...`);
            }
            
            // Proactive Pacing: enforce exact token bucket delays to bypass reactive backoffs
            await new Promise(r => setTimeout(r, pacingDelayMs));
            
            return scoredLead; // Return the scored lead for Promise.all
        })
    );

    // Wait for all concurrent scoring to finish
    await Promise.all(scoringPromises);

    // Sort the final aggregated array
    return results.sort((a, b) => b.score - a.score);
};