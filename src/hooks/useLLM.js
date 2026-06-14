import { useState, useCallback } from 'react';

export function useLLM() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const callLLM = useCallback(async (endpoint, modelName, systemPrompt, userPrompt, apiKey, enableThinking) => {
    setIsLoading(true);
    setError(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const body = {
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]
      };

      if (enableThinking) {
        body.max_tokens = 32000;
        body.reasoning_effort = 'low';
      } else {
        body.reasoning_effort = 'none';
      }

      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) throw new Error(`LLM error: ${response.status} ${response.statusText}`);

      const data = await response.json();
      const msg = data.choices?.[0]?.message;
      let content = msg?.content?.trim();
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
