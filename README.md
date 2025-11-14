# MCQ OCR + Gemini API

This project implements a single-node API endpoint that accepts an image (multipart/form-data or base64), runs OCR (Tesseract.js), parses MCQs (regex + LangChain fallback), queries multiple Gemini models (via Vertex AI), and returns final answers as JSON. The project contains a mock Vertex client for local testing when you don't have GCP setup.

Endpoints:
- POST /api/solve-mcqs
  - multipart form data with `image` file OR JSON `image_base64` (data URL)
  - optional body query params: `debug` (true), `models` (list)

Run locally:

```bash
npm install
npm run start
```

Test (curl):

```bash
curl -X POST -F "image=@sample.jpg" http://localhost:8080/api/solve-mcqs
```

Example with explicit model list (Gemini + Cerebras models):
```bash
curl -X POST -F "image=@sample.jpg" \
  -F "models=[\"models/gemini-2.5-flash\",\"cerebras:llama-3.3-70b\",\"cerebras:qwen-3-32b\"]" \
  http://localhost:8080/api/solve-mcqs
```

Environment:
- Add your Gemini API credentials and Cerebras API key in `.env` to enable real model calls; otherwise the mock mode will simulate model responses.
- Create `.env` with:
  - `GEMINI_API_KEY=your-gemini-api-key`
  - `GEMINI_API_URL` optional for the Gemini API base URL
  - `CEREBRAS_API_KEY=your-cerebras-api-key`
  - `GEMINI_MODEL=models/gemini-2.5-flash`
  - `CEREBRAS_LLAMA=llama-3.3-70b`
  - `CEREBRAS_QWEN=qwen-3-32b`

  Note: If GEMINI_API_KEY or CEREBRAS_API_KEY is not set, the app will use mock model responses for local testing.

Node-specific tesseract.js notes:
- `tesseract.js` uses a WebAssembly build. When running under Node, ensure `tesseract.js-core` is installed in `node_modules` and the `tesseract-core.wasm` file is accessible. If you see an error such as "Failed to parse URL from ...tesseract-core.wasm", check that the file exists and that the path resolves to a valid `file://` URL. Our `ocr.js` config uses `pathToFileURL` to set the `corePath` for this reason.
- If you prefer, install a system `tesseract-ocr` and use native bindings or other OCR libraries.

Note: This repository is a starting point; improve OCR pre-processing, add tests, and configure Vertex AI credentials before production.
