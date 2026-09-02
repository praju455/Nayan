import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SAMPLE_COUNT = 2_000;
const PAGE_SIZE = 100;
const DATASET_ID = "gretelai/synthetic_pii_finance_multilingual";
const DATASET_URL = `https://huggingface.co/datasets/${DATASET_ID}`;
const API_URL = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET_ID)}&config=default&split=test`;
const root = new URL("../", import.meta.url).pathname;
const outputPath = join(root, "shared/eval/external/gretel-pii/held-out-2000.json");
const metadataPath = join(root, "shared/eval/external/gretel-pii/metadata.json");

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

async function fetchPage(offset) {
  const response = await fetch(`${API_URL}&offset=${offset}&length=${PAGE_SIZE}`);
  if (!response.ok) throw new Error(`Could not read Gretel test data (${response.status}).`);
  const payload = await response.json();
  if (!Array.isArray(payload.rows) || !Number.isInteger(payload.num_rows_total)) {
    throw new Error("Unexpected Gretel dataset-server response.");
  }
  return payload;
}

function toFixture(row) {
  const record = row.row;
  if (typeof record?.generated_text !== "string" || typeof record.pii_spans !== "string") return null;
  let parsedSpans;
  try {
    parsedSpans = JSON.parse(record.pii_spans);
  } catch {
    return null;
  }
  if (!Array.isArray(parsedSpans)) return null;
  const spans = parsedSpans.map((span) => {
    if (
      !Number.isInteger(span.start)
      || !Number.isInteger(span.end)
      || typeof span.label !== "string"
      || span.start < 0
      || span.end <= span.start
      || span.end > record.generated_text.length
    ) {
      return null;
    }
    return { start: span.start, end: span.end, label: span.label };
  });
  if (spans.length === 0 || spans.some((span) => span === null)) return null;
  return {
    sourceId: String(record.index ?? row.row_idx),
    language: String(record.language ?? "unknown"),
    documentType: String(record.document_type ?? "unknown"),
    text: record.generated_text,
    spans,
  };
}

const firstPage = await fetchPage(0);
const random = seededRandom(26_171);
const reservoir = [];
let eligibleRows = 0;
let excludedRows = 0;

for (let offset = 0; offset < firstPage.num_rows_total; offset += PAGE_SIZE) {
  const page = offset === 0 ? firstPage : await fetchPage(offset);
  for (const row of page.rows) {
    const sample = toFixture(row);
    if (!sample) {
      excludedRows += 1;
      continue;
    }
    eligibleRows += 1;
    if (reservoir.length < SAMPLE_COUNT) {
      reservoir.push(sample);
      continue;
    }
    const replacement = Math.floor(random() * eligibleRows);
    if (replacement < SAMPLE_COUNT) reservoir[replacement] = sample;
  }
}

if (reservoir.length !== SAMPLE_COUNT) {
  throw new Error(`Expected ${SAMPLE_COUNT} labelled PII samples but found ${reservoir.length}.`);
}

reservoir.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
const fixture = {
  schemaVersion: "1.0",
  dataset: DATASET_ID,
  split: "test",
  sourceUrl: DATASET_URL,
  licence: "Apache-2.0",
  sampling: { method: "deterministic-reservoir", seed: 26_171, count: SAMPLE_COUNT },
  samples: reservoir,
};
const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized, "utf8");
await writeFile(
  metadataPath,
  `${JSON.stringify({
    dataset: DATASET_ID,
    sourceUrl: DATASET_URL,
    split: "test",
    licence: "Apache-2.0",
    sourceRows: firstPage.num_rows_total,
    eligibleRows,
    excludedRows,
    samples: SAMPLE_COUNT,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    createdAt: new Date().toISOString(),
    notice: "Local-only benchmark artifact. Do not commit personal data or upload fixtures to a planner.",
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${SAMPLE_COUNT} labelled PII samples to ${outputPath}.`);
