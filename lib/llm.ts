import { generatePerplexityJSON, generatePerplexityText } from './perplexity';
import { generateGeminiScoring, chatWithGemini, parseCandidateProfile as parseGeminiProfile } from './gemini';
import { generateOpenAIJSON, generateOpenAIText } from './openai';
import { generateOllamaJSON, generateOllamaText } from './ollama';
import { getKey, STORAGE_KEYS } from './storage';
import { GoogleGenAI } from "@google/genai";

export type LLMProvider = 'perplexity' | 'gemini' | 'openai' | 'ollama';

export interface LLMResponse {
    text: string;
    json?: any;
}

// The Universal Interface for "The Brain"
export class LLMClient {
    private provider: LLMProvider;
    private apiKey: string;

    constructor(provider: LLMProvider, apiKey: string) {
        this.provider = provider;
        this.apiKey = apiKey;
    }

    async generateJSON(prompt: string, modelHint?: string): Promise<any> {
        switch (this.provider) {
            case 'perplexity':
                return await generatePerplexityJSON(this.apiKey, prompt, modelHint || 'sonar');
            case 'gemini':
                return await generateGeminiScoring(this.apiKey, prompt); // Reusing the JSON generation logic
            case 'openai':
                return await generateOpenAIJSON(this.apiKey, prompt, modelHint || 'gpt-4o-mini');
            case 'ollama':
                return await generateOllamaJSON(this.apiKey, modelHint || 'llama3', prompt);
            default:
                throw new Error(`Provider ${this.provider} not supported for JSON`);
        }
    }

    async generateText(messages: any[], systemInstruction?: string, modelHint?: string): Promise<string> {
        switch (this.provider) {
            case 'perplexity':
                return await generatePerplexityText(this.apiKey, messages, modelHint || 'sonar', systemInstruction);
            case 'gemini':
                // Wrapper to match chatWithGemini signature
                return await chatWithGemini(this.apiKey, messages[messages.length - 1].content, messages.slice(0, -1), systemInstruction || "");
            case 'openai':
                return await generateOpenAIText(this.apiKey, messages, modelHint || 'gpt-4o-mini', systemInstruction);
            case 'ollama':
                const prompt = `${systemInstruction ? `System: ${systemInstruction}\n` : ''}${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`;
                return await generateOllamaText(this.apiKey, modelHint || 'llama3', prompt);
            default:
                throw new Error(`Provider ${this.provider} not supported for Text`);
        }
    }
}

export const getActiveLLM = (): LLMClient => {
    const provider = getKey(STORAGE_KEYS.LLM_PROVIDER) as LLMProvider;
    if (!provider) throw new Error("No Intelligence Provider Configured");

    let key = '';
    switch (provider) {
        case 'gemini': key = getKey(STORAGE_KEYS.GEMINI_KEY) || ''; break;
        case 'openai': key = getKey(STORAGE_KEYS.OPENAI_KEY) || ''; break;
        case 'perplexity': key = getKey(STORAGE_KEYS.PERPLEXITY_KEY) || ''; break;
        case 'ollama': key = getKey(STORAGE_KEYS.OLLAMA_URL) || ''; break;
    }

    if (!key) throw new Error(`Missing API Key for ${provider}`);
    return new LLMClient(provider, key);
};