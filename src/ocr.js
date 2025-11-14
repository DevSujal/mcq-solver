import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import FormData from 'form-data';

// Run OCR using Gemini Vision API with fallback to OCR.space
export async function extractTextFromImageBuffer(imageBuffer, lang = 'eng') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const ocrKey = process.env.OCR_API_KEY;
  if (!geminiKey && !ocrKey) {
    throw new Error('Either GEMINI_API_KEY or OCR_API_KEY is required for OCR');
  }

  // Try Gemini Vision first if key is available
  if (geminiKey) {
    try {
      return await extractWithGeminiVision(imageBuffer, geminiKey);
    } catch (error) {
      // Check if it's a service overload or API error
      const isOverloaded = error.message?.includes('503') || error.message?.includes('overloaded');
      const isRateLimited = error.message?.includes('429') || error.message?.includes('quota');
      
      if ((isOverloaded || isRateLimited) && ocrKey) {
        console.warn('⚠ Gemini Vision unavailable, falling back to OCR.space...');
        return await extractWithOCRSpace(imageBuffer, ocrKey, lang);
      }
      
      // If not overloaded or no OCR.space fallback, throw error
      throw error;
    }
  }
  
  // If no Gemini key, use OCR.space directly
  if (ocrKey) {
    return await extractWithOCRSpace(imageBuffer, ocrKey, lang);
  }
  
  throw new Error('No OCR service available');
}

// Extract using Gemini Vision and return structured JSON
async function extractWithGeminiVision(imageBuffer, apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');
    
    const prompt = `Look at this image carefully and extract ALL multiple choice questions with their complete options.

CRITICAL: For each option, you MUST include the FULL TEXT of that option, not just the label.

Return ONLY valid JSON in this exact format:
[{"id":"1","question":"What is the capital of France?","options":[{"label":"1","text":"Paris"},{"label":"2","text":"London"},{"label":"3","text":"Berlin"}],"multiChoice":false}]

IMPORTANT RULES:
- Each option MUST have both "label" (the number/letter like "1", "A", etc.) AND "text" (the actual option content like "Paris", "circle", "triangle")
- If you see "1) circle", then label="1" and text="circle"
- If you see "A) square", then label="A" and text="square"  
- NEVER put the same text in both label and text (NO: label:"A", text:"A")
- Include COMPLETE option text, not abbreviations
- Skip questions with incomplete or missing option text
- Set "multiChoice" to true only if question explicitly asks to select multiple answers
- Output ONLY the JSON array, no markdown, no explanations`;

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
      
      // Validate and fix malformed options where label and text are the same
      parsedJson = await validateAndFixOptions(parsedJson, base64Image, genAI);
      
      console.log(`✓ Gemini Vision extracted ${parsedJson.length} question(s)`);
      return parsedJson;
    } catch (parseError) {
      console.error('Gemini Vision JSON parse failed:', text);
      throw new Error(`Failed to parse Gemini Vision response as JSON: ${parseError.message}`);
    }
}

// Validate and fix malformed options using a correction layer
async function validateAndFixOptions(questions, base64Image, genAI) {
  const needsCorrection = questions.some(q => 
    q.options?.some(opt => opt.label === opt.text || !opt.text || opt.text.length < 2)
  );
  
  if (!needsCorrection) {
    return questions; // Already good
  }
  
  console.log('⚠ Detected malformed options, applying correction layer...');
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    
    const correctionPrompt = `The following JSON was extracted from an image but has ERRORS in the option text. 
Look at the ORIGINAL IMAGE again and FIX the option texts.

Current JSON (WITH ERRORS):
${JSON.stringify(questions, null, 2)}

INSTRUCTIONS:
1. Look at the original image
2. For each option, extract the FULL ACTUAL TEXT (not just the label)
3. Example: if image shows "1) circle", you must return {"label":"1","text":"circle"}
4. Example: if image shows "A) square", you must return {"label":"A","text":"square"}
5. NEVER use the label as the text (NO: {"label":"A","text":"A"})

Return ONLY the corrected JSON array with proper option texts:`;

    const result = await model.generateContent([
      correctionPrompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: 'image/png'
        }
      }
    ]);
    
    const correctedText = result.response.text();
    const cleanedText = correctedText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    const correctedJson = JSON.parse(cleanedText);
    
    console.log('✓ Options corrected successfully');
    return correctedJson;
  } catch (err) {
    console.warn('⚠ Correction layer failed, using original:', err.message);
    return questions; // Return original if correction fails
  }
}

// Extract text using OCR.space and parse with LLM
async function extractWithOCRSpace(imageBuffer, apiKey, lang = 'eng') {
  const formData = new FormData();
  formData.append('apikey', apiKey);
  formData.append('language', lang);
  formData.append('isOverlayRequired', 'false');
  formData.append('file', imageBuffer, { filename: 'image.png', contentType: 'image/png' });

  try {
    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: formData.getHeaders(),
      timeout: 25000,
    });

    if (response.data.IsErroredOnProcessing) {
      throw new Error(`OCR.space error: ${response.data.ErrorMessage?.join(', ') || 'Unknown error'}`);
    }

    const parsedResults = response.data.ParsedResults;
    if (!parsedResults || parsedResults.length === 0) {
      return [];
    }

    const rawText = parsedResults.map(result => result.ParsedText || '').join('\n');
    console.log('✓ OCR.space extracted text, parsing with LLM...');
    
    // Use Gemini to parse the raw text into structured JSON
    return await parseTextWithLLM(rawText);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('OCR.space request timed out');
    }
    throw new Error(`OCR.space failed: ${error.message}`);
  }
}

// Parse raw OCR text into structured JSON using LLM
async function parseTextWithLLM(text) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY required to parse OCR.space text');
  }
  
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  
  const prompt = `Parse the following OCR text and extract all multiple choice questions as JSON.

OCR Text:
${text}

Return ONLY valid JSON in this format:
[{"id":"1","question":"Question text?","options":[{"label":"1","text":"option text"},{"label":"2","text":"option text"}],"multiChoice":false}]

Rules:
- Extract FULL option text, not just labels
- Skip incomplete questions
- Set multiChoice=true if question asks to select multiple
- Output ONLY JSON, no markdown`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const cleanedText = responseText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
  const parsed = JSON.parse(cleanedText);
  
  console.log(`✓ LLM parsed ${parsed.length} question(s) from OCR.space text`);
  return parsed;
}
