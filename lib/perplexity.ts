import { safeJSONParse } from "./api-utils";

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
    if (e.name === 'AbortError') {
        return { isValid: false, error: "Connection Timed Out (Check Internet)" };
    }
    return { isValid: false, error: e.message || "Network Error" };
  }
};

// Retry logic wrapper
async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (e: any) {
            if (i === retries - 1) throw e;
            // If 429 (Rate Limit), wait longer. If 5xx, wait shorter.
            const isRateLimit = e.message.includes('429');
            const delay = isRateLimit ? 5000 * (i + 1) : 1000 * (i + 1);
            console.warn(`Perplexity Retry ${i + 1}/${retries} (Wait ${delay}ms)...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("Max retries exceeded");
}

export const generatePerplexityJSON = async (apiKey: string, prompt: string, model = "sonar"): Promise<any> => {
    return withRetry(async () => {
        // SYSTEM PROMPT ENGINEERING:
        // Perplexity's Llama-based models need strict JSON reinforcement in the system prompt.
        const systemPrompt = `You are a strict JSON API. 
        You NEVER output conversational text. 
        You ONLY output a valid JSON object or array.
        If you cannot extract data, return null or empty array.`;

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
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Perplexity API Error (${response.status}): ${err}`);
        }
        
        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";
        
        return safeJSONParse(rawContent);
    });
};

export const generatePerplexityText = async (apiKey: string, messages: any[], model = "sonar-pro", systemInstruction?: string): Promise<string> => {
    return withRetry(async () => {
        const msgs = systemInstruction 
            ? [{ role: "system", content: systemInstruction }, ...messages]
            : messages;

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
            })
        });

        if (!response.ok) throw new Error(`Perplexity API Error: ${response.statusText}`);
        
        const data = await response.json();
        return data.choices[0]?.message?.content || "";
    });
};