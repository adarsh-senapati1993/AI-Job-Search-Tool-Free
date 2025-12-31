import { GoogleGenAI, Type } from "@google/genai";
import { ScoredLead } from "./scoring";

// Re-export this for consistency
export interface VerificationResult {
  isValid: boolean;
  error?: string;
  message?: string;
}

export const createGeminiClient = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

export interface CandidateProfile {
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

export const parseCandidateProfile = async (
  apiKey: string, 
  inputs: ProfileInputs, 
  constraints: ExplicitConstraints
): Promise<CandidateProfile> => {
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [];

  let promptText = `
    You are a Senior Technical Recruiter.
    Analyze the Candidate inputs (Resume, Bio, URL) and extract a structured profile.
    
    CRITICAL INSTRUCTION:
    - You MUST output valid JSON matching the schema.
    - If the input text is empty or sparse, INFER reasonable defaults based on the provided 'User Constraints'.
    - If no specific roles/skills are found, use generic terms like "Professional", "Generalist" to ensure the JSON is not empty.
    
    EXTRACT ACHIEVEMENTS:
    - You MUST extract 5-7 specific, quantitative "Brag Sheet" bullet points.
    - If none found, write 3 synthetic bullet points based on the constraints (e.g. "Experienced in [Skill] development").
    
    User Constraints (Prioritize These):
    - Roles: ${constraints.roles || "Infer"}
    - Locations: ${constraints.locations || "Infer"}
    - Skills: ${constraints.skills || "Infer"}
  `;

  if (inputs.linkedinUrl) promptText += `\nLINKEDIN: ${inputs.linkedinUrl}\n`;
  if (inputs.text) promptText += `\nBIO/TEXT: ${inputs.text.slice(0, 15000)}\n`;

  parts.push({ text: promptText });

  if (inputs.files && inputs.files.length > 0) {
    inputs.files.forEach(file => {
      parts.push({
        inlineData: { mimeType: file.mimeType, data: file.data }
      });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          target_roles: { type: Type.ARRAY, items: { type: Type.STRING } },
          seniority_level: { type: Type.STRING },
          locations: { type: Type.ARRAY, items: { type: Type.STRING } },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          industries: { type: Type.ARRAY, items: { type: Type.STRING } },
          avoid_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          achievements: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Specific quantitative achievements extracted from resume"
          },
        },
        required: ["target_roles", "seniority_level", "locations", "skills", "achievements"],
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from Gemini parsing profile");
  return JSON.parse(text) as CandidateProfile;
};

export const generateOutreachDrafts = async (
  apiKey: string,
  userConfig: CandidateProfile,
  lead: ScoredLead
): Promise<OutreachDrafts> => {
  // This function is kept for backward compatibility but actual implementation moved to ai.ts to support HM context
  const ai = new GoogleGenAI({ apiKey });
  // ... implementation handled in ai.ts for rich context ...
  return { linkedin_dm: "", email_subject: "", email_body: "" };
};

export const chatWithGemini = async (
  apiKey: string,
  message: string,
  history: any[],
  systemInstruction: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: systemInstruction,
    },
    history: history
  });

  const response = await chat.sendMessage({ message });
  return response.text || "I'm not sure how to respond to that.";
};

export const generateGeminiScoring = async (apiKey: string, prompt: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      // Define schema to ensure numbers are numbers and array structure is valid
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          match_score: { type: Type.NUMBER },
          breakdown: {
            type: Type.OBJECT,
            properties: {
              role: { type: Type.NUMBER },
              location: { type: Type.NUMBER },
              experience: { type: Type.NUMBER },
              domain: { type: Type.NUMBER },
              stage: { type: Type.NUMBER },
            }
          },
          company_name: { type: Type.STRING },
          role_title: { type: Type.STRING },
          pros: { type: Type.ARRAY, items: { type: Type.STRING } },
          cons: { type: Type.ARRAY, items: { type: Type.STRING } },
          salary: { type: Type.STRING },
          decision: { type: Type.STRING },
          why_you_match: { type: Type.STRING, description: "A 1-sentence explanation of why the candidate fits, addressed to the candidate." },
          outreach_hook: { type: Type.STRING, description: "A specific pain point or angle to use in a cold email." }
        },
        required: ["match_score", "breakdown", "decision"],
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from Gemini Scoring");
  return JSON.parse(text);
};