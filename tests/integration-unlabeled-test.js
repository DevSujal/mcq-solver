import { processText } from '../src/pipeline.js';

async function runTest() {
  const sampleText = `Question 1\nWhat happens if an abstract class does not have any abstract methods?\nIt will not compile.\nThe class can still be abstract.\nJava will automatically provide an abstract method.\nIt becomes a concrete class.\nDiscuss it`;

  const res = await processText({ text: sampleText, reqId: 'test-unlabeled' });
  console.log(JSON.stringify(res, null, 2));
}

runTest().catch(e => console.error(e));
