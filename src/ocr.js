import { GoogleGenerativeAI } from '@google/generative-ai';

// Run OCR using Gemini Vision API; export a function that accepts a Buffer
export async function extractTextFromImageBuffer(imageBuffer, lang = 'eng') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required for Gemini Vision OCR');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');
    
    const prompt = `Extract all multiple choice questions from this image and return them as a JSON array. 
Only include questions that have ALL of the following:
- A complete question text
- At least 2 options (A, B, C, D, etc.)

Return ONLY valid JSON in this exact format:
[{"id":"1","question":"Question text here?","options":[{"label":"A","text":"Option A text"},{"label":"B","text":"Option B text"}],"multiChoice":false}]

Rules:
- If a question is incomplete or missing options, skip it entirely
- Set "multiChoice" to true if the question asks to "select all that apply" or similar wording
- Output ONLY the JSON array, no other text or explanation
- Ensure all JSON is properly formatted and escaped`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: 'image/png'
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    if (!text || text.trim().length === 0) {
      throw new Error('Gemini Vision returned empty response');
    }
    
    // Parse and validate JSON
    let parsedJson;
    try {
      // Remove markdown code blocks if present
      const cleanedText = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      parsedJson = JSON.parse(cleanedText);
      
      if (!Array.isArray(parsedJson)) {
        throw new Error('Response is not an array');
      }
      
      console.log(`✓ Gemini Vision extracted ${parsedJson.length} question(s)`);
      return parsedJson;
    } catch (parseError) {
      console.error('Gemini Vision JSON parse failed:', text);
      throw new Error(`Failed to parse Gemini Vision response as JSON: ${parseError.message}`);
    }
  } catch (error) {
    if (error.message?.includes('GEMINI_API_KEY')) {
      throw error;
    }
    throw new Error(`Gemini Vision OCR failed: ${error.message}`);
  }
}
