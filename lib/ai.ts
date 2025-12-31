import { getActiveLLM } from "./llm";

export interface CandidateProfile {
  professional_bio: string; // Detailed narrative
  target_roles: string[];
  seniority_level: string;
  locations: string[];
  skills: string[];
  industries: string[];
  avoid_keywords: string[];
  achievements: string[];
  search_lookback?: string; 
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
    context?: string; // e.g. "He posted about scaling challenges"
}

export const parseCandidateProfile = async (
    apiKey: string, 
    inputs: ProfileInputs, 
    constraints: ExplicitConstraints
): Promise<CandidateProfile> => {
    
    const llm = getActiveLLM();
    const content = inputs.text || "No resume content provided. Please infer best guess from constraints.";

    const prompt = `
    Act as a World-Class Executive Recruiter. 
    Analyze the provided Candidate Resume/Bio Raw Text deep semantic understanding.
    
    RAW DATA:
    ${content}
    ${inputs.linkedinUrl ? `LinkedIn: ${inputs.linkedinUrl}` : ''}
    
    USER CONSTRAINTS (Overrides):
    - Target Roles: ${constraints.roles || "Infer from experience"}
    - Locations: ${constraints.locations || "Infer"}
    - Industries: ${constraints.industries || "Infer"}
    - Skills: ${constraints.skills || "Infer"}
    - Avoid: ${constraints.avoid || "None"}

    OBJECTIVES:
    1. PROFESSIONAL BIO: Write a detailed "Candidate Bio" (150-250 words) that captures their career narrative, core strengths, unique value proposition, and technical depth. This will be used to match them against complex Job Descriptions.
    2. ACHIEVEMENTS: Extract 5-7 "Brag Sheet" bullet points (Action + Metric + Result).
    3. STRUCTURE: Extract clean structured targeting data.
    
    Output JSON structure:
    {
      "professional_bio": "Detailed narrative summary...",
      "target_roles": ["role1", "role2"],
      "seniority_level": "Senior/Staff/Lead etc",
      "locations": ["loc1"],
      "skills": ["skill1"],
      "industries": ["ind1"],
      "avoid_keywords": ["bad1"],
      "achievements": ["achieve1", "achieve2"]
    }
    `;

    return await llm.generateJSON(prompt, "sonar-pro"); 
};

export const refineConfiguration = async (currentConfig: any, instruction: string): Promise<any> => {
    const llm = getActiveLLM();
    const prompt = `
    Current Search Configuration (JSON):
    ${JSON.stringify(currentConfig, null, 2)}

    User Instruction: "${instruction}"

    Task: Update the configuration JSON based strictly on the user's instruction.
    - If they say "add location X", add it to locations.
    - If they say "remove crypto", add "crypto" to avoid_keywords.
    - If they say "focus on Series A", maybe add "Series A" to industries or keywords? (Use best judgment).
    
    Return ONLY the updated JSON object. Do not lose existing data unless explicitly asked to remove.
    `;
    return await llm.generateJSON(prompt);
};

export const generateOutreachDrafts = async (
    apiKey: string,
    userConfig: CandidateProfile,
    lead: any,
    hmContext?: HiringManagerContext
): Promise<OutreachDrafts> => {
    const llm = getActiveLLM();
    const proofPoints = userConfig.achievements?.join('\n- ') || userConfig.skills.join(', ');
    
    const hmName = hmContext?.name || "Hiring Manager";
    const hmInfo = hmContext?.context ? `Context about Hiring Manager (${hmName}): ${hmContext.context}` : "";
    const hmUrl = hmContext?.linkedinUrl ? `HM Profile Link: ${hmContext.linkedinUrl}` : "";

    const prompt = `
    TASK: Write a Senior-Level Outreach (LinkedIn DM & Email).
    
    TARGET PERSONA:
    Name: ${hmName}
    ${hmInfo}
    ${hmUrl}

    JOB CONTEXT:
    Role: ${lead.role_title} at ${lead.company_name}
    Job Snippet: "${lead.snippet}"
    Specific Pain Point Identified: "${lead.outreach_hook || "Unknown"}"

    CANDIDATE PROOF POINTS:
    - ${proofPoints}
    
    TONE & STYLE (CRITICAL - "Anti-AI"):
    - Write as a peer (Senior to Senior), not a desperate applicant.
    - NO fluff ("I hope this finds you well", "I am excited to apply").
    - NO generic praise ("Your company is a market leader").
    - Be specific. Link the candidate's specific achievement to the Job's specific pain point.
    - Keep it short.
    
    Output JSON with 3 fields:
    1. linkedin_dm (< 75 words. Hook + Proof + Low friction ask).
    2. email_subject (Specific, < 8 words. e.g. "Growth at Stripe / Ex-Paypal Lead").
    3. email_body (< 150 words. Connect the dots between HM's problem and Candidate's solution).
    `;

    return await llm.generateJSON(prompt);
};

export const chatWithAI = async (message: string, history: any[], systemInstruction: string): Promise<string> => {
    const llm = getActiveLLM();
    
    const messages = history.map((h: any) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts ? h.parts[0].text : h.text 
    }));
    
    messages.push({ role: 'user', content: message });

    return await llm.generateText(messages, systemInstruction);
};

export const generateScoringJSON = async (prompt: string): Promise<any> => {
    const llm = getActiveLLM();
    return await llm.generateJSON(prompt);
}