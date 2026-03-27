import { getActiveLLM } from "./llm";
import { logErrorToStorage } from './api-utils';
import type { ScoredLead } from "./scoring";
import { performSerperSearch } from "./serper";
import { STORAGE_KEYS, getKey } from "./storage";

// === SHARED TYPE DEFINITIONS ===

export interface CoverLetterResult {
    subject: string;
    body: string;
    tone_notes: string;
}

export interface InterviewQuestion {
    question: string;
    why_asked: string;
    sample_answer: string;
}

export interface InterviewPrepResult {
    likely_questions: InterviewQuestion[];
    insider_tips: string[];
}

export interface SalaryBenchmark {
    median_inr: number;
    range_inr: { min: number; max: number };
    median_usd: number;
    range_usd: { min: number; max: number };
    data_confidence: 'high' | 'medium' | 'low';
    negotiation_tips: string[];
}

export interface CompanyNewsSnippet {
    headline: string;
    url: string;
    date: string;
}

export interface CandidateProfile {
    professional_bio: string;
    target_roles: string[];
    expanded_roles?: string[]; // NEW: AI-generated role synonyms
    seniority_level: string;
    locations: string[];
    expanded_locations?: string[]; // NEW: AI-generated synonyms
    work_mode?: 'any' | 'remote' | 'hybrid' | 'onsite';
    remote_base_country?: string; // e.g. "India" — for remote roles
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

export interface SearchStrategy {
    expanded_roles: string[];
    expanded_locations: string[];
    regional_boards: string[];
    search_focus: string;
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
    TASK: Comprehensive Candidate Profile Extraction.
    RESUME CONTENT: ${content}
    USER OVERRIDES: ${JSON.stringify(constraints)}

    =====================================================
    🔴 CRITICAL NON-NEGOTIABLE OVERRIDE RULES 🔴
    =====================================================
    If USER OVERRIDES contains ANY of these fields with values, you MUST use those values EXACTLY as provided:
    - "roles" -> Copy EXACTLY to "target_roles" (do NOT modify, expand, or ignore)
    - "locations" -> Copy EXACTLY to "locations" (do NOT modify, expand, or ignore)
    - "industries" -> Copy EXACTLY to "industries"
    - "skills" -> Copy EXACTLY to "skills"
    - "avoid" -> Copy EXACTLY to "avoid_keywords"
    
    The USER OVERRIDE values take ABSOLUTE PRIORITY over anything extracted from the resume.
    =====================================================

    INSTRUCTIONS:
    1. ANALYZE SENIORITY: Determine seniority (Junior, Senior, Staff, Principal, VP, C-Level).
    2. GENERATE "AI PROFILE ANALYSIS": Write a rich, 3rd-person executive assessment (approx 80-100 words).
    3. EXTRACT TARGET ROLES: Identify primary roles from the resume.
    4. EXTRACT LOCATIONS: Identify target locations.
    5. EXTRACT ACHIEVEMENTS: List top 3 quantitative achievements.
    
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

// NEW: Unified Search Strategy Generator (P1.5 Optimization)
export const generateSearchStrategy = async (
    apiKey: string,
    roles: string[],
    locations: string[],
    industries: string[]
): Promise<SearchStrategy> => {
    const llm = getActiveLLM();

    const prompt = `
    TASK: Generate search strategy JSON. NO PROSE. ONLY raw JSON.

    INPUTS:
    - Target Roles: ${JSON.stringify(roles)}
    - Target Locations: ${JSON.stringify(locations)}
    - Industries: ${JSON.stringify(industries)}

    RULES:
    1. expanded_roles: Add up to 10 common role variations/synonyms (e.g. abbreviations, seniority variants).
    2. expanded_locations: Expand cities into their major tech hub equivalents. Max 10.
    3. regional_boards: 3-5 specific regional job domains (exclude global giants).
    4. search_focus: 1 short sentence summarizing the strategy.

    OUTPUT JSON FORMAT:
    {
      "expanded_roles": ["string"],
      "expanded_locations": ["string"],
      "regional_boards": ["string"],
      "search_focus": "string"
    }
    `;

    try {
        // Enforce a strict 3.5-second timeout to prevent the user from waiting a ton of time
        // if the API is experiencing high latency or rate limit backoffs.
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Strategy generation timeout")), 8500);
        });

        const data = await Promise.race([
            llm.generateJSON(prompt, "sonar"),
            timeoutPromise
        ]) as any;

        return {
            expanded_roles: Array.isArray(data.expanded_roles) ? data.expanded_roles : roles,
            expanded_locations: Array.isArray(data.expanded_locations) ? data.expanded_locations : locations,
            regional_boards: Array.isArray(data.regional_boards) ? data.regional_boards : [],
            search_focus: data.search_focus || "Standard multi-cluster job search."
        };
    } catch (e: any) {
        logErrorToStorage('generateSearchStrategy', e);
        console.warn(`Search Strategy Generation skipped (Reason: ${e.message})`);
        // Fail gracefully and instantly with standard fallbacks
        return {
            expanded_roles: roles,
            expanded_locations: locations,
            regional_boards: [],
            search_focus: "Standard search (Fallback mode)."
        };
    }
};

