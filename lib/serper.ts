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

export const performSerperSearch = async (apiKey: string, query: string): Promise<SerperResult[]> => {
    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                q: query,
                num: 20, // Increased fetch size
                // Removed "tbs" param to avoid conflicting with the "after:YYYY-MM-DD" query logic
            })
        });

        if (!response.ok) throw new Error("Serper API Failed");
        const data = await response.json();
        
        return (data.organic || []).map((item: any) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            date: item.date,
            source: item.source
        }));
    } catch (e) {
        console.error("Serper Search Error", e);
        return [];
    }
};