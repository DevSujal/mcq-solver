import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors'
import multer from 'multer';
import { ImageRequestSchema } from './src/validators.js';
import { processImage } from './src/pipeline.js';
import { errorShort } from './src/logger.js';


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
let reqCounter = 0;
const app = express();

app.use(cors({
  origin: '*',
  credentials: true
}))
// small middleware to add request ids and log incoming requests
app.use((req, res, next) => {
  req.reqId = ++reqCounter;
  req.startTime = Date.now();
  res.on('finish', () => {
  });
  next();
});
app.use(express.json({ limit: '10mb' }));

app.post('/api/solve-mcqs', upload.single('image'), async (req, res) => {
  try {
    // basic validation
    console.log("API Hitting successfull!!")
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
    res.json(result["questions"]);
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
