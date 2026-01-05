import { generateScoringJSON } from "./ai";
import { RawSignal, extractCompanyFromUrl } from './discovery';

export interface ScoreBreakdown {
    role_fit: number;
    location_fit: number;
    experience_fit: number;
    domain_fit: number;
}

export interface ScoredLead extends RawSignal {
    score: number;
    breakdown: ScoreBreakdown;
    company_name: string;
    role_title: string;
    reasoning: string[];
    red_flags: string[];
    status: 'new' | 'approved' | 'rejected' | 'maybe';
    decision: string;
    days_since_posted?: number;
    salary?: string;
    urgency_score: number;
    urgency_signals: string[];
    pros: string[];
    cons: string[];
    matched_skills?: string[]; // NEW: Skills that matched job requirements
    missing_skills?: string[]; // NEW: Skills required but user doesn't have
}

const extractUrgencySignals = (snippet: string, title: string) => {
    const urgency = { score: 0, signals: [] as string[] };
    const text = (snippet + " " + title).toLowerCase();

    // V2 Patterns
    const patterns = [
        { regex: /\b(urgent|immediate|asap|quickly)\b/i, score: 20, label: "🔥 Urgent" },
        { regex: /\bhiring now\b/i, score: 15, label: "⚡ Active" },
        { regex: /\bclosing (soon|friday|this week)\b/i, score: 15, label: "⏳ Closing Soon" },
        { regex: /\bjust posted\b/i, score: 5, label: "✨ Fresh" },
        { regex: /\bfew applicants\b/i, score: 10, label: "📉 Low Competition" }
    ];

    patterns.forEach(p => {
        if (p.regex.test(text)) {
            urgency.score += p.score;
            if (!urgency.signals.includes(p.label)) urgency.signals.push(p.label);
        }
    });

    return { score: Math.min(urgency.score, 30), signals: urgency.signals };
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

export const scoreSignals = async (signals: RawSignal[], userConfig: any, onProgress?: (msg: string) => void): Promise<ScoredLead[]> => {
    if (signals.length === 0) return [];

    const JOBS_PER_PROMPT = 15; // Slightly reduced for better accuracy
    const chunks = [];
    for (let i = 0; i < signals.length; i += JOBS_PER_PROMPT) chunks.push(signals.slice(i, i + JOBS_PER_PROMPT));

    const results: ScoredLead[] = [];
    let processedChunks = 0;

    const processChunk = async (chunk: RawSignal[]): Promise<ScoredLead[]> => {
        const jobsList = chunk.map(s => `ID: ${s.id} | TITLE: ${s.title} | LINK: ${s.url} | SNIPPET: ${s.snippet.slice(0, 600)}`).join('\n\n');

        const prompt = `
      ACT AS: Ruthless Senior Technical Recruiter.
      
      CANDIDATE PROFILE:
      - Bio: ${userConfig.professional_bio || "Not provided"}
      - Seniority Level: ${userConfig.seniority_level || "Unknown"}
      - Skills: ${userConfig.skills?.join(', ') || "Unknown"}

      CANDIDATE TARGET:
      - EXACT Roles Wanted: ${userConfig.target_roles.join(', ')}
      - Locations: ${userConfig.locations.join(', ')}
      - Industries: ${userConfig.industries?.join(', ') || "Any"}
      - Red Lines (Immediate Disqualifiers): ${userConfig.avoid_keywords?.join(', ') || "None"}
      
      JOBS TO EVALUATE:
      ${jobsList}
      
      TASK: Analyze each job. Return JSON array "results".
      
      STRICT GATEKEEPING RULES:
      1. ROLE MISMATCH HANDLING:
         - Use the Candidate's Seniority Level to judge matches.
         - SENIORITY TOLERANCE: Accept roles +/- 1 level from candidate's seniority.
           * If Candidate is "Senior", accept "Senior", "Staff", and "Lead" roles.
           * If Candidate is "Staff", accept "Senior", "Staff", and "Principal" roles.
           * If Candidate is "Junior", a "Senior" role is a SOFT MISMATCH (not hard reject).
         - For SOFT MISMATCH (close but not exact), set is_role_match = true BUT apply -30 penalty to match_score.
         - For HARD MISMATCH (completely different role type), set is_role_match = false.
      
      2. LOCATION MISMATCH = IMMEDIATE REJECT (NON-NEGOTIABLE).
         - If User wants specific locations (e.g. "India") and Job Snippet indicates a different location (e.g. "Germany", "Berlin", "US Only"), MATCH_SCORE must be 0.
         - Do NOT assume "Remote" implies "Worldwide" unless explicitly stated.
         - If job is "Hybrid", it MUST match one of the User's specific locations.
      
      3. RED LINE VIOLATION = IMMEDIATE REJECT.
         - If snippet contains "AVOID" keyword, MATCH_SCORE < 10.
      
      4. INDUSTRY MISMATCH: If user specified Industries, and job is clearly outside (e.g. Healthcare job when user wants Fintech), penalty -20 points.
      
      5. SKILLS ANALYSIS (NEW):
         - Compare job requirements against candidate skills.
         - List which candidate skills match the job requirements.
         - List which job requirements the candidate is missing.
      
      OUTPUT SCHEMA:
      {
        "id": "string",
        "is_role_match": boolean, 
        "is_soft_mismatch": boolean, // TRUE if role is close but not exact (for Maybe section)
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
        "matched_skills": ["string"], // Skills candidate has that job wants
        "missing_skills": ["string"], // Skills job requires that candidate lacks
        "pros": ["string"],
        "cons": ["string"],
        "decision": "APPROVE" | "MAYBE" | "REJECT"
      }
      `;

        try {
            const data = await generateScoringJSON(prompt);
            const resultArray = data.results || data || [];

            return chunk.map(signal => {
                const analysis = Array.isArray(resultArray) ? resultArray.find((r: any) => r.id === signal.id) : {};
                const urgency = extractUrgencySignals(signal.snippet, signal.title);
                const daysOld = calculateDaysSincePosted(signal.timestamp);

                const isRoleMatch = analysis?.is_role_match !== false;
                const isSoftMismatch = analysis?.is_soft_mismatch === true;

                // IMPROVED: Instead of forcing to 0, apply penalty for soft mismatches
                let finalScore = analysis?.match_score || 0;
                if (!isRoleMatch) {
                    // Hard mismatch - apply -30 penalty instead of forcing to 0
                    finalScore = Math.max(0, finalScore - 30);
                }

                // Ensure default breakdown
                const breakdown = analysis?.components || { role_fit: 0, location_fit: 0, experience_fit: 0, domain_fit: 0 };

                // Determine status: approved (70+), maybe (20-69 with soft mismatch or close), new, rejected
                let status: 'new' | 'approved' | 'rejected' | 'maybe' = 'new';
                if (finalScore >= 70) {
                    status = 'approved';
                } else if (finalScore >= 40 && finalScore < 70 && isSoftMismatch) {
                    status = 'maybe';
                } else if (finalScore >= 20 && finalScore < 40) {
                    status = 'maybe';
                } else if (finalScore < 20 && !isRoleMatch) {
                    status = 'rejected';
                }

                return {
                    ...signal,
                    score: finalScore,
                    breakdown: breakdown,
                    company_name: analysis?.company_name || extractCompanyFromUrl(signal.url) || "Unknown",
                    role_title: analysis?.role_title || signal.title,
                    reasoning: [],
                    pros: analysis?.pros || [],
                    cons: analysis?.cons || [],
                    red_flags: [],
                    decision: analysis?.decision || (isRoleMatch ? "REVIEW" : "REJECT_MISMATCH"),
                    salary: analysis?.salary || "Not disclosed",
                    days_since_posted: daysOld,
                    urgency_score: urgency.score,
                    urgency_signals: urgency.signals,
                    matched_skills: analysis?.matched_skills || [],
                    missing_skills: analysis?.missing_skills || [],
                    status: status
                };
            });
        } catch (e) {
            console.error("Chunk Error", e);
            return chunk.map(s => ({ ...s, score: 0, breakdown: { role_fit: 0, location_fit: 0, experience_fit: 0, domain_fit: 0 }, company_name: "Error", role_title: s.title, reasoning: [], pros: [], cons: [], red_flags: [], decision: "ERROR", salary: "", urgency_score: 0, urgency_signals: [], matched_skills: [], missing_skills: [], status: 'new' as const }));
        }
    };

    const queue = [...chunks];
    const activeWorkers = [];
    const next = async (): Promise<void> => {
        if (queue.length === 0) return;
        const chunk = queue.shift();
        if (!chunk) return;
        const res = await processChunk(chunk);
        results.push(...res);
        processedChunks++;
        if (onProgress) onProgress(`Scoring Batch ${processedChunks}/${chunks.length}...`);
        await next();
    };

    // ... (existing parallel scoring loop)

    for (let i = 0; i < 5; i++) activeWorkers.push(next());
    await Promise.all(activeWorkers);

    // SORT PRELIMINARY RESULTS
    const scoredResults = results.sort((a, b) => b.score - a.score);

    // (m) COMPERATIVE RANKING PASS (NEW)
    // If we have enough high-quality leads, let's ask the AI to force-rank the Top 5
    // to break ties and ensure "Best Fit" is truly at the top.
    const topCandidates = scoredResults.filter(l => l.score >= 70).slice(0, 5);

    if (topCandidates.length >= 2) {
        if (onProgress) onProgress("AI Comparative Ranking of Top Candidates...");
        const rankingPrompt = `
         TASK: Rank these ${topCandidates.length} job candidates for a ${userConfig.seniority_level} ${userConfig.target_roles[0]}.
         
         CANDIDATE SKILLS: ${userConfig.skills?.join(', ')}
         
         JOBS:
         ${topCandidates.map((c, i) => `[${i}] ${c.role_title} at ${c.company_name} (Score: ${c.score}) - ${c.snippet.slice(0, 200)}`).join('\n')}
         
         OUTPUT: JSON array of INDICES sorted by best fit. Example: [2, 0, 1].
         `;

        try {
            const rankingJson = await generateScoringJSON(rankingPrompt);
            const rankedIndices: number[] = rankingJson.indices || rankingJson || [];

            if (Array.isArray(rankedIndices) && rankedIndices.length === topCandidates.length) {
                // boost scores slightly based on rank to influence sort order
                rankedIndices.forEach((originalIndex, rankPosition) => {
                    const candidate = topCandidates[originalIndex];
                    if (candidate) {
                        // #1 gets +5, #2 gets +4, etc.
                        candidate.score += (5 - rankPosition);
                        candidate.reasoning.push(`AI Rank #${rankPosition + 1} adjustment.`);
                    }
                });
                // Re-sort main list with boosted scores
                scoredResults.sort((a, b) => b.score - a.score);
            }
        } catch (e) {
            console.warn("Ranking pass failed, sticking to individual scores", e);
        }
    }

    return scoredResults;
};