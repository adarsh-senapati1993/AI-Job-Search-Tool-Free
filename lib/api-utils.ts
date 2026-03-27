interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  error?: 'AUTH_FAILED' | 'MAX_RETRIES_EXCEEDED' | 'UNEXPECTED';
}

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// --- GLOBAL ERROR LOGGING (Root Cause Analysis) ---
export const logErrorToStorage = (context: string, error: any) => {
    try {
        if (typeof window === 'undefined') return;
        const key = 'jobradar_error_logs';
        const raw = localStorage.getItem(key);
        let logs: any[] = [];
        if (raw) {
            try { logs = JSON.parse(raw); } catch (e) {}
        }
        
        const errorRecord = {
            timestamp: new Date().toISOString(),
            context,
            message: error?.message || String(error),
            stack: error?.stack || null
        };
        
        // Keep last 100 errors to prevent bloated local storage
        logs.unshift(errorRecord);
        if (logs.length > 100) logs = logs.slice(0, 100);
        
        localStorage.setItem(key, JSON.stringify(logs));
        console.error(`[RCA] ${context}:`, error);
    } catch (e) {
        console.error("Failed to write to error log storage", e);
    }
};

// --- CUSTOM ERROR TYPE FOR NON-RETRYABLE ERRORS ---
export class FatalAPIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FatalAPIError';
    }
}

// --- EXPONENTIAL BACKOFF WITH JITTER ---
export async function withExponentialBackoff<T>(
    operation: () => Promise<T>,
    context: string,
    retries: number = 3,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000
): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (e: any) {
            const isRateLimitOrTimeout = 
                e.message?.includes('429') || 
                e.message?.includes('timeout') || 
                e.message?.toLowerCase().includes('rate limit');
                
            // Fail fast for fatal errors (400, 401, 403, 404, etc)
            if (e.name === 'FatalAPIError') {
                logErrorToStorage(`${context} (Fatal)`, e);
                throw e;
            }
                
            // Log the failure attempt
            logErrorToStorage(`${context} (Attempt ${i + 1}/${retries})`, e);
            
            if (i === retries - 1) {
                // Final failure
                logErrorToStorage(`${context}`, new Error(`Max retries exhausted. Last error: ${e.message}`));
                throw e;
            }
            
            // Calculate delay: base * 2^i
            let delay = baseDelayMs * Math.pow(2, i);
            if (isRateLimitOrTimeout) {
                // Heavier penalty for 429s/timeouts
                delay = baseDelayMs * Math.pow(3, i);
            }
            
            // Cap at max delay
            delay = Math.min(delay, maxDelayMs);
            
            // Add jitter (±20%) to avoid thundering herd
            const jitter = delay * 0.2 * (Math.random() * 2 - 1);
            delay = Math.floor(delay + jitter);
            
            console.warn(`[Backoff] ${context} failed. Retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
    throw new Error("Max retries exceeded");
}

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