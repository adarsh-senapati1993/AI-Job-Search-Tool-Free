import { logErrorToStorage } from './api-utils';

export const verifySerperKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: "test connection" }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return { isValid: false, error: "Invalid Serper Key" };
        return { isValid: true };
    } catch (error: any) {
        clearTimeout(timeoutId);
        return { isValid: false, error: error.message };
    }
};

export interface SerperResult {
    title: string;
    link: string;
    snippet: string;
    date?: string;
    source?: string;
    company?: string;
    location?: string;
    salary?: string;
}

export const checkSerperQuota = async (apiKey: string, estimatedQueries: number): Promise<{ ok: boolean; remaining: number; msg?: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        // Lightweight check
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: "test", num: 1 }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.status === 403 || response.status === 402) {
            const errorText = await response.text();
            return { ok: false, remaining: 0, msg: `Serper Rejected (${response.status}): ${errorText}` };
        }

        if (!response.ok) {
            const errorText = await response.text();
            return { ok: false, remaining: 0, msg: `Serper Error (${response.status}): ${errorText}` };
        }

        return { ok: true, remaining: 9999 };
    } catch (e: any) {
        clearTimeout(timeoutId);
        return { ok: false, remaining: 0, msg: `Connection Failed: ${e.message}` };
    }
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const performSerperSearch = async (apiKey: string, query: string, start: number = 0, tbs?: string, retries = 5): Promise<SerperResult[]> => {
    for (let attempt = 0; attempt < retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const payload: any = { q: query, num: 20, start: start };
            if (tbs) payload.tbs = tbs;

            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429 || response.status >= 500) {
                const delay = 1000 * Math.pow(2, attempt);
                console.warn(`Serper API ${response.status}. Retrying in ${delay}ms... (${retries - attempt - 1} left)`);
                await wait(delay);
                continue;
            }

            if (!response.ok) {
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    logErrorToStorage(`Serper Fatal Error (${query})`, `Status: ${response.status}`);
                    return [];
                }
                throw new Error(`Serper API Error: ${response.status}`);
            }
            const data = await response.json();

            return (data.organic || []).map((item: any) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                date: item.date,
                source: item.source
            }));
        } catch (e: any) {
            clearTimeout(timeoutId);
            if (attempt === retries - 1) {
                logErrorToStorage(`Serper Search Failed Final (${query})`, e);
                console.error("Serper Search Failed Final", e);
                return [];
            }
            const delay = 1000 * Math.pow(2, attempt);
            console.warn(`Serper Network Error. Retrying in ${delay}ms...`, e.message);
            await wait(delay);
        }
    }
    return [];
};

export const performSerperJobsSearch = async (apiKey: string, query: string, retries = 5): Promise<SerperResult[]> => {
    for (let attempt = 0; attempt < retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch('https://google.serper.dev/jobs', {
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    q: query,
                    num: 20
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429 || response.status >= 500) {
                const delay = 1000 * Math.pow(2, attempt);
                console.warn(`Serper Jobs API ${response.status}. Retrying in ${delay}ms... (${retries - attempt - 1} left)`);
                await wait(delay);
                continue;
            }

            if (!response.ok) {
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    logErrorToStorage(`Serper Jobs Fatal Error (${query})`, `Status: ${response.status}`);
                    return [];
                }
                throw new Error(`Serper Jobs API Error: ${response.status}`);
            }
            const data = await response.json();

            return (data.jobs || []).map((item: any) => ({
                title: item.title,
                link: item.link || item.applyLink, // jobs api sometimes uses applyLink
                snippet: item.description || item.snippet,
                date: item.datePosted,
                source: "google-jobs",
                company: item.company,
                location: item.location,
                salary: item.salary
            }));
        } catch (e: any) {
            clearTimeout(timeoutId);
            if (attempt === retries - 1) {
                logErrorToStorage(`Serper Jobs Search Failed Final (${query})`, e);
                console.error("Serper Jobs Search Failed", e);
                return [];
            }
            const delay = 1000 * Math.pow(2, attempt);
            console.warn(`Serper Jobs Network Error. Retrying in ${delay}ms...`, e.message);
            await wait(delay);
        }
    }
    return [];
};

// Company News Enrichment
export interface CompanyNewsSnippet {
    headline: string;
    url: string;
    date: string;
}

export const fetchCompanyNews = async (
    apiKey: string,
    companyName: string
): Promise<CompanyNewsSnippet | null> => {
    try {
        const query = `"${companyName}" latest news hiring 2025`;
        const results = await performSerperSearch(apiKey, query, 0, undefined, 2);

        if (results.length > 0) {
            const first = results[0];
            return {
                headline: first.title,
                url: first.link,
                date: first.date || new Date().toISOString().split('T')[0]
            };
        }
        return null;
    } catch (e: any) {
        logErrorToStorage(`fetchCompanyNews (${companyName})`, e);
        console.warn(`Failed to fetch news for ${companyName}`, e);
        return null;
    }
};