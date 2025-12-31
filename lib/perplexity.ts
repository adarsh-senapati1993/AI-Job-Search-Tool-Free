export const verifyPerplexityKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Be concise." },
          { role: "user", content: "Ping" }
        ]
      })
    });
    
    if (response.ok) return { isValid: true };
    const errText = await response.text();
    return { isValid: false, error: `API Error: ${response.status} - ${errText}` };
  } catch (e: any) {
    return { isValid: false, error: e.message || "Network Error" };
  }
};

/**
 * Robustly extracts JSON from a string that might contain Markdown code blocks,
 * conversational text, or citations (e.g. [1]).
 */
function extractJSON(text: string): string {
    // 1. Try to extract from markdown code blocks first (most reliable)
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = text.match(codeBlockRegex);
    if (match) {
        return match[1].trim();
    }

    // 2. If no code block, find the first valid JSON start character ({ or [)
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    
    let start = -1;
    let type = ''; // 'object' or 'array'

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        type = 'object';
    } else if (firstBracket !== -1) {
        start = firstBracket;
        type = 'array';
    }

    if (start === -1) return text; // No JSON structure found

    // 3. Stack-based extraction to find the matching closing bracket
    // This ignores trailing text/citations like " ... see [1]"
    let balance = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = start; i < text.length; i++) {
        const char = text[i];
        
        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (type === 'object') {
                if (char === '{') balance++;
                if (char === '}') balance--;
            } else {
                if (char === '[') balance++;
                if (char === ']') balance--;
            }

            // When balance hits zero, we found the end of the JSON structure
            if (balance === 0) {
                return text.substring(start, i + 1);
            }
        }
    }
    
    // Fallback: If loop finishes without balance=0, return from start to end
    return text.substring(start);
}

export const generatePerplexityJSON = async (apiKey: string, prompt: string, model = "sonar"): Promise<any> => {
    try {
        const finalPrompt = `${prompt}
        
        CRITICAL INSTRUCTION: Return ONLY a valid JSON object or array.
        You may wrap it in a markdown code block (optional).
        Ensure all strings are properly escaped.`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: "You are a strict JSON data generator." },
                    { role: "user", content: finalPrompt }
                ],
                temperature: 0.1 
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Perplexity API Error (${response.status}): ${err}`);
        }
        
        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";
        
        // Use the robust extractor
        const cleanContent = extractJSON(rawContent);

        try {
            return JSON.parse(cleanContent);
        } catch (parseError) {
            console.error("JSON Parse Error. Raw Content:", rawContent);
            console.error("Attempted Clean Content:", cleanContent);
            throw new Error(`Failed to parse Perplexity response as JSON. The model might have returned conversational text.`);
        }
    } catch (e) {
        console.error("Perplexity JSON Error", e);
        throw e;
    }
};

export const generatePerplexityText = async (apiKey: string, messages: any[], model = "sonar", systemInstruction?: string): Promise<string> => {
    try {
        const msgs = systemInstruction 
            ? [{ role: "system", content: systemInstruction }, ...messages]
            : messages;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: msgs,
                temperature: 0.6
            })
        });

        if (!response.ok) throw new Error(`Perplexity API Error: ${response.statusText}`);
        
        const data = await response.json();
        return data.choices[0]?.message?.content || "";
    } catch (e) {
        console.error("Perplexity Text Error", e);
        throw e;
    }
};