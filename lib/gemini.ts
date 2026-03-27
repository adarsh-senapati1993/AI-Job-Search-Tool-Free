import { safeJSONParse, withExponentialBackoff, logErrorToStorage, FatalAPIError } from "./api-utils";

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models';

export const verifyGeminiKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'GET',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            const flashModels = data.models?.filter((m: any) => m.name.includes('flash')) || [];
            if (flashModels.length > 0) {
                const bestModel = flashModels.find((m: any) => m.name === 'models/gemini-1.5-flash') || flashModels[0];
                const modelName = bestModel.name.split('/')[1];
                if (typeof window !== 'undefined') {
                    localStorage.setItem('jobradar_gemini_model', modelName);
                }
            }
            return { isValid: true };
        }
        
        const errorData = await response.json();
        const errorMessage = errorData.error?.message || `API Error: ${response.status}`;
        
        if (response.status === 400 && errorMessage.includes('API_KEY_INVALID')) {
            return { isValid: false, error: "Invalid API Key" };
        }

        return { isValid: false, error: errorMessage };

    } catch (e: any) {
        clearTimeout(timeoutId);
        logErrorToStorage('verifyGeminiKey', e);
        if (e.name === 'AbortError') {
            return { isValid: false, error: "Connection Timed Out" };
        }
        return { isValid: false, error: e.message || "Network Error" };
    }
};

export const generateGeminiJSON = async (apiKey: string, prompt: string, model: string): Promise<any> => {
    return withExponentialBackoff(async () => {
        const systemInstruction = `You are a strict JSON API. You NEVER output conversational text or markdown. You ONLY output a valid JSON object or array. If you cannot extract data, return null or an empty array.`;

        // Build the payload dynamically. 
        // NOTE: The v1 endpoint was throwing errors about "systemInstruction" and "generation_config" top-level keys.
        // As a safe fallback, we prepend the system instruction as a user message.
        const contents = [
            { parts: [{ text: `SYSTEM INSTRUCTION: ${systemInstruction}\n\nUSER PROMPT: ${prompt}` }]}
        ];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s safe timeout

        try {
            const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
                signal: controller.signal
            });

            if (!response.ok) {
                const err = await response.text();
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    throw new FatalAPIError(`Gemini API Error (${response.status}): ${err}`);
                }
                throw new Error(`Gemini API Error (${response.status}): ${err}`);
            }

            const data = await response.json();
            const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
            return safeJSONParse(rawContent);
        } finally {
            clearTimeout(timeoutId);
        }
    }, 'Gemini generateJSON', 2, 2000, 15000);
};

export const generateGeminiText = async (apiKey: string, messages: any[], model: string, systemInstruction?: string): Promise<string> => {
    return withExponentialBackoff(async () => {
        // Gemini API uses a different format for history
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        // If system models are failing on v1, inject system instructions as the first prompt
        if (systemInstruction) {
            contents.unshift({
                role: 'user',
                parts: [{ text: `SYSTEM INSTRUCTION: ${systemInstruction}` }]
            });
            // Add a mock model acknowledgment so the strict alternating sequence is preserved
            contents.unshift({
                role: 'model',
                parts: [{ text: "Understood." }]
            });
        }

        const body: any = { contents };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!response.ok) {
                const err = await response.text();
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    throw new FatalAPIError(`Gemini API Error (${response.status}): ${err}`);
                }
                throw new Error(`Gemini API Error (${response.status}): ${err}`);
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } finally {
            clearTimeout(timeoutId);
        }
    }, 'Gemini generateText', 2, 2000, 15000);
};