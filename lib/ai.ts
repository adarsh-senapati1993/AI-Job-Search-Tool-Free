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
    const content = inputs.text || "";

    // PERPLEXITY PROMPT STRATEGY:
    // We use "sonar-reasoning-pro" (Chain of Thought).
    // We explicitly request verbosity for the bio to avoid "short/non-contextual" summaries.
    
    const prompt = `
    TASK: DEEP CANDIDATE ANALYSIS
    
    RESUME / RAW DATA:
    ${content}
    ${inputs.linkedinUrl ? `LINKEDIN URL: ${inputs.linkedinUrl}` : ''}
    
    USER OVERRIDES (Must be prioritized):
    Target Roles: ${constraints.roles || "Infer from experience"}
    Target Locations: ${constraints.locations || "Infer"}
    Target Industries: ${constraints.industries || "Infer"}
    Key Skills: ${constraints.skills || "Infer"}
    Avoid/Red Lines: ${constraints.avoid || "None"}

    INSTRUCTIONS:
    1. Analyze the candidate's career trajectory, key achievements, and specific domain expertise.
    2. Construct a "Strategic Narrative" bio. This must be a comprehensive 150-200 word paragraph. Mention specific metrics, technologies, and leadership scope. DO NOT be concise.
    3. Infer the correct Seniority Level based on years of experience and leadership scope.
    4. GENERATE SEARCH SYNONYMS: Create a comprehensive list of "target_roles".
       - If user says "PM", expand to ["Product Manager", "Technical Product Manager", "Product Owner"].
       - IMPORTANT: Respect Seniority. If candidate is "Senior", DO NOT include "Junior" or "Associate" roles.
    
    OUTPUT JSON SCHEMA:
    {
      "professional_bio": "A comprehensive, 150-200 word strategic narrative. Highlight leadership scope, technical depth, and specific achievements. Do not be generic.",
      "target_roles": ["Role 1", "Role 2", "Role 3"],
      "seniority_level": "e.g. Senior, Staff, Principal, VP",
      "locations": ["e.g. Remote", "London"],
      "skills": ["Hard Skill 1", "Hard Skill 2", ...],
      "industries": ["Industry 1", "Industry 2"],
      "avoid_keywords": ["Keyword to avoid"],
      "achievements": ["Metric-driven achievement 1", "Metric-driven achievement 2", ...]
    }
    `;

    // Use 'sonar-reasoning-pro' for deep analysis on the profile
    // Fallback logic in LLMClient will handle if this specific model is unavailable
    return await llm.generateJSON(prompt, "sonar-reasoning-pro"); 
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
    TASK: GENERATE HIGH-CONVERSION OUTREACH
    
    CONTEXT:
    Candidate Bio: ${userConfig.professional_bio}
    Top Achievements: ${proof}
    
    TARGET:
    Role: ${lead.role_title} @ ${lead.company_name}
    Job Insights: ${JSON.stringify(lead.pros || [])}
    
    RECIPIENT:
    Name: ${hmContext?.name || "Hiring Manager"}
    Context: ${hmContext?.context || "None"}

    INSTRUCTIONS:
    1. Write a LinkedIn DM (short, casual, connection request style).
    2. Write a Cold Email (Subject + Body).
    3. Use a specific "Hook" based on the company or job insights.
    4. NO generic fluff ("I am passionate about..."). Go straight to value.
    
    OUTPUT JSON:
    {
      "linkedin_dm": "Message text...",
      "email_subject": "Subject line...",
      "email_body": "Email body..."
    }
    `;

    return await llm.generateJSON(prompt, "sonar-pro");
};

export const chatWithAI = async (message: string, history: any[], systemInstruction: string): Promise<string> => {
    const llm = getActiveLLM();
    
    // Perplexity/OpenAI format
    const messages = history.map((h: any) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts ? h.parts[0].text : h.text 
    }));
    
    messages.push({ role: 'user', content: message });

    return await llm.generateText(messages, systemInstruction, "sonar-reasoning-pro");
};

export const generateScoringJSON = async (prompt: string): Promise<any> => {
    const llm = getActiveLLM();
    // Use 'sonar' (Llama 3.1 8B/70B) for faster batch processing. 
    // It is significantly faster than reasoning models.
    return await llm.generateJSON(prompt, "sonar");
}