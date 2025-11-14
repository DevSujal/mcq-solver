import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import multer from 'multer';
import { ImageRequestSchema } from './src/validators.js';
import { processImage } from './src/pipeline.js';
import { errorShort } from './src/logger.js';

// Multer used only for Express mode (multipart file uploads)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Helper: parse stdin (used by Appwrite runtime which forwards HTTP body to stdin)
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function isAppwriteEnvironment() {
  // Appwrite sets APPWRITE_FUNCTION_NAME and other environment variables in the function runtime
  return !!(process.env.APPWRITE_FUNCTION_NAME || process.env.APPWRITE_FUNCTION_ID || process.env.APPWRITE_FUNCTION_TRIGGER || process.env.APPWRITE_FUNCTION_EVENT);
}

// Appwrite HTTP handler: read JSON from stdin and print JSON to stdout
async function appwriteMain() {
  try {
    const stdinStr = (await readStdin()).trim();
    // Appwrite may provide data on stdin or in APPWRITE_FUNCTION_DATA. We support both.
    let payload = {};
    if (stdinStr) {
      try {
        payload = JSON.parse(stdinStr);
      } catch (e) {
        // If it's not JSON we still try to use it as plain body
        payload = { raw: stdinStr };
      }
    } else if (process.env.APPWRITE_FUNCTION_DATA) {
      try {
        payload = JSON.parse(process.env.APPWRITE_FUNCTION_DATA);
      } catch (e) {
        payload = { raw: process.env.APPWRITE_FUNCTION_DATA };
      }
    }

    // Validate and parse input similarly to the Express endpoint
    try {
      ImageRequestSchema.parse(payload);
    } catch (e) {
      console.error('bad_request', e?.message || String(e));
      // Appwrite expects JSON or printed output for brevity
      console.log(JSON.stringify({ error: 'invalid_request', message: e?.message || String(e) }));
      process.exit(1);
      return;
    }

    let imageBuffer = null;
    if (payload.image_base64) {
      const match = payload.image_base64.match(/^data:(.+);base64,(.+)$/);
      if (!match) {
        console.error('bad_image');
        console.log(JSON.stringify({ error: 'image_base64 must be a data URL' }));
        process.exit(1);
        return;
      }
      imageBuffer = Buffer.from(match[2], 'base64');
    } else {
      console.error('bad_request: no image provided');
      console.log(JSON.stringify({ error: 'image is required in payload' }));
      process.exit(1);
      return;
    }

    const debug = payload.debug === 'true' || payload.debug === true;
    const requestedModels = payload.models || undefined;

    const reqId = process.env.APPWRITE_FUNCTION_EXECUTION_ID || Math.floor(Math.random() * 1000000);

    try {
      const result = await processImage({ imageBuffer, debug, requestedModels, reqId });
      // Print questions array as JSON
      console.log(JSON.stringify(result.questions));
      process.exit(0);
    } catch (err) {
      console.error('internal_error', err?.message || String(err));
      console.log(JSON.stringify({ error: err?.message || 'server_error' }));
      process.exit(1);
    }
  } catch (e) {
    console.error('fatal', e?.message || String(e));
    process.exit(1);
  }
}

// Express server (for local dev)
async function expressMain() {
  const app = express();
  let reqCounter = 0;
  // small middleware to add request ids and log incoming requests
  app.use((req, res, next) => {
    req.reqId = ++reqCounter;
    req.startTime = Date.now();
    res.on('finish', () => {});
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  app.post('/api/solve-mcqs', upload.single('image'), async (req, res) => {
    try {
      ImageRequestSchema.parse(req.body);
      let imageBuffer = null;
      if (req.file) imageBuffer = req.file.buffer;
      else if (req.body.image_base64) {
        const dataUrl = req.body.image_base64;
        const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!match) return res.status(400).json({ error: 'image_base64 must be a data URL' });
        imageBuffer = Buffer.from(match[2], 'base64');
      } else {
        return res.status(400).json({ error: 'image is required either as multipart or base64 JSON' });
      }

      const debug = req.body.debug === 'true' || req.body.debug === true;
      const requestedModels = req.body.models || undefined;

      const result = await processImage({ imageBuffer, debug, requestedModels, reqId: req.reqId });
      res.json(result.questions);
    } catch (err) {
      errorShort(req.reqId, 'HTTP', `Request failed: ${err?.message || err}`, { err });
      res.status(500).json({ error: err.message || 'server_error' });
    }
  });

  app.get('/api/health', async (req, res) => {
    try {
      res.json({ ok: true, ocr_key_present: !!process.env.OCR_API_KEY, gemini_key_present: !!process.env.GEMINI_API_KEY, cerebras_key_present: !!process.env.CEREBRAS_API_KEY });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.listen(process.env.PORT || 8080, () => {
    console.log('Server running on port', process.env.PORT || 8080);
  });
}

// Entry point - choose runtime based on environment
if (isAppwriteEnvironment()) {
  appwriteMain();
} else {
  expressMain();
}
