import { safeJSONParse, withExponentialBackoff, logErrorToStorage, FatalAPIError } from "./api-utils";

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export const verifyPerplexityKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
  const controller = new AbortController();
  // 10 second timeout for verification
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "sonar", 
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) return { isValid: true };
    
    if (response.status === 401) {
         return { isValid: false, error: "Invalid API Key (Access Denied)" };
    }

    const errText = await response.text();
    return { isValid: false, error: `API Error: ${response.status} - ${errText}` };

  } catch (e: any) {
    clearTimeout(timeoutId);
    logErrorToStorage('verifyPerplexityKey', e);
    if (e.name === 'AbortError') {
        return { isValid: false, error: "Connection Timed Out (Check Internet)" };
    }
    return { isValid: false, error: e.message || "Network Error" };
  }
};

export const generatePerplexityJSON = async (apiKey: string, prompt: string, model = "sonar"): Promise<any> => {
    return withExponentialBackoff(async () => {
        // SYSTEM PROMPT ENGINEERING:
        // Perplexity's Llama-based models need strict JSON reinforcement in the system prompt.
        const systemPrompt = `You are a strict JSON API. 
        You NEVER output conversational text. 
        You ONLY output a valid JSON object or array.
        If you cannot extract data, return null or empty array.`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(PERPLEXITY_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.1 // Low temp for deterministic JSON
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const err = await response.text();
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    throw new FatalAPIError(`Perplexity API Error (${response.status}): ${err}`);
                }
                throw new Error(`Perplexity API Error (${response.status}): ${err}`);
            }
            
            const data = await response.json();
            const rawContent = data.choices[0]?.message?.content || "{}";
            
            return safeJSONParse(rawContent);
        } finally {
            clearTimeout(timeoutId);
        }
    }, 'Perplexity generateJSON', 2, 2000, 15000);
};

export const generatePerplexityText = async (apiKey: string, messages: any[], model = "sonar-pro", systemInstruction?: string): Promise<string> => {
    return withExponentialBackoff(async () => {
        const msgs = systemInstruction 
            ? [{ role: "system", content: systemInstruction }, ...messages]
            : messages;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(PERPLEXITY_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: msgs,
                    temperature: 0.6
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const err = await response.text();
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    throw new FatalAPIError(`Perplexity API Error (${response.status}): ${err}`);
                }
                throw new Error(`Perplexity API Error (${response.status}): ${err}`);
            }
            
            const data = await response.json();
            return data.choices[0]?.message?.content || "";
        } finally {
            clearTimeout(timeoutId);
        }
    }, 'Perplexity generateText', 2, 2000, 15000);
};