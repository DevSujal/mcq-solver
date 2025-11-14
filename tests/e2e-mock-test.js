import { processImage } from '../src/pipeline.js';
import fs from 'fs';

// helper: load sample image, but we can just pass a small buffer and mock OCR.
// To test the pipeline without calling real OCR, we can call parseMcqsFromText directly.
import { parseMcqsFromText } from '../src/parser.js';

async function runMock() {
  const sampleText = `Question 1\nWhat happens if an abstract class does not have any abstract methods?\nA) It will not compile.\nB) The class can still be abstract.\nC) Java will automatically provide an abstract method.\nD) It becomes a concrete class.`;
  const mcqs = await parseMcqsFromText(sampleText);
  console.log('Parsed MCQs:', mcqs);

  // Now simulate modelResponses as if Cerebras and Geminis returned
  const simulatedModelResponses = [
    { model: 'cerebras:llama-3.3-70b', parsed: { selected_options: ['B'], confidence: 0.9, reasoning: 'Abstract classes may not have abstract methods but still be abstract.' } },
    { model: 'models/gemini-2.5-flash', parsed: { selected_options: ['B'], confidence: 0.7, reasoning: 'Same reasoning.' } },
    { model: 'models/gemini-2.5-flash-lite', parsed: { selected_options: ['B'], confidence: 0.6, reasoning: 'Agree.' } }
  ];

  // We'll import ensembler to compute final answer like the pipeline
  const { ensembleResponses } = await import('../src/ensembler.js');
  const results = mcqs.map(q => {
    const resp = ensembleResponses(q, simulatedModelResponses);
    return {
      question: resp.question,
      answer: resp.selected_options.map(opt => `${opt}) ${q.options.find(o => o.label === opt)?.text || ''}`),
      question_id: q.id
    };
  });

  console.log('Final Results:', JSON.stringify(results, null, 2));
}

runMock().catch(e => console.error('Test failed', e));
