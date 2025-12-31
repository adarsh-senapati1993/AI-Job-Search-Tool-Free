import { generateScoringJSON } from "./ai";
import { RawSignal } from './discovery';

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
  why_you_match?: string;
  outreach_hook?: string;
}

const extractUrgencySignals = (snippet: string) => {
    const urgency = { score: 0, signals: [] as string[] };
    const lower = snippet.toLowerCase();
    
    if (lower.match(/\b(urgent|immediate|asap|hiring now|start date)\b/)) {
        urgency.score += 20;
        urgency.signals.push("🔥 Urgent Hire");
    }
    if (lower.match(/\b(just posted|newly listed|fresh|today)\b/)) {
        urgency.score += 10;
        urgency.signals.push("✨ Just Posted");
    }
    return urgency;
};

// DETERMINISTIC COMPANY EXTRACTION FROM URL
// Solves the "Not Specified" hallucination problem by looking at the domain/path first.
export const extractCompanyFromUrl = (url: string): string | null => {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const path = u.pathname;

        // 1. ATS Systems (High Confidence)
        // boards.greenhouse.io/airbnb/...
        if (host.includes('greenhouse.io') || host.includes('lever.co') || host.includes('ashbyhq.com') || host.includes('workable.com')) {
            const parts = path.split('/').filter(p => p);
            if (parts.length > 0) return capitalize(parts[0]);
        }
        
        // 2. Subdomains (careers.stripe.com)
        if (host.startsWith('careers.') || host.startsWith('jobs.') || host.startsWith('join.')) {
            const parts = host.split('.');
            if (parts.length >= 3) return capitalize(parts[1]); 
        }
        
        // 3. Workday (stripe.myworkdayjobs.com)
        if (host.includes('myworkdayjobs.com')) {
            const company = host.split('.')[0];
            return capitalize(company);
        }

        return null;
    } catch (e) {
        return null;
    }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Helper to split array into chunks
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

export const scoreSignals = async (signals: RawSignal[], userConfig: any): Promise<ScoredLead[]> => {
  if (signals.length === 0) return [];

  // BATCH PROCESSING ENGINE
  const BATCH_SIZE = 5;
  const batches = chunkArray(signals, BATCH_SIZE);
  const results: ScoredLead[] = [];

  const processBatch = async (batch: RawSignal[]): Promise<ScoredLead[]> => {
    // Pre-calculate companies to help the AI
    const batchWithContext = batch.map(s => {
        const extracted = extractCompanyFromUrl(s.url);
        return {
            ...s,
            extractedCompany: extracted
        };
    });

    const jobsList = batchWithContext.map((s) => `[ID: ${s.id}]
    Snippet: ${s.snippet.slice(0, 400)}
    URL: ${s.url}
    ${s.extractedCompany ? `Host/Company: ${s.extractedCompany}` : ''}`).join('\n\n');

    const prompt = `
    BATCH JOB SCORING TASK.
    
    CANDIDATE PROFILE:
    - Bio: ${userConfig.professional_bio || "N/A"}
    - Target Roles: ${userConfig.target_roles.join(', ')}
    - Locations: ${userConfig.locations.join(', ')}
    - Seniority: ${userConfig.seniority_level}
    - Avoid: ${userConfig.avoid_keywords.join(', ')}
    
    JOBS TO ANALYZE:
    ${jobsList}
    
    INSTRUCTIONS:
    Analyze each job against the profile.
    Return a JSON ARRAY of objects (one for each ID).
    
    SCORING RUBRIC (Max 100):
    1. Role Match (30): 0 if totally unrelated.
    2. Location Match (20): 0 if mismatch.
    3. Seniority (20): 0 if too junior/senior.
    4. Skills/Domain (30): Bio fit.
    
    OUTPUT SCHEMA per item:
    {
      "id": "must match input ID",
      "match_score": number (0-100),
      "company_name": "extracted name (prioritize URL/Host if available)",
      "role_title": "extracted",
      "decision": "APPROVE" (>70) or "REJECT",
      "reasoning": "Short 1 sentence why",
      "salary": "extracted or 'Not disclosed'",
      "why_you_match": "1 sentence on why the candidate fits specifically",
      "outreach_hook": "1 specific business pain point to mention in an email"
    }
    `;

    try {
      const response = await generateScoringJSON(prompt);
      const dataArray = Array.isArray(response) ? response : [response];
      
      return batchWithContext.map(signal => {
          const analysis = dataArray.find((d: any) => d.id === signal.id) || {};
          const score = analysis.match_score || 0;
          const urgency = extractUrgencySignals(signal.snippet);
          
          // Fallback: If AI fails to find company, use our extracted one, or 'Not specified'
          let finalCompany = analysis.company_name;
          if ((!finalCompany || finalCompany.toLowerCase() === 'not specified' || finalCompany.toLowerCase() === 'unknown') && signal.extractedCompany) {
              finalCompany = signal.extractedCompany;
          }
          if (!finalCompany) finalCompany = "Not specified";

          return {
              ...signal,
              score: score,
              breakdown: { role: 0, location: 0, experience: 0, domain: 0, stage: 0 },
              company_name: finalCompany,
              role_title: analysis.role_title || "Unknown Role",
              reasoning: analysis.reasoning ? [analysis.reasoning] : [],
              why_you_match: analysis.why_you_match,
              outreach_hook: analysis.outreach_hook,
              red_flags: [],
              decision: analysis.decision || "REVIEW",
              days_since_posted: 0,
              salary: analysis.salary || "Not disclosed",
              urgency_score: urgency.score,
              urgency_signals: urgency.signals,
              status: score >= 75 ? 'approved' : 'new'
          };
      });

    } catch (error) {
      console.error("Batch Scoring Failed:", error);
      return batch.map(s => ({ 
          ...s, 
          score: 0, 
          breakdown: { role:0, location:0, experience:0, domain:0, stage:0 },
          company_name: extractCompanyFromUrl(s.url) || "Error", 
          role_title: "Error", 
          reasoning: ["Scoring failed"], 
          red_flags: [], 
          status: 'new',
          decision: "ERROR",
          urgency_score: 0,
          urgency_signals: []
      }));
    }
  };

  for (let i = 0; i < batches.length; i++) {
      const batchRes = await processBatch(batches[i]);
      results.push(...batchRes);
      await new Promise(r => setTimeout(r, 200));
  }
  
  return results.sort((a, b) => b.score - a.score);
};