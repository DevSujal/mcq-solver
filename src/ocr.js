import axios from 'axios';
import FormData from 'form-data';

// Run OCR using OCR.space API; export a function that accepts a Buffer
export async function extractTextFromImageBuffer(imageBuffer, lang = 'eng') {
  const apiKey = process.env.OCR_API_KEY;
  if (!apiKey) {
    throw new Error('OCR_API_KEY environment variable is required for OCR.space');
  }

  const formData = new FormData();
  formData.append('apikey', apiKey);
  formData.append('language', lang);
  formData.append('isOverlayRequired', 'false');
  formData.append('file', imageBuffer, { filename: 'image.png', contentType: 'image/png' });

  try {
    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: formData.getHeaders(),
      timeout: 25000, // 25 seconds
    });

    if (response.data.IsErroredOnProcessing) {
      throw new Error(`OCR.space error: ${response.data.ErrorMessage?.join(', ') || 'Unknown error'}`);
    }

    const parsedResults = response.data.ParsedResults;
    if (!parsedResults || parsedResults.length === 0) {
      return '';
    }

    // Combine text from all parsed results
    return parsedResults.map(result => result.ParsedText || '').join('\n');
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('OCR request timed out after 25 seconds');
    }
    throw new Error(`OCR failed: ${error.message}`);
  }
}
