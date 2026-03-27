import { getKey, STORAGE_KEYS } from './storage';
import { FatalAPIError, logErrorToStorage } from './api-utils';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export const verifyGroqKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        if (response.ok) return { isValid: true };
        
        const errorText = await response.text();
        return { isValid: false, error: `Auth Error: ${response.status} - ${errorText}` };
    } catch (e: any) {
        return { isValid: false, error: e.message || 'Network Error or Timeout' };
    }
};

export const generateGroqText = async (
    prompt: string,
    systemInstruction?: string,
    model: string = DEFAULT_MODEL
): Promise<string> => {
    const apiKey = getKey(STORAGE_KEYS.GROQ_KEY);
    if (!apiKey) throw new Error("Groq API key is not configured.");

    const messages: Message[] = [];
    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.1,
                max_tokens: 1500
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429) throw new FatalAPIError(`Groq Rate limit exceeded: ${errorText}`);
            if (response.status >= 400 && response.status < 500) throw new FatalAPIError(`Groq Auth/Bad Request: ${errorText}`);
            throw new Error(`Groq API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e: any) {
        clearTimeout(timeoutId);
        logErrorToStorage('generateGroqText', e);
        if (e.name === 'AbortError') throw new FatalAPIError('Groq API Timeout (>30s)');
        throw e;
    }
};

export const generateGroqJSON = async (
    prompt: string,
    systemInstruction?: string,
    model: string = DEFAULT_MODEL
): Promise<any> => {
    const apiKey = getKey(STORAGE_KEYS.GROQ_KEY);
    if (!apiKey) throw new Error("Groq API key is not configured.");

    const messages: Message[] = [];
    let sysInst = systemInstruction || '';
    if (!sysInst.toLowerCase().includes('json')) {
        sysInst += '\n\nYou must return your response as a valid RAW JSON object. DO NOT wrap it in markdown block quotes (```json). RETURN ONLY PURE JSON.';
    }

    messages.push({ role: 'system', content: sysInst });
    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.1,
                response_format: { type: "json_object" }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429) throw new FatalAPIError(`Groq Rate limit exceeded: ${errorText}`);
            if (response.status >= 400 && response.status < 500) throw new FatalAPIError(`Groq Auth/Bad Request: ${errorText}`);
            throw new Error(`Groq API API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const textResponse = data.choices?.[0]?.message?.content || "";
        
        try {
            return JSON.parse(textResponse);
        } catch (parseError) {
            const cleaned = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
            return JSON.parse(cleaned);
        }
    } catch (e: any) {
        clearTimeout(timeoutId);
        logErrorToStorage('generateGroqJSON', e);
        if (e.name === 'AbortError') throw new FatalAPIError('Groq API Timeout (>30s)');
        throw e;
    }
};
