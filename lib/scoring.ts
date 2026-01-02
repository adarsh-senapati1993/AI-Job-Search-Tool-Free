import { generateScoringJSON } from "./ai";
import { RawSignal, extractCompanyFromUrl } from './discovery';

export interface ScoreBreakdown {
    role: number;
    domain: number;
    location: number;
    experience: number;
    stage: number;
}

export interface ScoredLead extends RawSignal {
  score: number;
  breakdown: ScoreBreakdown;
  company_name: string;
  role_title: string;
  reasoning: string[];
  red_flags: string[];
  status: 'new' | 'approved' | 'rejected';
  decision: string;
  days_since_posted?: number;
  salary?: string;
  urgency_score: number;
  urgency_signals: string[];
  pros: string[]; 
  cons: string[]; 
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

const calculateDaysSincePosted = (dateStr?: string): number => {
    if (!dateStr) return 0;
    const lower = dateStr.toLowerCase();
    if (lower.includes('hour') || lower.includes('minute')) return 0;
    const match = lower.match(/(\d+)\s+day/);
    return match ? parseInt(match[1]) : 0;
};

export const scoreSignals = async (signals: RawSignal[], userConfig: any, onProgress?: (msg: string) => void): Promise<ScoredLead[]> => {
  if (signals.length === 0) return [];

  // Optimized Batch Size
  const JOBS_PER_PROMPT = 20; 
  const chunks = [];
  for (let i = 0; i < signals.length; i += JOBS_PER_PROMPT) chunks.push(signals.slice(i, i + JOBS_PER_PROMPT));

  const results: ScoredLead[] = [];
  let processedChunks = 0;

  const processChunk = async (chunk: RawSignal[]): Promise<ScoredLead[]> => {
      const jobsList = chunk.map(s => `ID: ${s.id} | TITLE: ${s.title} | LINK: ${s.url} | SNIPPET: ${s.snippet.slice(0, 600)}`).join('\n\n');

      const prompt = `
      ACT AS: Strict Technical Recruiter.
      CANDIDATE: Roles: ${userConfig.target_roles.join(', ')} | Locs: ${userConfig.locations.join(', ')} | Skills: ${userConfig.skills?.slice(0,8).join(', ')}
      
      JOBS:
      ${jobsList}
      
      TASK: Analyze each job. Return JSON array "results".
      
      RULES:
      1. STRICT ROLE MATCH: If title does NOT match Target Roles (e.g. "Product Owner" != "Product Manager"), set "is_role_match": false.
      2. SALARY: Extract if present. Format: "USD 150k-200k" or "Not disclosed".
      3. SCORE: 0-100. Be critical.
      
      SCHEMA:
      {
        "id": "string",
        "is_role_match": boolean,
        "match_score": number,
        "company_name": "string",
        "role_title": "string",
        "salary": "string",
        "pros": ["string"],
        "cons": ["string"],
        "decision": "APPROVE" | "REJECT"
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
              const finalScore = isRoleMatch ? (analysis?.match_score || 0) : 0;

              return {
                  ...signal,
                  score: finalScore,
                  breakdown: { role:0, location:0, experience:0, domain:0, stage:0 },
                  company_name: analysis?.company_name || extractCompanyFromUrl(signal.url) || "Unknown",
                  role_title: analysis?.role_title || signal.title,
                  reasoning: [],
                  pros: analysis?.pros || [],
                  cons: analysis?.cons || [],
                  red_flags: [],
                  decision: isRoleMatch ? "REVIEW" : "REJECT_MISMATCH",
                  salary: analysis?.salary || "Not disclosed",
                  days_since_posted: daysOld,
                  urgency_score: urgency.score,
                  urgency_signals: urgency.signals,
                  status: finalScore >= 70 ? 'approved' : 'new'
              };
          });
      } catch (e) {
          console.error("Chunk Error", e);
          return chunk.map(s => ({ ...s, score: 0, breakdown: { role:0, location:0, experience:0, domain:0, stage:0 }, company_name: "Error", role_title: s.title, reasoning: [], pros:[], cons:[], red_flags:[], decision:"ERROR", salary:"", urgency_score:0, urgency_signals:[], status:'new' }));
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

  for (let i = 0; i < 5; i++) activeWorkers.push(next());
  await Promise.all(activeWorkers);

  return results.sort((a, b) => b.score - a.score);
};