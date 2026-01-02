import { getActiveLLM } from "./llm";

export interface CandidateProfile {
  professional_bio: string; 
  target_roles: string[];
  seniority_level: string;
  locations: string[];
  expanded_locations?: string[]; // NEW: AI-generated synonyms
  skills: string[];
  industries: string[];
  avoid_keywords: string[];
  achievements: string[];
  search_lookback?: string; 
  search_depth?: 'standard' | 'deep' | 'comprehensive'; 
  regional_boards?: string[]; 
}

export interface ExplicitConstraints {
    roles?: string;
    locations?: string;
    industries?: string;
    skills?: string;
    avoid?: string;
}

export interface ProfileInputs {
  text?: string;
  linkedinUrl?: string;
  files?: { mimeType: string; data: string }[];
}

export interface OutreachDrafts {
  linkedin_dm: string;
  email_subject: string;
  email_body: string;
}

export interface HiringManagerContext {
    name?: string;
    linkedinUrl?: string;
    context?: string; 
}

export const parseCandidateProfile = async (
    apiKey: string, 
    inputs: ProfileInputs, 
    constraints: ExplicitConstraints
): Promise<CandidateProfile> => {
    
    const llm = getActiveLLM();
    const content = inputs.text ? inputs.text.slice(0, 15000) : ""; // Truncate to avoid context limits

    // OPTIMIZATION: Use 'sonar' (fast) instead of 'sonar-reasoning' (slow). 
    // Resume extraction is a standard extraction task, not deep reasoning.
    
    const prompt = `
    TASK: Comprehensive Candidate Profile Analysis.
    RESUME CONTENT: ${content}
    USER OVERRIDES: ${JSON.stringify(constraints)}

    INSTRUCTIONS:
    1. ANALYZE SENIORITY: STRICTLY determine seniority (Junior, Senior, Staff, Principal, VP, C-Level) based on years of experience and scope.
    2. GENERATE "AI PROFILE ANALYSIS": Write a rich, 3rd-person executive assessment (approx 80-100 words).
       - Structure it as: "[Name/Candidate] is a [Seniority] [Role] with deep expertise in [Domains]. Their core strength is [Superpower]. They have demonstrated impact in [Achievement Area]."
       - STRICTLY NO HALLUCINATIONS. If a specific detail (like years of exp) is not in the text, do not invent it. Use "Not specified" if unsure.
       - Use the candidate's actual name if found in the text.
    3. EXTRACT ACHIEVEMENTS: List top 3 specific quantitative achievements found in the text.
    4. APPLY OVERRIDES: If user provided constraints, they overwrite your inference.
    
    OUTPUT JSON SCHEMA ONLY:
    {
      "professional_bio": "string", // The rich assessment
      "target_roles": ["string"],
      "seniority_level": "string",
      "locations": ["string"],
      "skills": ["string"],
      "industries": ["string"],
      "avoid_keywords": ["string"],
      "achievements": ["string"]
    }
    `;

    return await llm.generateJSON(prompt, "sonar"); 
};

// NEW: Dynamic Location Expansion
export const expandLocations = async (apiKey: string, locations: string[]): Promise<string[]> => {
    if (!locations || locations.length === 0) return [];
    
    const llm = getActiveLLM();
    const locStr = locations.join(', ');

    const prompt = `
    TASK: Generate a "Search Expansion Pack" for these job locations: "${locStr}".
    
    GOAL: We need to find jobs in these regions, even if the job post uses a different term (e.g. "SF" instead of "San Francisco", or "Tokyo" instead of "Japan", or "Deutschland" instead of "Germany").

    RULES:
    1. For Countries (e.g. "Japan", "Germany"): Return the Country Name, Native Spelling (e.g. "Deutschland", "日本"), and TOP 3 Tech Hub Cities in that country (e.g. "Tokyo", "Berlin").
    2. For Cities (e.g. "New York"): Return the full name and common abbreviations (e.g. "NYC", "Manhattan").
    3. For Acronyms (e.g. "UAE", "UK"): Expand them.
    4. DO NOT add generic terms like "Remote" unless explicitly asked.
    
    OUTPUT: A single flat JSON array of unique strings.
    Example Input: ["Japan", "NYC"]
    Example Output: ["Japan", "JP", "日本", "Tokyo", "Osaka", "New York City", "NYC", "Manhattan"]
    `;

    try {
        const data = await llm.generateJSON(prompt, "sonar");
        if (Array.isArray(data)) {
            // Deduplicate and clean
            return [...new Set(data.filter(d => typeof d === 'string' && d.length > 0))];
        }
        return locations;
    } catch (e) {
        console.warn("Location Expansion Failed", e);
        return locations; // Fallback to originals
    }
};

