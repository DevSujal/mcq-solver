import { processText } from '../src/pipeline.js';

async function runTest() {
  const sampleText = `Question 1\nWhat happens if an abstract class does not have any abstract methods?\nA) It will not compile.\nB) The class can still be abstract.\nC) Java will automatically provide an abstract method.\nD) It becomes a concrete class.`;

  const res = await processText({ text: sampleText, reqId: 'test-1' });
  console.log(JSON.stringify(res, null, 2));
}

runTest().catch(e => console.error(e));