// NEW: Dynamic Location Expansion (Strategic V5 - Two-Stage with Validation)
const LOCAL_EXPANSION_FALLBACK: Record<string, string[]> = {
    'india': ["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Delhi NCR", "Chennai", "Gurgaon", "Noida"],
    'usa': ["San Francisco", "New York", "Austin", "Seattle", "Chicago", "Boston", "Los Angeles", "Remote"],
    'us': ["San Francisco", "New York", "Austin", "Seattle", "Chicago", "Boston", "Los Angeles", "Remote"],
    'united states': ["San Francisco", "New York", "Austin", "Seattle", "Chicago", "Boston", "Los Angeles", "Remote"],
    'uk': ["London", "Manchester", "Birmingham", "Edinburgh", "Cambridge", "Oxford"],
    'united kingdom': ["London", "Manchester", "Birmingham", "Edinburgh", "Cambridge", "Oxford"],
    'germany': ["Berlin", "Munich", "Hamburg", "Frankfurt", "Stuttgart"],
    'canada': ["Toronto", "Vancouver", "Montreal", "Ottawa", "Calgary"]
};

export const expandLocations = async (apiKey: string, locations: string[]): Promise<string[]> => {
    if (!locations || locations.length === 0) return [];

    const llm = getActiveLLM();
    const results = new Set<string>();
    
    // Add original inputs
    locations.forEach(l => results.add(l.trim()));

    // Try AI expansion
    const prompt = `
    Your task is to expand the following list of locations into a comprehensive list of 8-12 search keywords.
    ROLE: Elite Technical Recruiter & Boolean Search Architect.
    TASK: Classify and expand these locations for job search: ${JSON.stringify(locations)}.

    STEP 1: For EACH location, CLASSIFY it:
    - "CITY" (e.g., Bengaluru, London, NYC, Pune)
    - "STATE" (e.g., California, Karnataka, Bavaria)
    - "COUNTRY" (e.g., India, Germany, USA)
    - "REGION" (e.g., APAC, EMEA, Europe)
    - "REMOTE" (e.g., Remote, Virtual, Work from home)

    STEP 2: Apply STRICT expansion rules based on classification:

    🔴 CITY: ONLY add valid synonyms/former names + airport code (if major).
       - FORBIDDEN: Do NOT add neighboring cities, state, or country.
       - "Bengaluru" -> ["Bengaluru", "Bangalore", "BLR"] ✓
       - "Bengaluru" -> ["Bengaluru", "Hyderabad"] ✗ WRONG

    🟡 STATE: Add state name + top 3 tech hub cities WITHIN that state only.
       - "Karnataka" -> ["Karnataka", "Bengaluru", "Mysuru", "Mangaluru"] ✓

    🟢 COUNTRY: If an input is a country (e.g. "India", "USA", "UK"), you MUST expand it to the country name PLUS the top 8-10 major tech/business hubs in that country.
    - Example: "India" -> ["India", "Bengaluru", "Mumbai", "Delhi NCR", "Hyderabad", "Pune", "Chennai", "Gurgaon", "Noida"]
    - Example: "USA" -> ["USA", "New York", "San Francisco", "Austin", "Seattle", "Chicago", "Boston", "Remote"]

    🔵 REGION: Add region name + major hub cities in countries within that region.
       - "APAC" -> ["APAC", "Singapore", "Tokyo", "Sydney", "Hong Kong", "Bengaluru"] ✓

    🟣 REMOTE: Add remote-related synonyms only, no city names.
       - "Remote" -> ["Remote", "Work from home", "Distributed", "Virtual"] ✓

    OUTPUT JSON FORMAT:
    {
      "classifications": [
        {"input": "Bengaluru", "type": "CITY"},
        {"input": "India", "type": "COUNTRY"}
      ],
      "expanded": ["Bengaluru", "Bangalore", "BLR", "India", "Mumbai", "Delhi", "Hyderabad", "Pune"]
    }
    `;

    try {
        const data = await llm.generateJSON(prompt, "sonar", 5000) as any;
        
        if (data.expanded && Array.isArray(data.expanded)) {
            data.expanded.forEach((ext: string) => {
                if (ext && typeof ext === 'string') {
                    results.add(ext.trim());
                }
            });
        }
    } catch (e: any) {
        logErrorToStorage('expandLocations', e);
        console.error("AI Location Expansion Failed, using local fallback", e);
    }

    // Apply local fallback for major countries if AI failed or for extra coverage
    locations.forEach(loc => {
        const normalized = loc.trim().toLowerCase();
        if (LOCAL_EXPANSION_FALLBACK[normalized]) {
            LOCAL_EXPANSION_FALLBACK[normalized].forEach(city => results.add(city));
        }
    });

    return [...results];
};