export const identifyRegionalBoards = async (apiKey: string, locations: string[], industries: string[]): Promise<string[]> => {
    const llm = getActiveLLM();
    const locStr = locations.join(', ');
    const indStr = industries.join(', ');
    
    const prompt = `
    TASK: Identify top 8-12 high-signal regional job domains for:
    Location: ${locStr}
    Industry: ${indStr}

    IMPORTANT:
    - We need BOTH "Job Boards" (e.g. naukri.com, seek.com.au) AND "Popular ATS/HR Tech" used in this specific region (e.g. personio.de, breezy.hr, etc).
    - If the location is non-US (e.g. India, Germany, HK), prioritize local ATS domains that might not be in the global list.

    RULES:
    1. Return ONLY the root domain (e.g., "naukri.com", "jobsdb.com", "personio.de").
    2. EXCLUDE global giants: linkedin.com, indeed.com, glassdoor.com, google.com.
    3. EXCLUDE freelancing sites (upwork, fiverr).
    4. Focus on sites popular for full-time professional/tech roles in that specific region.

    OUTPUT JSON ARRAY OF STRINGS ONLY:
    ["domain1.com", "domain2.com"]
    `;

    try {
        const data = await llm.generateJSON(prompt, "sonar");
        if (Array.isArray(data)) {
            return data
                .filter(d => typeof d === 'string')
                .map(d => d.toLowerCase().replace('www.', '').replace('https://', '').replace('http://', '').split('/')[0])
                .filter(d => !d.includes('linkedin.com') && !d.includes('indeed') && !d.includes('glassdoor'));
        }
        return [];
    } catch (e) {
        console.warn("Regional Board Discovery Failed", e);
        return [];
    }
};

export const refineConfiguration = async (currentConfig: any, instruction: string): Promise<any> => {
    const llm = getActiveLLM();
    const prompt = `
    Config: ${JSON.stringify(currentConfig)}
    User Request: "${instruction}"
    
    ACTION: Update the Config JSON based on the User Request.
    IMPORTANT: You must PRESERVE all other fields exactly as they are unless explicitly asked to change them. Do not drop keys like 'search_depth' or 'professional_bio' or 'expanded_locations'.
    
    Return ONLY the updated JSON.
    `;
    return await llm.generateJSON(prompt, "sonar");
};

export const generateOutreachDrafts = async (
    apiKey: string,
    userConfig: CandidateProfile,
    lead: any,
    hmContext?: HiringManagerContext
): Promise<OutreachDrafts> => {
    const llm = getActiveLLM();
    const proof = userConfig.achievements?.slice(0,3).join('; ') || "";
    
    const prompt = `
    TASK: Draft Outreach (Cold Email + LinkedIn).
    CANDIDATE: ${userConfig.professional_bio}
    JOB: ${lead.role_title} @ ${lead.company_name}
    RECIPIENT: ${hmContext?.name || "Hiring Manager"}

    GUIDELINES:
    - High-impact, low-fluff.
    - Mention 1 specific achievement: ${proof}
    - Hook: ${lead.pros?.[0] || "Your open role"}
    
    OUTPUT JSON:
    {
      "linkedin_dm": "string",
      "email_subject": "string",
      "email_body": "string"
    }
    `;

    return await llm.generateJSON(prompt, "sonar-pro");
};

export const chatWithAI = async (message: string, history: any[], systemInstruction: string): Promise<string> => {
    const llm = getActiveLLM();
    const messages = history.map((h: any) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts ? h.parts[0].text : h.text 
    }));
    messages.push({ role: 'user', content: message });
    return await llm.generateText(messages, systemInstruction, "sonar-reasoning-pro");
};

export const generateScoringJSON = async (prompt: string): Promise<any> => {
    const llm = getActiveLLM();
    return await llm.generateJSON(prompt, "sonar");
}