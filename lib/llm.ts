import { generatePerplexityJSON, generatePerplexityText } from './perplexity';
import { getKey, STORAGE_KEYS } from './storage';

// The Universal Interface is now strictly Perplexity
export class LLMClient {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateJSON(prompt: string, modelHint?: string): Promise<any> {
        // Default to 'sonar' for speed, override to 'sonar-reasoning-pro' for depth
        const model = modelHint || 'sonar';
        try {
            return await generatePerplexityJSON(this.apiKey, prompt, model);
        } catch (e: any) {
            // ROBUST FALLBACK: If model is deprecated or invalid, fall back to 'sonar-pro'
            if (e.message.includes('invalid_model') || e.message.includes('deprecated') || e.message.includes('not found')) {
                console.warn(`Model '${model}' failed (${e.message}). Falling back to 'sonar-pro'.`);
                return await generatePerplexityJSON(this.apiKey, prompt, 'sonar-pro');
            }
            throw e;
        }
    }

    async generateText(messages: any[], systemInstruction?: string, modelHint?: string): Promise<string> {
        const model = modelHint || 'sonar-pro';
        try {
            return await generatePerplexityText(this.apiKey, messages, model, systemInstruction);
        } catch (e: any) {
            // ROBUST FALLBACK
            if (e.message.includes('invalid_model') || e.message.includes('deprecated') || e.message.includes('not found')) {
                console.warn(`Model '${model}' failed (${e.message}). Falling back to 'sonar-pro'.`);
                return await generatePerplexityText(this.apiKey, messages, 'sonar-pro', systemInstruction);
            }
            throw e;
        }
    }
}

export const getActiveLLM = (): LLMClient => {
    const key = getKey(STORAGE_KEYS.PERPLEXITY_KEY);
    if (!key) throw new Error("Perplexity API Key is missing. Please configure it in Settings.");
    return new LLMClient(key);
};