// NEW: Dynamic Role Synonym Expansion
export const expandRoles = async (apiKey: string, roles: string[]): Promise<string[]> => {
    if (!roles || roles.length === 0) return [];

    const llm = getActiveLLM();

    const prompt = `
    ROLE: Elite Technical Recruiter & Boolean Search Architect.
    TASK: Create a precise "Boolean Search Expansion List" for these job roles: ${JSON.stringify(roles)}.

    INSTRUCTIONS:
    For EACH role in the input list, generate common variations used in job postings.

    EXPANSION RULES:
    1. ABBREVIATIONS: "Product Manager" -> "PM", "Software Engineer" -> "SWE", "Data Scientist" -> "DS"
    2. SENIORITY PREFIXES: Add "Senior", "Sr.", "Lead", "Staff", "Principal" variations if not already present.
    3. ALTERNATIVE TITLES: "Software Engineer" -> "Software Developer", "Backend Engineer" -> "Backend Developer"
    4. COMMON SYNONYMS: "Product Manager" -> "Product Lead", "Product Owner"
    5. REMOVE DUPLICATES: Do not repeat the same title.

    STRICT RULES:
    - Do NOT add unrelated roles. "Product Manager" should NOT expand to "Project Manager" or "Account Manager".
    - Do NOT add seniority levels that are too far (e.g., if input is "Senior", don't add "Junior").
    - Keep expansions focused and relevant.

    EXAMPLES:
    - "Product Manager" -> ["Product Manager", "PM", "Sr. Product Manager", "Senior Product Manager", "Product Lead", "Sr. PM"]
    - "Software Engineer" -> ["Software Engineer", "SWE", "Software Developer", "Sr. Software Engineer", "Senior Software Engineer", "Backend Engineer", "Frontend Engineer"]
    - "Data Scientist" -> ["Data Scientist", "DS", "Senior Data Scientist", "Sr. Data Scientist", "ML Engineer", "Machine Learning Engineer"]
    - "UX Designer" -> ["UX Designer", "User Experience Designer", "Senior UX Designer", "Product Designer", "UI/UX Designer"]

    OUTPUT: A single flat JSON array of unique strings. Max 30 terms total.
    `;

    try {
        const data = await llm.generateJSON(prompt, "sonar", 5000);
        if (Array.isArray(data)) {
            // Deduplicate and clean
            return [...new Set(data.filter(d => typeof d === 'string' && d.length > 0))];
        }
        return roles;
    } catch (e: any) {
        logErrorToStorage('expandRoles', e);
        console.warn("Role Expansion Failed", e);
        return roles; // Fallback to originals
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
    } catch (e: any) {
        logErrorToStorage('identifyRegionalBoards', e);
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
    const proof = userConfig.achievements?.slice(0, 3).join('; ') || "";

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

// NEW: Find Hiring Manager via Serper search
// NEW: Find Hiring Manager via Serper search
export const findHiringManager = async (companyName: string, roleTitle: string): Promise<HiringManagerContext | null> => {
    const llm = getActiveLLM();

    // Use the LLM to generate a search query and parse results
    const prompt = `
    TASK: Find the likely hiring manager for this role.
    COMPANY: ${companyName}
    ROLE: ${roleTitle}
    
    INSTRUCTIONS:
    1. Search internal knowledge for specific leaders at this company who would hire for this role.
    2. IF you can find a specific NAME (e.g. "Jane Doe, VP Engineering"), return it.
    3. IF you CANNOT find a specific person, return "Unknown". 
    4. DO NOT guess generic titles like "Engineering Manager" as the Name.
    
    OUTPUT JSON:
    {
      "name": "string" | "Unknown", // The actual person's name or "Unknown"
      "title": "string", // Their title
      "linkedinUrl": "string" // Optional, if known
    }
    `;

    try {
        const data = await llm.generateJSON(prompt, "sonar");
        if (data && data.name && data.name !== "Unknown") {
            return {
                name: data.name,
                context: `${data.title} @ ${companyName}`
            };
        }
        return null; // Return null to trigger manual fallback in UI
    } catch (e: any) {
        logErrorToStorage('findHiringManager', e);
        console.warn("Hiring Manager Search Failed", e);
        return null;
    }
};

// NEW: Draft referral request message (non-AI-sounding, no em-dashes)
export const draftReferralMessage = async (
    userConfig: CandidateProfile,
    lead: any,
    mutualConnectionName?: string
): Promise<{ short_message: string; long_message: string }> => {
    const llm = getActiveLLM();
    const skills = userConfig.skills?.slice(0, 3).join(', ') || "";
    const achievement = userConfig.achievements?.[0] || "significant impact in my previous role";

    const prompt = `
    TASK: Draft a LinkedIn referral request message.
    
    SENDER PROFILE:
    - Bio: ${userConfig.professional_bio}
    - Key Skills: ${skills}
    - Achievement: ${achievement}
    
    TARGET ROLE: ${lead.role_title} @ ${lead.company_name}
    RECIPIENT: ${mutualConnectionName || "Mutual Connection"}
    
    CRITICAL RULES (MUST FOLLOW):
    1. NO EM-DASHES (—). Use commas, periods, or colons instead.
    2. NO generic phrases: "I hope this finds you well", "I'm reaching out", "I'd love to connect".
    3. Sound like a real person texting a colleague, not a corporate cover letter.
    4. Be direct about the ask (referral).
    5. Maximum 200 characters for short_message (LinkedIn connection request limit).
    6. Long_message can be 400-500 characters for follow-up InMail.
    7. Mention ONE specific skill or achievement that relates to the role.
    8. Use contractions (I'm, you're, that's) to sound natural.
    
    OUTPUT JSON:
    {
      "short_message": "string", // Max 200 chars, for connection request
      "long_message": "string" // 400-500 chars, for InMail follow-up
    }
    `;

    try {
        const data = await llm.generateJSON(prompt, "sonar-pro");
        // Post-process to ensure no em-dashes
        const cleanShort = (data.short_message || "").replace(/—/g, ',').replace(/–/g, ',');
        const cleanLong = (data.long_message || "").replace(/—/g, ',').replace(/–/g, ',');

        return {
            short_message: cleanShort,
            long_message: cleanLong
        };
    } catch (e: any) {
        logErrorToStorage('draftReferralMessage', e);
        console.warn("Referral Message Draft Failed", e);
        return {
            short_message: `Hi! I saw the ${lead.role_title} role at ${lead.company_name} and noticed we're connected. Would you be open to a quick chat about the team?`,
            long_message: `Hey there! I came across the ${lead.role_title} opening at ${lead.company_name} and got really excited about it. I've been working on ${skills} for the past few years, and I think my experience could be a good fit. Since we're connected, I was hoping you might be able to share some insights about the team or potentially refer me. Happy to send over my resume if you're open to it. Thanks!`
        };
    }
};

export const generateScoringJSON = async (prompt: string, modelHint: string = "sonar"): Promise<any> => {
    const llm = getActiveLLM();
    return await llm.generateJSON(prompt, modelHint);
}

// === NEW AI CAPABILITIES ===

export const generateCoverLetter = async (
    userConfig: CandidateProfile,
    lead: ScoredLead
): Promise<CoverLetterResult> => {
    const llm = getActiveLLM();
    const skills = userConfig.skills?.slice(0, 6).join(', ') || 'relevant skills';
    const achievement = userConfig.achievements?.[0] || 'significant impact in previous roles';
    const matchedSkills = lead.matched_skills?.slice(0, 3).join(', ') || skills;

    const prompt = `
    TASK: Generate a professional cover letter.

    CANDIDATE:
    - Bio: ${userConfig.professional_bio?.slice(0, 300) || 'Not provided'}
    - Seniority: ${userConfig.seniority_level || 'Mid-level'}
    - Key Skills: ${skills}
    - Top Achievement: ${achievement}

    JOB:
    - Role: ${lead.role_title} at ${lead.company_name}
    - Matched Skills: ${matchedSkills}
    - Pros: ${lead.pros?.slice(0, 2).join('; ') || 'Good opportunity'}
    - Snippet: ${lead.snippet?.slice(0, 300) || ''}

    INSTRUCTIONS:
    1. Write a 3-paragraph cover letter:
       - Opening: A compelling hook connecting the candidate to the role
       - Middle: Skills alignment with specific examples
       - Closing: Call to action expressing enthusiasm
    2. Keep it concise (under 250 words)
    3. Sound human, not AI-generated. No em-dashes.
    4. Use contractions naturally.

    OUTPUT JSON:
    {
      "subject": "string (email subject line)",
      "body": "string (full cover letter text)",
      "tone_notes": "string (brief note on the tone used and why)"
    }
    `;

    try {
        const data = await llm.generateJSON(prompt, 'sonar');
        return {
            subject: data.subject || `Application for ${lead.role_title} at ${lead.company_name}`,
            body: data.body || '',
            tone_notes: data.tone_notes || 'Professional and enthusiastic'
        };
    } catch (e: any) {
        logErrorToStorage('generateCoverLetter', e);
        console.error('Cover Letter Generation Failed', e);
        return {
            subject: `Application for ${lead.role_title} at ${lead.company_name}`,
            body: `Dear Hiring Manager,\n\nI am writing to express my interest in the ${lead.role_title} position at ${lead.company_name}. With expertise in ${skills}, I believe I would be a strong fit for this role.\n\n${achievement}\n\nI would welcome the opportunity to discuss how my background aligns with your needs.\n\nBest regards`,
            tone_notes: 'Fallback template used due to generation error'
        };
    }
};

export const generateInterviewPrep = async (
    userConfig: CandidateProfile,
    lead: ScoredLead
): Promise<InterviewPrepResult> => {
    const llm = getActiveLLM();
    const skills = userConfig.skills?.slice(0, 8).join(', ') || 'relevant skills';

    const prompt = `
    TASK: Generate interview preparation materials.

    CANDIDATE:
    - Bio: ${userConfig.professional_bio?.slice(0, 300) || 'Not provided'}
    - Seniority: ${userConfig.seniority_level || 'Mid-level'}
    - Skills: ${skills}
    - Achievements: ${userConfig.achievements?.slice(0, 3).join('; ') || 'Not specified'}

    JOB:
    - Role: ${lead.role_title} at ${lead.company_name}
    - Matched Skills: ${lead.matched_skills?.join(', ') || 'Unknown'}
    - Missing Skills: ${lead.missing_skills?.join(', ') || 'None identified'}
    - Snippet: ${lead.snippet?.slice(0, 500) || ''}

    INSTRUCTIONS:
    1. Generate exactly 5 interview questions relevant to THIS specific role + candidate intersection.
    2. For each question: explain WHY the interviewer would ask it, and provide a 3-sentence STAR-format sample answer.
    3. Include 3 insider tips (cultural, pacing, or domain-specific for ${lead.company_name}).

    OUTPUT JSON:
    {
      "likely_questions": [
        {
          "question": "string",
          "why_asked": "string",
          "sample_answer": "string (3 sentences, STAR format)"
        }
      ],
      "insider_tips": ["string", "string", "string"]
    }
    `;

    try {
        const data = await llm.generateJSON(prompt, 'sonar');
        return {
            likely_questions: Array.isArray(data.likely_questions)
                ? data.likely_questions.slice(0, 5).map((q: InterviewQuestion) => ({
                    question: q.question || 'Tell me about yourself',
                    why_asked: q.why_asked || 'Standard opening question',
                    sample_answer: q.sample_answer || 'Prepare a concise summary of your background.'
                }))
                : [],
            insider_tips: Array.isArray(data.insider_tips)
                ? data.insider_tips.slice(0, 3)
                : ['Research the company thoroughly', 'Prepare STAR-format examples', 'Ask about team culture']
        };
    } catch (e: any) {
        logErrorToStorage('generateInterviewPrep', e);
        console.error('Interview Prep Generation Failed', e);
        return {
            likely_questions: [
                { question: 'Tell me about your experience with ' + (lead.matched_skills?.[0] || 'this domain'), why_asked: 'Assesses core competency', sample_answer: 'Draw from your most relevant project experience.' },
                { question: 'Why are you interested in ' + lead.company_name + '?', why_asked: 'Tests cultural fit and motivation', sample_answer: 'Connect your career goals to the company mission.' },
                { question: 'Describe a challenging project you led.', why_asked: 'Tests leadership and problem-solving', sample_answer: 'Use STAR format with quantifiable results.' },
                { question: 'How do you handle disagreements with stakeholders?', why_asked: 'Tests communication and collaboration', sample_answer: 'Show empathy, data-driven approach, and resolution.' },
                { question: 'Where do you see yourself in 3 years?', why_asked: 'Tests long-term alignment', sample_answer: 'Align your growth trajectory with the role.' }
            ],
            insider_tips: ['Research the company thoroughly', 'Prepare STAR-format examples', 'Ask about team culture']
        };
    }
};

export const generateSalaryBenchmark = async (
    role: string,
    location: string,
    yearsExp: number,
    companyName?: string
): Promise<SalaryBenchmark> => {
    const llm = getActiveLLM();
    let marketContext = "No live market data available. Please estimate based on general knowledge.";

    try {
        const serperKey = getKey(STORAGE_KEYS.SERPER_KEY);
        if (serperKey) {
            const hasCompany = companyName && companyName !== 'Unknown' && companyName !== 'Not specified';
            const companyTerm = hasCompany ? `at ${companyName}` : '';
            const query = `${role} salary ${companyTerm} in ${location} site:levels.fyi OR site:glassdoor.com OR site:payscale.com OR site:comparably.com`;
            const results = await performSerperSearch(serperKey, query, 0, undefined, 1);
            if (results && results.length > 0) {
                const snippets = results.slice(0, 5).map(r => r.snippet).filter(Boolean);
                if (snippets.length > 0) {
                    marketContext = "LIVE MARKET DATA:\\n" + snippets.join('\\n---\\n');
                }
            }
        }
    } catch (e: any) {
        logErrorToStorage('generateSalaryBenchmark API Fetch', e);
        console.warn("Could not fetch live salary data", e);
    }

    const prompt = `
    TASK: Provide salary benchmarking data based on the provided live market context.

    ROLE: ${role}
    COMPANY: ${companyName || 'Not specified'}
    LOCATION: ${location}
    YEARS OF EXPERIENCE: ${yearsExp}

    CONTEXT (Live Search Results):
    ${marketContext}

    INSTRUCTIONS:
    1. Extract realistic market salary ranges from the CONTEXT provided if available. If not, estimate based on your knowledge base.
    2. Return data in both INR and USD (convert if necessary, roughly 1 USD = 83 INR).
    3. Data confidence:
       - "high" if the context provides clear, consistent numbers.
       - "medium" if context is vague or you're combining sources.
       - "low" if no context was used (relying entirely on your base knowledge).
    4. Include 3 concrete negotiation tips specific to this role + location.
    5. Use annual salary figures.

    OUTPUT JSON:
    {
      "median_inr": number,
      "range_inr": { "min": number, "max": number },
      "median_usd": number,
      "range_usd": { "min": number, "max": number },
      "data_confidence": "high" | "medium" | "low",
      "negotiation_tips": ["string", "string", "string"]
    }
    `;

    try {
        const data = await llm.generateJSON(prompt, 'sonar');
        return {
            median_inr: typeof data.median_inr === 'number' ? data.median_inr : 0,
            range_inr: data.range_inr && typeof data.range_inr.min === 'number'
                ? data.range_inr
                : { min: 0, max: 0 },
            median_usd: typeof data.median_usd === 'number' ? data.median_usd : 0,
            range_usd: data.range_usd && typeof data.range_usd.min === 'number'
                ? data.range_usd
                : { min: 0, max: 0 },
            data_confidence: ['high', 'medium', 'low'].includes(data.data_confidence)
                ? data.data_confidence
                : 'low',
            negotiation_tips: Array.isArray(data.negotiation_tips)
                ? data.negotiation_tips.slice(0, 3)
                : ['Research market rates before negotiating', 'Consider total compensation including equity', 'Be prepared to justify your ask with data']
        };
    } catch (e: any) {
        logErrorToStorage('generateSalaryBenchmark', e);
        console.error('Salary Benchmark Generation Failed', e);
        return {
            median_inr: 0,
            range_inr: { min: 0, max: 0 },
            median_usd: 0,
            range_usd: { min: 0, max: 0 },
            data_confidence: 'low',
            negotiation_tips: ['Research market rates', 'Consider total compensation', 'Be prepared to justify your ask']
        };
    }
};

// NEW: Dynamic Target Roles Expansion
export const expandTargetRoles = async (
    apiKey: string, 
    roles: string[], 
    seniority: string, 
    industries: string[],
    context?: CandidateProfile
): Promise<string[]> => {
    if (!roles || roles.length === 0) return [];

    const llm = getActiveLLM();
    const originalLower = new Set(roles.map(r => String(r || '').trim().toLowerCase()).filter(Boolean));

    const inferSeniorityFallback = (inputSeniority: string, roleStrings: string[]) => {
        const s = String(inputSeniority || '').toLowerCase().trim();
        if (s && s !== 'unknown') return inputSeniority;

        const joined = roleStrings.join(' ').toLowerCase();
        if (/\bjunior\b|\bassociate\b/.test(joined)) return 'Junior';
        if (/\bstaff\b/.test(joined)) return 'Staff';
        if (/\bprincipal\b/.test(joined)) return 'Principal';
        if (/\bvp\b|\bvice president\b/.test(joined)) return 'VP';
        if (/\bchief\b|\bc-level\b|\bc level\b/.test(joined)) return 'C-Level';
        if (/\blead\b|\bsenior\b|\bsr\.\b/.test(joined)) return 'Senior';
        return 'Senior';
    };

    const deterministicInject = (startSet: Set<string>) => {
        const effectiveSeniority = inferSeniorityFallback(seniority, roles);

        /**
         * Deterministic seniority/recruiter-style synonym injection.
         * Generates recruiter-style ladders around the detected role family.
         */
        const stripKnownPrefixes = (role: string) => {
            const r = String(role || '').trim();
            if (!r) return r;
            return r
                .replace(/^(senior|sr\.?|lead|staff|principal|vp|vice president|director|chief)\s+/i, '')
                .replace(/\b(vice president|vp)\b/i, 'VP');
        };

        const rolePresets = (s: string): string[] => {
            const sl = String(s || '').toLowerCase();
            if (sl.includes('junior')) return ['Junior', 'Associate'];
            if (sl.includes('staff')) return ['Staff', 'Senior', 'Lead', 'Principal'];
            if (sl.includes('principal')) return ['Principal', 'Staff', 'Senior', 'Lead'];
            if (sl.includes('vp') || sl.includes('vice president')) return ['VP', 'Senior Director', 'Director'];
            if (sl.includes('c-level') || sl.includes('c level') || sl.includes('chief')) return ['Chief', 'VP', 'Senior Director'];
            return ['Senior', 'Lead', 'Staff', 'Principal'];
        };

        const prefixes = rolePresets(effectiveSeniority);

        const shouldUseProductPack = (role: string) => {
            const r = String(role || '').toLowerCase();
            const isExplicitProduct = /\bproduct\b/.test(r);
            const isPmAbbrev = /\bpm\b/.test(r) && !/\bproject\b/.test(r) && !/\bprogram\b/.test(r);
            const isProductFamily = (isExplicitProduct || isPmAbbrev) && !/\bproject\b/.test(r);
            if (!isProductFamily) return false;
            return (
                /\bproduct\s*(manager|management)\b/.test(r) ||
                /\bproduct\s*(owner|lead)\b/.test(r) ||
                /\bpm\b/.test(r)
            );
        };

        const shouldUseEngineeringPack = (role: string) => {
            const r = String(role || '').toLowerCase();
            if (!r) return false;
            if (shouldUseProductPack(role)) return false;
            if (/\banalyst\b|\banalytics\b/.test(r)) return false;
            return (
                /\b(engineer|engineering|developer|development|swe|software)\b/.test(r) ||
                /\bdevops\b/.test(r) ||
                /\bbackend\b|\bfrontend\b|\bfull[\s-]?stack\b/.test(r) ||
                /\bqa\b/.test(r) ||
                /\bdata engineer\b/.test(r)
            );
        };

        const shouldUseAnalystPack = (role: string) => {
            const r = String(role || '').toLowerCase();
            if (!r) return false;
            if (shouldUseProductPack(role)) return false;
            return (
                /\banalyst\b|\banalytics\b/.test(r) ||
                /\bdata\s*analyst\b/.test(r) ||
                /\bbusiness\s*analyst\b/.test(r)
            );
        };

        const toEngineeringCore = (role: string) => {
            const r = String(role || '').trim();
            if (!r) return r;
            return r
                .replace(/\bsoftware\s+developer\b/i, 'Software Engineer')
                .replace(/\bdeveloper\b/i, 'Engineer');
        };

        const toAnalystCore = (role: string) => {
            const r = String(role || '').trim();
            if (!r) return r;
            if (/\bdata\s*analyst\b/i.test(r) || /\bdata\s*analytics\b/i.test(r)) return 'Data Analyst';
            if (/\bbusiness\s*analyst\b/i.test(r)) return 'Business Analyst';
            return r;
        };

        const addRole = (r: string) => {
            const t = String(r || '').trim();
            if (!t) return;
            startSet.add(t);
        };

        roles.forEach(r => {
            const base = stripKnownPrefixes(r);
            if (!base) return;

            if (shouldUseProductPack(base)) {
                const sl = String(effectiveSeniority || '').toLowerCase();
                const productLadder = (() => {
                    if (sl.includes('junior')) {
                        return [
                            'Associate Product Manager',
                            'Junior Product Manager',
                            'Product Manager',
                            'Product Owner',
                            'Product Lead',
                        ];
                    }
                    if (sl.includes('staff')) {
                        return [
                            'Staff Product Manager',
                            'Senior Product Manager',
                            'Lead Product Manager',
                            'Group Product Manager',
                            'Product Director',
                            'Director of Product',
                            'VP Product',
                            'Head of Product',
                            'Product Owner',
                            'Product Lead',
                        ];
                    }
                    if (sl.includes('principal')) {
                        return [
                            'Principal Product Manager',
                            'Senior Product Manager',
                            'Lead Product Manager',
                            'Group Product Manager',
                            'Product Director',
                            'Director of Product',
                            'VP Product',
                            'Head of Product',
                            'Product Owner',
                            'Product Lead',
                        ];
                    }
                    if (sl.includes('vp') || sl.includes('vice president')) {
                        return [
                            'VP Product',
                            'Senior Director Product',
                            'Director of Product',
                            'Head of Product',
                            'Chief Product Officer',
                            'Product Owner',
                            'Product Lead',
                        ];
                    }
                    if (sl.includes('c level') || sl.includes('c-level') || sl.includes('chief')) {
                        return [
                            'Chief Product Officer',
                            'VP Product',
                            'Head of Product',
                            'Director of Product',
                            'Product Owner',
                            'Product Lead',
                        ];
                    }
                    return [
                        'Senior Product Manager',
                        'Lead Product Manager',
                        'Group Product Manager',
                        'Product Director',
                        'Director of Product',
                        'Product Owner',
                        'Product Lead',
                    ];
                })();

                productLadder.forEach(addRole);

                if (/manager|management/i.test(base)) {
                    prefixes.forEach(p => addRole(`${p} ${base}`));
                }
            } else if (shouldUseEngineeringPack(base)) {
                const core = toEngineeringCore(base);
                prefixes.forEach(p => addRole(`${p} ${core}`));

                const sl = String(effectiveSeniority || '').toLowerCase();
                if (sl.includes('staff') || sl.includes('principal') || sl.includes('vp') || sl.includes('c level')) {
                    addRole('Tech Lead');
                    addRole('Engineering Manager');
                    addRole('Director of Engineering');
                    addRole('Head of Engineering');
                } else if (sl.includes('senior') || sl.includes('lead')) {
                    addRole('Tech Lead');
                }
            } else if (shouldUseAnalystPack(base)) {
                const core = toAnalystCore(base);
                prefixes.forEach(p => addRole(`${p} ${core}`));

                const sl = String(effectiveSeniority || '').toLowerCase();
                if (sl.includes('staff') || sl.includes('principal') || sl.includes('vp') || sl.includes('c level')) {
                    addRole('Analytics Manager');
                    addRole('Director of Analytics');
                    addRole('Head of Analytics');
                }
            } else {
                // Generic seniority injection for other roles.
                prefixes.forEach(p => addRole(`${p} ${base}`));
            }
        });

        return startSet;
    };

    const prompt = `
    ROLE: Elite Technical Recruiter & Search Strategist.
    TASK: Expand Target Roles based on DETAILED CANDIDATE CONTEXT.
    
    INPUTS:
    - Primary Roles: ${roles.join(', ')}
    - Seniority: ${seniority}
    - Industries: ${industries.join(', ')}
    - Professional Bio: ${context?.professional_bio || 'N/A'}
    - Key Skills: ${context?.skills?.join(', ') || 'N/A'}

    INSTRUCTIONS:
    1. ANALYZE THE BIO: Deeply understand the candidate's actual experience, specific tech stack, and "archetype".
    2. EXPAND ROLES: Generate 18-25 highly relevant role variations that match BOTH the input roles AND their specific professional background.
    3. PRIORITIZE CORE TECH: If the bio mentions specific technologies (e.g. "Rust", "Distributed Systems", "Mobile", "Fintech"), the suggestions MUST reflect these (e.g. "Rust Engineer", "Distributed Systems Lead").
    4. INCLUDE TRANSVERSAL ROLES: Include adjacent titles across different industries that fit their skill profile.
    5. SENIORITY MATCH (Recruiter Equivalent Levels):
       - You MUST keep the same seniority intent, but allow adjacent recruiter-equivalent levels.
       - If input seniority is "Senior": include Staff/Lead/Principal variants.
       - If input seniority is "Staff": include Senior/Principal/Lead variants.
       - If input seniority is "Principal": include Staff/VP-adjacent variants (e.g., Tech Lead Principal, Principal Architect).
       - If input seniority is "Junior": do NOT jump to Staff/Principal; keep Junior/Senior boundary.
       - If input seniority is "VP" or "C-Level": keep VP/C-level variants only.
    6. Return ONLY a JSON object with "expanded_roles" array.
    
    Response format:
    { "expanded_roles": ["Role 1", "Role 2", ...] }
    `;

    try {
        const data = await llm.generateJSON(prompt, "sonar", 5000) as any;

        const buildSetFromModel = (obj: any): Set<string> => {
            const resultSet = new Set<string>();
            if (obj && obj.expanded_roles && Array.isArray(obj.expanded_roles)) {
                obj.expanded_roles.forEach((ext: string) => {
                    const t = String(ext || '').trim();
                    if (t) resultSet.add(t);
                });
            }
            return resultSet;
        };

        let resultSet = buildSetFromModel(data);
        // Always ensure original inputs map exactly
        roles.forEach(r => {
            const t = String(r || '').trim();
            if (t) resultSet.add(t);
        });

        const newSuggestions = Array.from(resultSet).filter(r => !originalLower.has(r.trim().toLowerCase()));

        // If the model returned too few *new* suggestions, do a second fill pass.
        // This prevents the "pretty limited" output users are seeing.
        const MIN_NEW_SUGGESTIONS = 10;
        if (newSuggestions.length < MIN_NEW_SUGGESTIONS) {
            const existingList = Array.from(resultSet);
            const existingForPrompt = existingList.slice(0, 40).join(', ');
            const fillPrompt = `
            ROLE: Elite Technical Recruiter & Search Strategist.
            TASK: Generate ADDITIONAL unique role titles not already in the existing list.

            INPUTS:
            - Primary Roles: ${roles.join(', ')}
            - Seniority Intent: ${seniority}
            - Industries: ${industries.join(', ')}
            - Professional Bio: ${context?.professional_bio || 'N/A'}
            - Key Skills: ${context?.skills?.join(', ') || 'N/A'}
            - Existing Roles (do NOT repeat): ${existingForPrompt}

            RULES:
            1. Return ONLY JSON object with "expanded_roles" array.
            2. Create ~${Math.max(8, MIN_NEW_SUGGESTIONS - newSuggestions.length)} additional roles (unique, relevant, non-repetitive).
            3. Keep seniority intent and recruiter-equivalent levels (do not drift to unrelated career tracks).
            4. Prefer tech-stack-specific and industry-specific variants.
            `;

            try {
                const fillData = await llm.generateJSON(fillPrompt, "sonar", 4000) as any;
                const fillSet = buildSetFromModel(fillData);
                // Merge, but keep originals guaranteed.
                roles.forEach(r => {
                    const t = String(r || '').trim();
                    if (t) fillSet.add(t);
                });
                resultSet = new Set<string>(Array.from(new Set<string>([...Array.from(resultSet), ...Array.from(fillSet)])));
            } catch (fillErr) {
                // Best-effort: keep first pass.
            }
        }

        // Always apply deterministic recruiter-style expansions (even when LLM is involved).
        deterministicInject(resultSet);

        // Cap size to keep UI manageable; ordering isn't perfect but uniqueness matters most.
        const capped = Array.from(resultSet).slice(0, 30);
        return capped;
    } catch (e: any) {
        logErrorToStorage('expandTargetRoles', e);
        // Best-effort fallback: deterministic expansion only (so the UI still behaves).
        console.error("Roles Expansion Failed", e);
        const set = new Set<string>();
        roles.forEach(r => {
            const t = String(r || '').trim();
            if (t) set.add(t);
        });
        deterministicInject(set);
        return Array.from(set).slice(0, 30);
    }
};
