interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  error?: 'AUTH_FAILED' | 'MAX_RETRIES_EXCEEDED' | 'UNEXPECTED';
}

const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// --- ROBUST JSON PARSER (Centralized) ---

function extractJSONString(text: string): string {
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = text.match(codeBlockRegex);
    if (match) return match[1].trim();

    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    
    let start = -1;
    let type = ''; 

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        type = 'object';
    } else if (firstBracket !== -1) {
        start = firstBracket;
        type = 'array';
    }

    if (start === -1) return text; 

    let balance = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === '"') { inString = !inString; continue; }

        if (!inString) {
            if (type === 'object') {
                if (char === '{') balance++;
                if (char === '}') balance--;
            } else {
                if (char === '[') balance++;
                if (char === ']') balance--;
            }
            if (balance === 0) return text.substring(start, i + 1);
        }
    }
    
    return text.substring(start);
}

function sanitizeStringForJSON(str: string): string {
    return str.replace(/[\u0000-\u001F]+/g, " ");
}

export const safeJSONParse = (text: string): any => {
    const cleaned = extractJSONString(text);
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        try {
            return JSON.parse(sanitizeStringForJSON(cleaned));
        } catch (e2) {
            console.warn("JSON Parse Failed. Raw:", text);
            throw new Error(`JSON Parse Failed: ${cleaned.slice(0, 50)}...`);
        }
    }
};