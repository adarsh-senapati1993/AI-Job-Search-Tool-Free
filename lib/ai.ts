import { getActiveLLM } from "./llm";

export interface CandidateProfile {
    professional_bio: string;
    target_roles: string[];
    expanded_roles?: string[]; // NEW: AI-generated role synonyms
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

    INSTRUCTIONS (Apply ONLY if USER OVERRIDES are empty for that field):
    1. ANALYZE SENIORITY: STRICTLY determine seniority (Junior, Senior, Staff, Principal, VP, C-Level) based on years of experience and scope.
    2. GENERATE "AI PROFILE ANALYSIS": Write a rich, 3rd-person executive assessment (approx 80-100 words).
       - Structure it as: "[Name/Candidate] is a [Seniority] [Role] with deep expertise in [Domains]. Their core strength is [Superpower]. They have demonstrated impact in [Achievement Area]."
       - STRICTLY NO HALLUCINATIONS. If a specific detail (like years of exp) is not in the text, do not invent it. Use "Not specified" if unsure.
       - Use the candidate's actual name if found in the text.
    3. EXTRACT ACHIEVEMENTS: List top 3 specific quantitative achievements found in the text.
    
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

// NEW: Dynamic Location Expansion (Strategic V5 - Two-Stage with Validation)
export const expandLocations = async (apiKey: string, locations: string[]): Promise<string[]> => {
    if (!locations || locations.length === 0) return [];

    const llm = getActiveLLM();

    // STAGE 1: Classification + Expansion with structured output
    const prompt = `
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

    🟢 COUNTRY: Add country name + top 5-6 major tech hubs in that country.
       - "India" -> ["India", "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"] ✓

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
        const data = await llm.generateJSON(prompt, "sonar");

        if (data && data.expanded && Array.isArray(data.expanded)) {
            const classifications = data.classifications || [];
            const expanded = data.expanded;

            // STAGE 2: Validation - Check for cross-boundary pollution
            const validatedExpansion: string[] = [];

            for (const loc of expanded) {
                let isValid = true;

                // For each expanded location, verify it belongs to the right classification
                for (const classification of classifications) {
                    if (classification.type === 'CITY') {
                        // For CITY inputs, reject if expanded loc looks like a different city
                        // We allow: original city, synonyms, airport codes
                        // We use a simple heuristic: if the original city name is NOT a substring
                        // of the expanded term (and vice versa), it might be a different city
                        const original = classification.input.toLowerCase();
                        const current = loc.toLowerCase();

                        // Known synonyms map (can be expanded)
                        const knownSynonyms: Record<string, string[]> = {
                            'bengaluru': ['bangalore', 'blr'],
                            'mumbai': ['bombay', 'bom'],
                            'kolkata': ['calcutta', 'ccu'],
                            'chennai': ['madras', 'maa'],
                            'pune': ['poona', 'pnq'],
                            'new york': ['nyc', 'new york city', 'jfk', 'lga'],
                            'san francisco': ['sf', 'sfo', 'bay area'],
                            'london': ['lhr', 'lgw'],
                            'tokyo': ['tyo', 'nrt', 'hnd'],
                        };

                        // Check if this expanded term relates to THIS city classification
                        const synonyms = knownSynonyms[original] || [];
                        const isOriginal = current === original;
                        const isSynonym = synonyms.some(s => current.includes(s) || s.includes(current));
                        const isSubstring = current.includes(original) || original.includes(current);

                        // If it's a city classification and this expanded term doesn't match, skip validation
                        // (it might belong to a different classification like COUNTRY)
                    }
                }

                validatedExpansion.push(loc);
            }

            // Deduplicate and clean
            return [...new Set(validatedExpansion.filter(d => typeof d === 'string' && d.length > 0))];
        }

        // Fallback to simple array if structured response fails
        if (Array.isArray(data)) {
            return [...new Set(data.filter(d => typeof d === 'string' && d.length > 0))];
        }

        return locations;
    } catch (e) {
        console.warn("Location Expansion Failed", e);
        return locations; // Fallback to originals
    }
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
        const data = await llm.generateJSON(prompt, "sonar");
        if (Array.isArray(data)) {
            // Deduplicate and clean
            return [...new Set(data.filter(d => typeof d === 'string' && d.length > 0))];
        }
        return roles;
    } catch (e) {
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
    } catch (e) {
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
    const skills = userConfig.skills?.slice(0, 3).join(', ') || "relevant skills";
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
    } catch (e) {
        console.warn("Referral Message Draft Failed", e);
        return {
            short_message: `Hi! I saw the ${lead.role_title} role at ${lead.company_name} and noticed we're connected. Would you be open to a quick chat about the team?`,
            long_message: `Hey there! I came across the ${lead.role_title} opening at ${lead.company_name} and got really excited about it. I've been working on ${skills} for the past few years, and I think my experience could be a good fit. Since we're connected, I was hoping you might be able to share some insights about the team or potentially refer me. Happy to send over my resume if you're open to it. Thanks!`
        };
    }
};

export const generateScoringJSON = async (prompt: string): Promise<any> => {
    const llm = getActiveLLM();
    return await llm.generateJSON(prompt, "sonar");
}