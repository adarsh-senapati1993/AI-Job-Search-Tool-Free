// Anthropic Claude Provider — claude-3-5-haiku-20241022
// New file created for Anthropic API integration.

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const safeJSONParse = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch {
                // Fall through
            }
        }
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
        throw new Error('Failed to parse JSON from Anthropic response');
    }
};

export const verifyAnthropicKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Say "ok"' }]
            })
        });

        if (response.status === 401) return { isValid: false, error: 'Invalid API Key' };
        if (response.status === 429) return { isValid: true }; // Rate limited but key is valid
        if (!response.ok) {
            const errText = await response.text();
            return { isValid: false, error: `Anthropic Error (${response.status}): ${errText}` };
        }
        return { isValid: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { isValid: false, error: message };
    }
};

export const generateAnthropicJSON = async (
    apiKey: string,
    prompt: string,
    model: string = 'claude-3-5-haiku-20241022'
): Promise<unknown> => {
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 4096,
                    system: 'You are a helpful assistant. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.',
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries - 1) {
                    const delay = 1000 * Math.pow(2, attempt);
                    console.warn(`Anthropic API ${response.status}. Retrying in ${delay}ms... (${maxRetries - attempt - 1} left)`);
                    await wait(delay);
                    continue;
                }
                throw new Error(`Anthropic API Error: ${response.status} after ${maxRetries} retries`);
            }

            if (response.status === 401) throw new Error('Invalid Anthropic API Key');
            if (!response.ok) throw new Error(`Anthropic API Error: ${response.status}`);

            const data = await response.json();
            // Anthropic returns content as an array of blocks
            const textBlock = data.content?.find((block: { type: string }) => block.type === 'text');
            const content = textBlock?.text;
            if (!content) throw new Error('Empty response from Anthropic');

            return safeJSONParse(content);
        } catch (e: unknown) {
            if (attempt === maxRetries - 1) throw e;
            const msg = e instanceof Error ? e.message.toLowerCase() : '';
            if (msg.includes('401') || msg.includes('invalid') || msg.includes('bad request')) throw e;
            const delay = 1000 * Math.pow(2, attempt);
            await wait(delay);
        }
    }
    throw new Error('Anthropic request failed after all retries');
};

export const generateAnthropicText = async (
    apiKey: string,
    messages: Array<{ role: string; content: string }>,
    systemInstruction?: string,
    model: string = 'claude-3-5-haiku-20241022'
): Promise<string> => {
    const maxRetries = 3;

    // Anthropic requires alternating user/assistant messages
    const formattedMessages: Array<{ role: string; content: string }> = [];
    messages.forEach(msg => {
        const role = msg.role === 'model' ? 'assistant' : msg.role === 'system' ? 'user' : msg.role;
        formattedMessages.push({ role, content: msg.content });
    });

    // Ensure first message is from user (Anthropic requirement)
    if (formattedMessages.length > 0 && formattedMessages[0].role !== 'user') {
        formattedMessages.unshift({ role: 'user', content: 'Hello' });
    }

    // Merge consecutive same-role messages (Anthropic doesn't allow them)
    const mergedMessages: Array<{ role: string; content: string }> = [];
    for (const msg of formattedMessages) {
        if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === msg.role) {
            mergedMessages[mergedMessages.length - 1].content += '\n\n' + msg.content;
        } else {
            mergedMessages.push({ ...msg });
        }
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 4096,
                    ...(systemInstruction ? { system: systemInstruction } : {}),
                    messages: mergedMessages
                })
            });

            if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries - 1) {
                    const delay = 1000 * Math.pow(2, attempt);
                    await wait(delay);
                    continue;
                }
                throw new Error(`Anthropic API Error: ${response.status}`);
            }

            if (!response.ok) throw new Error(`Anthropic API Error: ${response.status}`);

            const data = await response.json();
            const textBlock = data.content?.find((block: { type: string }) => block.type === 'text');
            return textBlock?.text || '';
        } catch (e: unknown) {
            if (attempt === maxRetries - 1) throw e;
            const msg = e instanceof Error ? e.message.toLowerCase() : '';
            if (msg.includes('401') || msg.includes('invalid')) throw e;
            const delay = 1000 * Math.pow(2, attempt);
            await wait(delay);
        }
    }
    throw new Error('Anthropic text request failed after all retries');
};
