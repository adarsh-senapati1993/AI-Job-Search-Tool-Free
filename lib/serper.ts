export const verifySerperKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: "test connection" })
    });
    
    if (!response.ok) return { isValid: false, error: "Invalid Serper Key" };
    return { isValid: true };
  } catch (error: any) {
    return { isValid: false, error: error.message };
  }
};

export interface SerperResult {
    title: string;
    link: string;
    snippet: string;
    date?: string;
    source?: string;
}

export const checkSerperQuota = async (apiKey: string, estimatedQueries: number): Promise<{ ok: boolean; remaining: number; msg?: string }> => {
    try {
        // Lightweight check
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: "test", num: 1 })
        });
        
        const remainingStr = response.headers.get('X-RateLimit-Remaining') || '0'; // Serper headers might vary, but usually they don't expose credits easily via headers. 
        // Serper doesn't strictly expose "credits remaining" via headers in all plans. 
        // However, a 403 or 402 would indicate failure.
        
        if (response.status === 403 || response.status === 402) {
            return { ok: false, remaining: 0, msg: "Quota Exceeded or Invalid Key" };
        }
        
        // Since we can't get exact credits from headers easily in free tier, we rely on status.
        return { ok: true, remaining: 9999 }; 
    } catch (e) {
        return { ok: false, remaining: 0, msg: "Connection Failed" };
    }
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const performSerperSearch = async (apiKey: string, query: string, start: number = 0, retries = 3): Promise<SerperResult[]> => {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    q: query,
                    num: 20, 
                    start: start 
                })
            });

            if (response.status === 429) {
                const delay = 1000 * Math.pow(2, attempt + 1);
                console.warn(`Serper Rate Limit 429. Retrying in ${delay}ms...`);
                await wait(delay);
                continue;
            }

            if (!response.ok) throw new Error(`Serper API Error: ${response.status}`);
            const data = await response.json();
            
            return (data.organic || []).map((item: any) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                date: item.date,
                source: item.source
            }));
        } catch (e: any) {
            if (attempt === retries - 1) {
                console.error("Serper Search Failed Final", e);
                return [];
            }
            await wait(1000 * (attempt + 1));
        }
    }
    return [];
};