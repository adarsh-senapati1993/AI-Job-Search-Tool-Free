// OpenAI Provider — Full implementation for GPT-4o
// Replaces the previous empty placeholder file.

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const safeJSONParse = (text: string): unknown => {
    // Try direct parse first
    try {
        return JSON.parse(text);
    } catch {
        // Try extracting JSON from markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch {
                // Fall through
            }
        }
        // Try extracting first { ... } or [ ... ]
        const objectMatch = text.match(/(\{[\s\S]*\})/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[1]);
            } catch {
                // Fall through
            }
        }
        const arrayMatch = text.match(/(\[[\s\S]*\])/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[1]);
            } catch {
                // Fall through
            }
        }
        throw new Error('Failed to parse JSON from OpenAI response');
    }
};

export const verifyOpenAIKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Say "ok"' }],
                max_tokens: 5
            })
        });

        if (response.status === 401) return { isValid: false, error: 'Invalid API Key' };
        if (response.status === 429) return { isValid: true }; // Rate limited but key is valid
        if (!response.ok) {
            const errText = await response.text();
            return { isValid: false, error: `OpenAI Error (${response.status}): ${errText}` };
        }
        return { isValid: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { isValid: false, error: message };
    }
};

export const generateOpenAIJSON = async (
    apiKey: string,
    prompt: string,
    model: string = 'gpt-4o-mini'
): Promise<unknown> => {
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful assistant. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.7
                })
            });

            if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries - 1) {
                    const delay = 1000 * Math.pow(2, attempt);
                    console.warn(`OpenAI API ${response.status}. Retrying in ${delay}ms... (${maxRetries - attempt - 1} left)`);
                    await wait(delay);
                    continue;
                }
                throw new Error(`OpenAI API Error: ${response.status} after ${maxRetries} retries`);
            }

            if (response.status === 401) throw new Error('Invalid OpenAI API Key');
            if (!response.ok) throw new Error(`OpenAI API Error: ${response.status}`);

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error('Empty response from OpenAI');

            return safeJSONParse(content);
        } catch (e: unknown) {
            if (attempt === maxRetries - 1) throw e;
            const msg = e instanceof Error ? e.message.toLowerCase() : '';
            // Don't retry on client errors
            if (msg.includes('401') || msg.includes('invalid') || msg.includes('bad request')) throw e;
            const delay = 1000 * Math.pow(2, attempt);
            await wait(delay);
        }
    }
    throw new Error('OpenAI request failed after all retries');
};

export const generateOpenAIText = async (
    apiKey: string,
    messages: Array<{ role: string; content: string }>,
    systemInstruction?: string,
    model: string = 'gpt-4o-mini'
): Promise<string> => {
    const maxRetries = 3;
    const formattedMessages: Array<{ role: string; content: string }> = [];

    if (systemInstruction) {
        formattedMessages.push({ role: 'system', content: systemInstruction });
    }

    messages.forEach(msg => {
        formattedMessages.push({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.content
        });
    });

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: formattedMessages,
                    temperature: 0.7
                })
            });

            if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries - 1) {
                    const delay = 1000 * Math.pow(2, attempt);
                    await wait(delay);
                    continue;
                }
                throw new Error(`OpenAI API Error: ${response.status}`);
            }

            if (!response.ok) throw new Error(`OpenAI API Error: ${response.status}`);

            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (e: unknown) {
            if (attempt === maxRetries - 1) throw e;
            const msg = e instanceof Error ? e.message.toLowerCase() : '';
            if (msg.includes('401') || msg.includes('invalid')) throw e;
            const delay = 1000 * Math.pow(2, attempt);
            await wait(delay);
        }
    }
    throw new Error('OpenAI text request failed after all retries');
};
