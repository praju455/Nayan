import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const piiFixtures = JSON.parse(await readFile(join(root, "shared/eval/datasets/pii.json"), "utf8"));
const visualFixtures = JSON.parse(await readFile(join(root, "shared/eval/datasets/visual-context.json"), "utf8"));
const redactionFixtures = JSON.parse(await readFile(join(root, "shared/eval/datasets/redaction.json"), "utf8"));
const rules = [
  ["EMAIL", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["PHONE", /(?<!\d)(?:\+91[ -]?)?[6-9]\d{9}(?!\d)/],
  ["CREDIT_CARD", /\b(?:\d[ -]?){13,19}\b/],
  ["PAN", /\b[A-Z]{5}\d{4}[A-Z]\b/],
  ["AADHAAR", /(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)/],
  ["IP_ADDRESS", /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/],
  ["DATE_OF_BIRTH", /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/],
  ["BANK_ACCOUNT", /(?<!\d)\d{9,18}(?!\d)/]
];
const luhn = (value) => { const digits = value.replace(/\D/g, ""); return digits.length >= 13 && [...digits].reverse().reduce((sum, digit, index) => { let number = Number(digit); if (index % 2) number = number > 4 ? number * 2 - 9 : number * 2; return sum + number; }, 0) % 10 === 0; };
const verhoeff = (value) => { const digits = value.replace(/\D/g, ""); const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]]; const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]; let checksum = 0; [...digits].reverse().forEach((digit, index) => { checksum = d[checksum][p[index % 8][Number(digit)]]; }); return digits.length === 12 && checksum === 0; };
const detected = (text) => { const values = rules.flatMap(([category, expression]) => { const match = text.match(expression); if (!match) return []; if (category === "CREDIT_CARD" && !luhn(match[0])) return []; if (category === "AADHAAR" && (!/aadhaar|aadhar/i.test(text) || !verhoeff(match[0]))) return []; return [category]; }); if (values.some((type) => ["PHONE", "CREDIT_CARD", "AADHAAR"].includes(type))) return values.filter((type) => type !== "BANK_ACCOUNT"); return values.filter((type, index) => values.indexOf(type) === index); };
let tp = 0; let fp = 0; let fn = 0;
for (const fixture of piiFixtures) { const actual = new Set(detected(fixture.text)); const expected = new Set(fixture.expected); for (const type of actual) expected.has(type) ? tp++ : fp++; for (const type of expected) if (!actual.has(type)) fn++; }
const precision = tp / (tp + fp || 1); const recall = tp / (tp + fn || 1); const visualAccuracy = visualFixtures.filter((fixture) => fixture.expected === fixture.predicted).length / visualFixtures.length;
const intersectionOverUnion = (left, right) => { const x1 = Math.max(left[0], right[0]); const y1 = Math.max(left[1], right[1]); const x2 = Math.min(left[2], right[2]); const y2 = Math.min(left[3], right[3]); const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1); const union = (left[2] - left[0]) * (left[3] - left[1]) + (right[2] - right[0]) * (right[3] - right[1]) - intersection; return union ? intersection / union : 0; };
let redactionTp = 0; let redactionFp = 0; let redactionFn = 0; let verificationPasses = 0;
for (const fixture of redactionFixtures) { const used = new Set(); let correct = 0; for (const produced of fixture.produced) { const expectedIndex = fixture.expected.findIndex((expected, index) => !used.has(index) && intersectionOverUnion(produced, expected) >= 0.9); if (expectedIndex >= 0) { used.add(expectedIndex); redactionTp++; correct++; } else redactionFp++; } redactionFn += fixture.expected.length - correct; if (correct === fixture.expected.length && fixture.produced.length === fixture.expected.length) verificationPasses++; }
const redactionPrecision = redactionTp / (redactionTp + redactionFp || 1); const redactionRecall = redactionTp / (redactionTp + redactionFn || 1);
const bytesFor = async (files) => (await Promise.all(files.map(async (file) => {
  try { return (await stat(join(root, file))).size; } catch { return 0; }
}))).reduce((sum, bytes) => sum + bytes, 0);
const coreFiles = ["extension/public/models/mobilenetv3_small.onnx", "extension/public/models/ultraface-rfb-320.onnx", "extension/public/ort/ort-wasm-simd-threaded.wasm", "extension/public/ocr/eng.traineddata.gz", "extension/public/ocr/tesseract-core-simd-lstm.wasm.js", "extension/public/ocr/worker.min.js"];
const nerFiles = ["extension/public/models/ner/config.json", "extension/public/models/ner/tokenizer.json", "extension/public/models/ner/tokenizer_config.json", "extension/public/models/ner/special_tokens_map.json", "extension/public/models/ner/vocab.txt", "extension/public/models/ner/onnx/model_quantized.onnx", "extension/public/models/ner-runtime/transformers.web.min.mjs", "extension/public/models/ner-runtime/ort.webgpu.mjs", "extension/public/models/ner-runtime/ort-wasm-simd-threaded.asyncify.mjs", "extension/public/models/ner-runtime/ort-wasm-simd-threaded.asyncify.wasm"];
const coreRuntimeBytes = await bytesFor(coreFiles); const nerRuntimeBytes = await bytesFor(nerFiles);
const timings = [];
for (let repeat = 0; repeat < 100; repeat++) {
  for (const fixture of piiFixtures) { const start = performance.now(); detected(fixture.text); timings.push(performance.now() - start); }
}
timings.sort((left, right) => left - right);
const medianPiiFixtureScanMs = timings[Math.floor(timings.length / 2)] ?? 0;
const result = { generatedAt: new Date().toISOString(), source: "synthetic labelled fixtures", metrics: { visualContextAccuracy: visualAccuracy, piiPrecision: precision, piiRecall: recall, piiF1: 2 * precision * recall / (precision + recall || 1), redactionPrecision, redactionRecall, redactionVerificationPassRate: verificationPasses / redactionFixtures.length, localCoreRuntimeBytes: coreRuntimeBytes, localNerRuntimeBytes: nerRuntimeBytes, localRuntimeBytes: coreRuntimeBytes + nerRuntimeBytes, medianPiiFixtureScanMs }, counts: { piiTruePositives: tp, piiFalsePositives: fp, piiFalseNegatives: fn, redactionTruePositives: redactionTp, redactionFalsePositives: redactionFp, redactionFalseNegatives: redactionFn, visualFixtures: visualFixtures.length, redactionFixtures: redactionFixtures.length, piiFixtureSamples: timings.length } };
await writeFile(join(root, "shared/eval/results/latest.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
