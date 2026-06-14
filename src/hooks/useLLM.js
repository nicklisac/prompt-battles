import { useState, useCallback } from 'react';

export function useLLM() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const callLLM = useCallback(async (endpoint, modelName, systemPrompt, userPrompt, apiKey) => {
    setIsLoading(true);
    setError(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.9,
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(30000),
      });
      
      if (!response.ok) throw new Error(`LLM error: ${response.status} ${response.statusText}`);
      
      const data = await response.json();
      let content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('Empty response from model');
      
      // Clean up SVG output - remove markdown code fences
      if (content.startsWith('```')) {
        content = content.replace(/^```\\w*\\s*/i, '').replace(/\\s*```$/i, '');
      }
      
      setIsLoading(false);
      return content;
    } catch (err) {
      setIsLoading(false);
      setError(err.message);
      throw err;
    }
  }, []);
  
  return { callLLM, isLoading, error };
}
