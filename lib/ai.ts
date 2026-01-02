import { getActiveLLM } from "./llm";

export interface CandidateProfile {
  professional_bio: string; 
  target_roles: string[];
  seniority_level: string;
  locations: string[];
  skills: string[];
  industries: string[];
  avoid_keywords: string[];
  achievements: string[];
  search_lookback?: string; 
  search_depth?: 'standard' | 'deep' | 'comprehensive'; 
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
    const content = inputs.text ? inputs.text.slice(0, 15000) : ""; // Truncate to avoid context limits if absurdly large

    // OPTIMIZATION: Use 'sonar' (fast) instead of 'sonar-reasoning' (slow). 
    // Resume extraction is a standard extraction task, not deep reasoning.
    
    const prompt = `
    TASK: Extract Job Profile from Resume.
    RESUME: ${content}
    USER OVERRIDES: ${JSON.stringify(constraints)}

    INSTRUCTIONS:
    1. Infer Seniority (Junior/Senior/Staff/VP).
    2. Write a 3rd-person professional bio (max 150 words).
    3. Extract strict Arrays for JSON.
    4. If User Overrides exist, use them.
    
    OUTPUT JSON SCHEMA ONLY:
    {
      "professional_bio": "string",
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

export const refineConfiguration = async (currentConfig: any, instruction: string): Promise<any> => {
    const llm = getActiveLLM();
    const prompt = `
    Config: ${JSON.stringify(currentConfig)}
    User Request: "${instruction}"
    
    ACTION: Update the Config JSON based on the User Request.
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