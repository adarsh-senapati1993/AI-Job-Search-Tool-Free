export interface OllamaResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
}

export interface OllamaModel {
    name: string;
    size: number;
    digest: string;
    details: {
        parameter_size?: string;
        quantization_level?: string;
    }
}

// Helper to handle 127.0.0.1 vs localhost ambiguity and trailing slashes
const normalizeUrl = (url: string) => url.replace(/\/$/, '').trim();

const fetchWithFallback = async (baseUrl: string, endpoint: string, options: RequestInit = {}, timeoutMs = 180000): Promise<Response> => {
    const primary = normalizeUrl(baseUrl);
    
    // Fallback using the Vite Proxy (defined in vite.config.ts)
    const proxyUrl = '/ollama_proxy';
    
    // Prioritize Proxy for local connections to avoid CORS issues in Chrome
    const isLocal = primary.includes('127.0.0.1') || primary.includes('localhost');
    const urlsToTry = isLocal ? [proxyUrl, primary] : [primary, proxyUrl];

    const baseFetchOptions: RequestInit = {
        ...options,
        mode: 'cors',
        credentials: 'omit', 
    };

    let lastError;

    for (const url of urlsToTry) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const finalUrl = url === proxyUrl ? `${url}${endpoint}` : `${url}${endpoint}`;
            
            const res = await fetch(finalUrl, {
                ...baseFetchOptions,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            // Proxy specific handling
            if (res.status === 404 && url === proxyUrl) {
                continue;
            }

            if (res.ok) return res;
            
            if (res.status === 500) {
                 const text = await res.text();
                 throw new Error(`Ollama Server Error (500). Model crashed or timed out. Log: ${text.slice(0, 100)}...`);
            }
            
            throw new Error(`HTTP ${res.status} ${res.statusText}`);

        } catch (err: any) {
            clearTimeout(timeoutId);
            lastError = err;
            
            if (err.name === 'AbortError') {
                 console.warn(`[Ollama] Timeout on ${url} (${timeoutMs}ms)`);
                 continue;
            }

            // CORS BYPASS TRICK:
            // If standard POST fails (likely CORS Preflight failure), retry as text/plain.
            // This skips the OPTIONS preflight request in many browsers.
            if (options.method === 'POST' && (err.name === 'TypeError' || err.message.includes('Failed to fetch'))) {
                 const bypassController = new AbortController();
                 const bypassTimeout = setTimeout(() => bypassController.abort(), timeoutMs);
                 
                 try {
                     const bypassUrl = url === proxyUrl ? `${url}${endpoint}` : `${url}${endpoint}`;
                     
                     // Construct new headers without application/json
                     const newHeaders = { ...(baseFetchOptions.headers as any) };
                     delete newHeaders['Content-Type'];
                     newHeaders['Content-Type'] = 'text/plain';

                     const bypassRes = await fetch(bypassUrl, {
                         ...baseFetchOptions,
                         headers: newHeaders,
                         signal: bypassController.signal
                     });
                     
                     clearTimeout(bypassTimeout);
                     
                     if (bypassRes.ok) return bypassRes;
                     if (bypassRes.status === 404 && url === proxyUrl) continue; 
                     
                 } catch (bypassErr) {
                     clearTimeout(bypassTimeout);
                 }
            }
        }
    }

    throw new Error(`Ollama Unreachable. Is it running? Try 'ollama serve' with OLLAMA_ORIGINS="*". Last Error: ${lastError?.message || lastError}`);
};

export const verifyOllamaConnection = async (url: string): Promise<boolean> => {
    try {
        // 1. Check Tags (GET) - Proves server is up
        const tagsRes = await fetchWithFallback(url, '/api/tags', {}, 5000);
        if (!tagsRes.ok) return false;

        // 2. Check Generation (POST)
        // CRITICAL FIX: Use text/plain explicitly to bypass CORS Preflight on the verification check.
        // We know Ollama accepts this. This prevents the "Stuck" state on verification.
        const modelsData = await tagsRes.json();
        const modelName = modelsData.models?.[0]?.name || 'llama3';
        
        // We construct the fetch directly here to force the header
        const cleanUrl = normalizeUrl(url);
        // Try direct first with the bypass header
        // INCREASED TIMEOUT: 30s to allow for model loading from disk (cold boot)
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 30000); // 30s timeout

        try {
            const res = await fetch(`${cleanUrl}/api/generate`, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain' }, // FORCE SIMPLE REQUEST
                body: JSON.stringify({
                    model: modelName,
                    prompt: "hi",
                    stream: false,
                    options: { num_predict: 1 }
                }),
                signal: controller.signal
            });
            clearTimeout(id);
            return res.ok;
        } catch (innerErr) {
            // If direct failed, try the fallback/proxy path normally
             clearTimeout(id);
             console.warn("Direct simple request failed, trying fallback path...");
             const genRes = await fetchWithFallback(url, '/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' }, // Force text/plain here too
                body: JSON.stringify({
                    model: modelName,
                    prompt: "hi",
                    stream: false,
                    options: { num_predict: 1 }
                })
            }, 30000); // 30s timeout
            return genRes.ok;
        }

    } catch (e) {
        console.warn("Ollama Verification Check Failed:", e);
        return false;
    }
};

export const getAvailableModels = async (url: string): Promise<string[]> => {
    try {
        const response = await fetchWithFallback(url, '/api/tags', {}, 5000);
        if (!response.ok) return [];
        const data = await response.json();
        return data.models?.map((m: any) => m.name) || [];
    } catch (e) {
        console.warn("Failed to fetch models", e);
        return [];
    }
};

export const generateOllamaText = async (url: string, model: string, prompt: string): Promise<string> => {
    try {
        const response = await fetchWithFallback(url, '/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false,
                keep_alive: "5m",
                options: {
                    num_ctx: 2048,
                    num_predict: 1024,
                }
            })
        }, 180000); 

        if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
        const data = await response.json() as OllamaResponse;
        return data.response;
    } catch (e: any) {
        throw new Error(`Ollama Gen Error: ${e.message}`);
    }
};

export const generateOllamaJSON = async (url: string, model: string, prompt: string): Promise<any> => {
    try {
        console.log(`[Ollama] Generating JSON with model ${model}...`);
        
        const response = await fetchWithFallback(url, '/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: prompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown. No explanations.",
                format: "json",
                stream: false,
                options: {
                    num_ctx: 2048,
                    num_predict: 512,
                    temperature: 0.0,
                    top_k: 20,
                    repeat_penalty: 1.1
                }
            })
        }, 180000);

        if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);
        const data = await response.json() as OllamaResponse;
        
        try {
            return JSON.parse(data.response);
        } catch (parseError) {
            console.error("JSON Parse Error", data.response);
            throw new Error("Ollama returned invalid JSON. Try a lighter model or shorter input.");
        }
    } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes('Failed to fetch') || msg.includes('Load failed')) {
             throw new Error(`Network Error: Ensure Ollama is running 'ollama serve'.`);
        }
        throw e;
    }
};