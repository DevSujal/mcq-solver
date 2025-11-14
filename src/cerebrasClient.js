import Cerebras from '@cerebras/cerebras_cloud_sdk';

export async function queryCerebrasModel({ model = 'llama-3.3-70b', prompt, stream = false, maxTokens = 2048, temperature = 0.2 }) {
  const cerebras = process.env.CEREBRAS_API_KEY ? new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY }) : null;
  // If no key present, return a reasonable mock based on whether the prompt is a parsing prompt
  const isParse = /parse the following/i.test(prompt);
  if (!cerebras) {
    if (isParse) {
      // Return a minimal example array for parsing
      const fake = [
        {
          id: '1',
          question: 'What happens if an abstract class does not have any abstract methods?',
          options: [
            { label: 'A', text: 'It will not compile.' },
            { label: 'B', text: 'The class can still be abstract.' },
            { label: 'C', text: 'Java will automatically provide an abstract method.' },
            { label: 'D', text: 'It becomes a concrete class.' }
          ],
          multiChoice: false
        }
      ];
      return { text: JSON.stringify(fake), raw: { mock: true } };
    }
    const fakeAnswer = { question_id: '1', selected_options: ['B'], confidence: 0.75, reasoning: 'Mock: B is correct.' };
    return { text: JSON.stringify(fakeAnswer), raw: { mock: true } };
  }

  try {
    const resp = await cerebras.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an assistant that returns JSON only as requested.' },
        { role: 'user', content: prompt }
      ],
      model,
      stream: false,
      max_completion_tokens: maxTokens,
      temperature
    });
    // Cerebras response contains choices with content deltas. For non-stream responses, get text
    const content = resp?.choices?.[0]?.message?.content ?? resp?.choices?.[0]?.text ?? '';
    return { text: String(content || ''), raw: resp };
  } catch (err) {
    console.error('Cerebras SDK call failed:', err?.message || err);
    return { text: '', raw: { error: err?.message || String(err) } };
  }
}
