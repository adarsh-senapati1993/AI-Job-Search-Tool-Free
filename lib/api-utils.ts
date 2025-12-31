import { GoogleGenAI } from "@google/genai";

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

export const verifyGeminiKey = async (
  apiKey: string,
  config: RetryConfig = { maxRetries: 3, baseDelayMs: 1000 }
): Promise<VerificationResult> => {
  const TEST_PROMPT = "Reply with exactly three words: 'System Online Verified'.";
  const EXPECTED_PART = "System Online Verified";

  // We use a widely available model for the handshake to ensure the Key itself is valid.
  // We try Gemini 2.0 Flash Exp as it's generally available in free tier.
  const model = 'gemini-2.0-flash-exp'; 

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: model,
        contents: TEST_PROMPT
      });
      
      const text = response.text || "";
      
      if (text.includes(EXPECTED_PART) || text.length > 0) {
        return { 
          success: true, 
          message: '✅ API Key verified successfully!' 
        };
      } else {
        throw new Error(`Unexpected response: "${text}"`);
      }
      
    } catch (error: any) {
      const isLastAttempt = (attempt === config.maxRetries);
      
      // --- SPECIFIC ERROR HANDLING ---
      
      // 404: Model not found. This means Key is valid but Model Name is wrong.
      // We shouldn't retry this, but we should tell the user it's likely a configuration issue, not auth.
      if (error.status === 404) {
          return {
              success: false,
              message: `❌ Model '${model}' not found. Ensure your API Key has access to Gemini 2.0/3.0 models.`,
              error: 'UNEXPECTED'
          };
      }

      // --- NON-RETRYABLE ERRORS (Authentication) ---
      const isAuthError = 
        error.status === 400 || 
        error.status === 401 || 
        error.status === 403 ||
        error.message?.includes('API key');
      
      if (isAuthError) {
        return { 
          success: false, 
          message: '❌ Invalid API Key. Please check your key and try again.',
          error: 'AUTH_FAILED'
        };
      }

      // --- RETRYABLE ERRORS (Network/Timeout) ---
      // 429 (Quota), 500 (Server), Fetch Errors
      const isRetryable = 
        error.message?.includes('fetch failed') ||
        error.message?.includes('network') ||
        error.status === 429 ||
        error.status >= 500;
      
      if (isRetryable && !isLastAttempt) {
        const backoffMs = Math.pow(2, attempt - 1) * config.baseDelayMs;
        
        // Trigger Toast if available
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast({
            type: 'warning',
            message: `⏳ Connection issue. Retrying in ${backoffMs/1000}s... (Attempt ${attempt}/${config.maxRetries})`
          });
        }
        
        console.log(`[Retry ${attempt}/${config.maxRetries}] Waiting ${backoffMs}ms before retry...`);
        await sleep(backoffMs);
        continue;
      }
      
      if (isLastAttempt) {
        return {
          success: false,
          message: `❌ Unable to connect to Gemini API (${error.message || 'Network Error'}). Check your internet or VPN.`,
          error: 'MAX_RETRIES_EXCEEDED'
        };
      }
      
      // Fallback retry for unknowns
      const backoffMs = Math.pow(2, attempt - 1) * config.baseDelayMs;
      await sleep(backoffMs);
    }
  }

  return {
    success: false,
    message: '❌ Unexpected error during verification.',
    error: 'UNEXPECTED'
  };
};