export const verifyOpenAIKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    if (response.ok) return { isValid: true };
    const err = await response.json();
    return { isValid: false, error: err.error?.message || "Invalid API Key" };
  } catch (e: any) {
    return { isValid: false, error: e.message };
  }
};

export const generateOpenAIJSON = async (apiKey: string, prompt: string, model = "gpt-4o-mini"): Promise<any> => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.2
            })
        });

        if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);
        
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        return JSON.parse(content || "{}");
    } catch (e) {
        console.error("OpenAI JSON Error", e);
        throw e;
    }
};

export const generateOpenAIText = async (apiKey: string, messages: any[], model = "gpt-4o-mini", systemInstruction?: string): Promise<string> => {
    try {
        const msgs = systemInstruction 
            ? [{ role: "system", content: systemInstruction }, ...messages]
            : messages;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: msgs,
                temperature: 0.7
            })
        });

        if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);
        
        const data = await response.json();
        return data.choices[0]?.message?.content || "";
    } catch (e) {
        console.error("OpenAI Text Error", e);
        throw e;
    }
};