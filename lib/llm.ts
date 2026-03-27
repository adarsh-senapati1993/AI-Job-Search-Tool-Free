import { generatePerplexityJSON, generatePerplexityText } from './perplexity';
import { generateGeminiJSON, generateGeminiText } from './gemini';
import { generateOpenAIJSON, generateOpenAIText } from './openai';
import { generateAnthropicJSON, generateAnthropicText } from './anthropic';
import { generateGroqJSON, generateGroqText } from './groq';
import { getKey, STORAGE_KEYS } from './storage';

// Unified interface for all LLM providers
export interface LLMProvider {
    generateJSON(prompt: string, modelHint?: string, timeoutMs?: number): Promise<any>;
    generateText(messages: any[], systemInstruction?: string, modelHint?: string, timeoutMs?: number): Promise<string>;
}

const AI_TIMEOUT_MS = 25000; // Increased to 25s to handle heavy resume analysis

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = AI_TIMEOUT_MS): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("AI Request Timeout")), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        if (retries <= 0) throw e;
        // Don't retry on obvious client errors (401, 403, 404, 400)
        const msg = (e.message || "").toLowerCase();
        if (msg.includes("401") || msg.includes("403") || msg.includes("404") || msg.includes("bad request") || msg.includes("invalid api key") || msg.includes("tokens per day") || msg.includes("tpd")) {
            throw e;
        }
        console.warn(`API Trial Failed. Retrying in ${delay}ms... (${retries} left)`);
        await new Promise(r => setTimeout(r, delay));
        return withRetry(fn, retries - 1, delay * 2);
    }
}

// --- Perplexity Provider ---
class PerplexityProvider implements LLMProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateJSON(prompt: string, modelHint?: string, timeoutMs?: number): Promise<any> {
        const model = modelHint || 'sonar';
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(async () => {
            try {
                return await withTimeout(generatePerplexityJSON(this.apiKey, prompt, model), timeout);
            } catch (e: any) {
                if (e.message.includes('invalid_model') || e.message.includes('deprecated') || e.message.includes('not found')) {
                    console.warn(`Model '${model}' failed. Falling back to 'sonar'.`);
                    return await withTimeout(generatePerplexityJSON(this.apiKey, prompt, 'sonar'), timeout);
                }
                throw e;
            }
        }, timeoutMs ? 0 : 3); // Disable retries if custom timeout is set (usually interactive)
    }

    async generateText(messages: any[], systemInstruction?: string, modelHint?: string, timeoutMs?: number): Promise<string> {
        const model = modelHint || 'sonar-pro';
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(async () => {
            try {
                return await withTimeout(generatePerplexityText(this.apiKey, messages, model, systemInstruction), timeout);
            } catch (e: any) {
                if (e.message.includes('invalid_model') || e.message.includes('deprecated') || e.message.includes('not found')) {
                    console.warn(`Model '${model}' failed. Falling back to 'sonar-pro'.`);
                    return await withTimeout(generatePerplexityText(this.apiKey, messages, 'sonar-pro', systemInstruction), timeout);
                }
                throw e;
            }
        }, timeoutMs ? 0 : 3);
    }
}

// --- Gemini Provider ---
class GeminiProvider implements LLMProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getModel(modelHint?: string): string {
        // If the hint is explicitly for Perplexity (e.g. "sonar"), ignore it for Gemini
        let model = modelHint && !modelHint.includes('sonar') ? modelHint : 'gemini-1.5-flash';
        
        if (typeof window !== 'undefined') {
            model = localStorage.getItem('jobradar_gemini_model') || model;
        }
        return model;
    }

    async generateJSON(prompt: string, modelHint?: string, timeoutMs?: number): Promise<any> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(() => withTimeout(generateGeminiJSON(this.apiKey, prompt, this.getModel(modelHint)), timeout), timeoutMs ? 0 : 3);
    }

    async generateText(messages: any[], systemInstruction?: string, modelHint?: string, timeoutMs?: number): Promise<string> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(() => withTimeout(generateGeminiText(this.apiKey, messages, this.getModel(modelHint), systemInstruction), timeout), timeoutMs ? 0 : 3);
    }
}

// --- OpenAI Provider ---
class OpenAIProvider implements LLMProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getModel(modelHint?: string): string {
        // Ignore Perplexity-specific model hints
        if (modelHint && !modelHint.includes('sonar')) return modelHint;
        return 'gpt-4o-mini';
    }

    async generateJSON(prompt: string, modelHint?: string, timeoutMs?: number): Promise<any> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(() => withTimeout(generateOpenAIJSON(this.apiKey, prompt, this.getModel(modelHint)), timeout), timeoutMs ? 0 : 3);
    }

    async generateText(messages: any[], systemInstruction?: string, modelHint?: string, timeoutMs?: number): Promise<string> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(() => withTimeout(generateOpenAIText(this.apiKey, messages, systemInstruction, this.getModel(modelHint)), timeout), timeoutMs ? 0 : 3);
    }
}

