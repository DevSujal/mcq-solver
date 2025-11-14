import fs from 'fs';
import { extractTextFromImageBuffer } from '../ocr.js';
import { parseMcqsFromText } from '../parser.js';

async function main() {
  const samplePath = 'sample.jpg';
  if (!fs.existsSync(samplePath)) {
    console.log('No sample.jpg available in workspace root; create one or copy a test image there to test OCR.');
    return;
  }

  const buf = fs.readFileSync(samplePath);
  console.log('Running OCR...');
  const text = await extractTextFromImageBuffer(buf);
  console.log('Extracted text (first 200 chars):', text.substring(0, 200));

  console.log('Parsing MCQs...');
  const mcqs = parseMcqsFromText(text);
  console.log('Parsed MCQs:', JSON.stringify(mcqs, null, 2));
}

main();
