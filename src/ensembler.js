import { MODEL_WEIGHTS } from './config.js';
const DEFAULT_WEIGHTS = MODEL_WEIGHTS;

// Create a normalizer function that maps any label variant to the canonical label
function createLabelNormalizer(options) {
  // Build a map of all possible label variations to the canonical label
  const labelMap = new Map();
  
  for (const option of options) {
    const canonicalLabel = option.label;
    const text = option.text?.toLowerCase().trim();
    
    // Map the canonical label to itself
    labelMap.set(canonicalLabel, canonicalLabel);
    labelMap.set(canonicalLabel.toLowerCase(), canonicalLabel);
    
    // Map common variations (e.g., if canonical is "1", also accept "A", "a", etc.)
    // Map by index position (1st option can be "1", "A", "a", etc.)
    const index = options.indexOf(option);
    const numberLabel = String(index + 1);
    const letterLabel = String.fromCharCode(65 + index); // A, B, C, ...
    const lowerLetterLabel = String.fromCharCode(97 + index); // a, b, c, ...
    
    labelMap.set(numberLabel, canonicalLabel);
    labelMap.set(letterLabel, canonicalLabel);
    labelMap.set(lowerLetterLabel, canonicalLabel);
    
    // Also map by text content for robustness
    if (text) {
      labelMap.set(text, canonicalLabel);
    }
  }
  
  // Return a function that normalizes any label to the canonical form
  return (label) => {
    if (!label) return null;
    const normalized = labelMap.get(label) || labelMap.get(label.toLowerCase()) || labelMap.get(label.trim());
    return normalized || label; // fallback to original if no match
  };
}

export function ensembleResponses(question, modelResponses, weights = DEFAULT_WEIGHTS, threshold = 0.25) {
  // modelResponses: [{model, parsed: {selected_options:[], confidence:...}}, ...]
  const optionScores = {}; // { 'A': total_weight }
  const perModel = [];
  let totalModelWeight = 0;
  let weightedConfidenceSum = 0;
  
  // Create a map to normalize option labels: map all possible labels to the canonical label from question.options
  const labelNormalizer = createLabelNormalizer(question.options);
  
  for (const r of modelResponses) {
    if (r.error) {
      perModel.push({ model: r.model, error: r.error });
      continue;
    }
    const parsed = r.parsed;
    if (!parsed) {
      perModel.push({ model: r.model, raw: r.text, parsed: null });
      continue;
    }
    const w = weights[r.model] || 0.15;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    
    totalModelWeight += w;
    weightedConfidenceSum += w * confidence;
    
    // Normalize each selected option before scoring
    const normalizedOptions = [];
    for (const opt of parsed.selected_options || []) {
      const normalized = labelNormalizer(opt);
      if (normalized) {
        optionScores[normalized] = (optionScores[normalized] || 0) + w;
        normalizedOptions.push(normalized);
      } else {
        console.log(`⚠ Could not normalize option "${opt}" for model ${r.model}`);
      }
    }
    perModel.push({ model: r.model, selected_options: normalizedOptions, confidence, reasoning: parsed.reasoning || '' });
  }

  // Select options that have enough weighted support
  const maxScore = Math.max(...Object.values(optionScores), 0);
  let winners = Object.entries(optionScores)
    .filter(([k, score]) => score >= threshold * totalModelWeight)
    .map(([k]) => k);
  
  if (!winners || winners.length === 0) {
    // choose argmax
    const arr = Object.entries(optionScores);
    if (arr.length === 0) winners = [];
    else winners = [arr.reduce((a,b) => a[1] > b[1] ? a : b)[0]];
  }
  
  // Final confidence = weighted average of all model confidences that contributed
  const finalConfidence = totalModelWeight > 0 ? weightedConfidenceSum / totalModelWeight : 0;
  
  // Keep probabilities for debugging
  const total = Object.values(optionScores).reduce((a,b) => a+b, 0) || 1;
  const probabilities = Object.fromEntries(Object.entries(optionScores).map(([k,v]) => [k, v/total]));

  return {
    question: question.question,
    question_id: question.id,
    options: question.options,
    selected_options: winners,
    final_confidence: finalConfidence,
    probabilities,
    per_model: perModel,
    ambiguous: winners.length > 1
  };
}
