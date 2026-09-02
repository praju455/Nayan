import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const fixturePath = join(root, "shared/eval/external/gretel-pii/held-out-2000.json");
const outputPath = join(root, "shared/eval/results/gretel-pii.json");
const labelMap = new Map([
  ["email", "EMAIL"],
  ["phone_number", "PHONE"],
  ["credit_card_number", "CREDIT_CARD"],
  ["ipv4", "IP_ADDRESS"],
  ["date_of_birth", "DATE_OF_BIRTH"],
]);
const rules = [
  ["EMAIL", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["PHONE", /(?<!\d)(?:\+91[ -]?)?[6-9]\d{9}(?!\d)/g],
  ["CREDIT_CARD", /\b(?:\d[ -]?){13,19}\b/g, luhnValid],
  ["IP_ADDRESS", /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g],
  ["DATE_OF_BIRTH", /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/g],
];

function luhnValid(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || /^0+$/.test(digits)) return false;
  return [...digits].reverse().reduce((sum, digit, index) => {
    let number = Number(digit);
    if (index % 2) number = number > 4 ? number * 2 - 9 : number * 2;
    return sum + number;
  }, 0) % 10 === 0;
}

function recognizeScopedPii(text) {
  const matches = [];
  for (const [category, expression, verify] of rules) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      if (!verify || verify(match[0])) matches.push({ category, start: match.index, end: match.index + match[0].length });
    }
  }
  return matches.sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((match, index, all) => index === 0 || match.start >= all[index - 1].end);
}

function overlapsEnough(left, right) {
  const overlap = Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
  return overlap / Math.max(1, Math.max(left.end - left.start, right.end - right.start)) >= 0.8;
}

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
if (!Array.isArray(fixture.samples) || fixture.dataset !== "gretelai/synthetic_pii_finance_multilingual") {
  throw new Error("Missing or invalid Gretel local benchmark. Run npm run benchmark:pii first.");
}

let truePositives = 0;
let falsePositives = 0;
let falseNegatives = 0;
let scopedExpected = 0;
const byCategory = Object.fromEntries([...new Set(labelMap.values())].map((category) => [category, { expected: 0, truePositives: 0, falsePositives: 0, falseNegatives: 0 }]));
for (const sample of fixture.samples) {
  const expected = sample.spans
    .map((span) => ({ ...span, category: labelMap.get(span.label) }))
    .filter((span) => span.category);
  const predicted = recognizeScopedPii(sample.text);
  const used = new Set();
  scopedExpected += expected.length;
  for (const target of expected) byCategory[target.category].expected += 1;
  for (const found of predicted) {
    const matchIndex = expected.findIndex((target, index) => !used.has(index) && target.category === found.category && overlapsEnough(target, found));
    if (matchIndex >= 0) {
      used.add(matchIndex);
      truePositives += 1;
      byCategory[found.category].truePositives += 1;
    } else {
      falsePositives += 1;
      byCategory[found.category].falsePositives += 1;
    }
  }
  for (const [index, target] of expected.entries()) {
    if (!used.has(index)) {
      falseNegatives += 1;
      byCategory[target.category].falseNegatives += 1;
    }
  }
}

const precision = truePositives / (truePositives + falsePositives || 1);
const recall = truePositives / (truePositives + falseNegatives || 1);
const result = {
  generatedAt: new Date().toISOString(),
  source: "Gretel Synthetic PII Finance Multilingual — local 2,000-sample test fixture",
  scope: "Character-span evaluation for labels mapped to Nayan's current local regex recognizer: email, phone_number, credit_card_number, ipv4, and date_of_birth.",
  metrics: {
    piiPrecision: precision,
    piiRecall: recall,
    piiF1: (2 * precision * recall) / (precision + recall || 1),
  },
  counts: {
    samples: fixture.samples.length,
    scopedExpectedSpans: scopedExpected,
    truePositives,
    falsePositives,
    falseNegatives,
  },
  byCategory,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