// --- Anthropic Claude Provider ---
class AnthropicProvider implements LLMProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getModel(modelHint?: string): string {
        if (modelHint && !modelHint.includes('sonar')) return modelHint;
        return 'claude-3-5-haiku-20241022';
    }

    async generateJSON(prompt: string, modelHint?: string, timeoutMs?: number): Promise<any> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(() => withTimeout(generateAnthropicJSON(this.apiKey, prompt, this.getModel(modelHint)), timeout), timeoutMs ? 0 : 3);
    }

    async generateText(messages: any[], systemInstruction?: string, modelHint?: string, timeoutMs?: number): Promise<string> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        return withRetry(() => withTimeout(generateAnthropicText(this.apiKey, messages, systemInstruction, this.getModel(modelHint)), timeout), timeoutMs ? 0 : 3);
    }
}

// --- Ollama Provider (Placeholder) ---
class OllamaProvider implements LLMProvider {
    constructor() {
        // No API key needed for local Ollama
    }
    async generateJSON(prompt: string): Promise<any> {
        console.error("Ollama provider is not yet implemented.");
        return Promise.resolve({});
    }
    async generateText(messages: any[]): Promise<string> {
        console.error("Ollama provider is not yet implemented.");
        return Promise.resolve("");
    }
}


// --- Groq Provider ---
class GroqProvider implements LLMProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getModel(modelHint?: string): string {
        if (modelHint && !modelHint.includes('sonar')) return modelHint;
        return 'llama-3.3-70b-versatile';
    }

    async generateJSON(prompt: string, modelHint?: string, timeoutMs?: number): Promise<any> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        const mainModel = this.getModel(modelHint);
        return withRetry(async () => {
            try {
                return await withTimeout(generateGroqJSON(prompt, undefined, mainModel), timeout);
            } catch (e: any) {
                const msg = (e.message || '').toLowerCase();
                if (msg.includes('tokens per day') || msg.includes('tpd')) {
                    console.warn(`Groq TPD exhausted on ${mainModel}. Falling back to 8B instant.`);
                    return await withTimeout(generateGroqJSON(prompt, undefined, 'llama-3.1-8b-instant'), timeout);
                }
                throw e;
            }
        }, timeoutMs ? 0 : 3);
    }

    async generateText(messages: any[], systemInstruction?: string, modelHint?: string, timeoutMs?: number): Promise<string> {
        const timeout = timeoutMs || AI_TIMEOUT_MS;
        const prompt = messages.map(m => m.content).join('\n');
        const mainModel = this.getModel(modelHint);
        return withRetry(async () => {
            try {
                return await withTimeout(generateGroqText(prompt, systemInstruction, mainModel), timeout);
            } catch (e: any) {
                const msg = (e.message || '').toLowerCase();
                if (msg.includes('tokens per day') || msg.includes('tpd')) {
                    console.warn(`Groq TPD exhausted on ${mainModel}. Falling back to 8B instant.`);
                    return await withTimeout(generateGroqText(prompt, systemInstruction, 'llama-3.1-8b-instant'), timeout);
                }
                throw e;
            }
        }, timeoutMs ? 0 : 3);
    }
}

// --- Local Bypass Provider ---
class LocalProvider implements LLMProvider {
    async generateJSON(): Promise<any> {
        throw new Error("Local Algorithm Bypass.");
    }
    async generateText(): Promise<string> {
        throw new Error("Local Algorithm Bypass.");
    }
}


export const getActiveLLM = (): LLMProvider => {
    const provider = getKey(STORAGE_KEYS.ACTIVE_LLM_PROVIDER) || 'perplexity';

    switch (provider) {
        case 'gemini':
            const geminiKey = getKey(STORAGE_KEYS.GEMINI_KEY);
            if (!geminiKey) throw new Error("Gemini API Key is missing. Please configure it in Settings.");
            return new GeminiProvider(geminiKey);

        case 'openai':
            const openaiKey = getKey(STORAGE_KEYS.OPENAI_KEY);
            if (!openaiKey) throw new Error("OpenAI API Key is missing. Please configure it in Settings.");
            return new OpenAIProvider(openaiKey);

        case 'anthropic':
            const anthropicKey = getKey(STORAGE_KEYS.ANTHROPIC_KEY);
            if (!anthropicKey) throw new Error("Anthropic API Key is missing. Please configure it in Settings.");
            return new AnthropicProvider(anthropicKey);

        case 'groq':
            const groqKey = getKey(STORAGE_KEYS.GROQ_KEY);
            if (!groqKey) throw new Error("Groq API Key is missing. Please configure it in Settings.");
            return new GroqProvider(groqKey);

        case 'local':
            return new LocalProvider();

        case 'ollama':
            return new OllamaProvider();

        case 'perplexity':
        default:
            const perplexityKey = getKey(STORAGE_KEYS.PERPLEXITY_KEY);
            if (!perplexityKey) throw new Error("Perplexity API Key is missing. Please configure it in Settings.");
            return new PerplexityProvider(perplexityKey);
    }
};