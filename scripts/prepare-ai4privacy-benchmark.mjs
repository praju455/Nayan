import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SAMPLE_COUNT = 2_000;
const DATASET_ID = "ai4privacy/pii-masking-300k";
const SOURCE_URL = "https://huggingface.co/datasets/ai4privacy/pii-masking-300k/resolve/main/data/validation/1english_openpii_8k.jsonl";
const root = new URL("../", import.meta.url).pathname;
const outputPath = join(root, "shared/eval/external/ai4privacy-pii-masking/validation-english-2000.json");
const metadataPath = join(root, "shared/eval/external/ai4privacy-pii-masking/metadata.json");

if (!process.argv.includes("--accept-license") || process.env.NAYAN_AI4PRIVACY_LICENSE_APPROVED !== "1") {
  throw new Error(
    "AI4Privacy is local-only benchmark data. After your team has reviewed and obtained any required approval, rerun with NAYAN_AI4PRIVACY_LICENSE_APPROVED=1 npm run benchmark:ai4privacy.",
  );
}

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

function toFixture(record) {
  if (typeof record.source_text !== "string" || !Array.isArray(record.privacy_mask)) {
    throw new Error(`Unexpected ${DATASET_ID} record format.`);
  }

  const spans = record.privacy_mask.map((mask) => {
    if (
      typeof mask.value !== "string"
      || !Number.isInteger(mask.start)
      || !Number.isInteger(mask.end)
      || typeof mask.label !== "string"
      || mask.start < 0
      || mask.end <= mask.start
      || record.source_text.slice(mask.start, mask.end) !== mask.value
    ) {
      throw new Error(`Invalid labelled PII span in record ${record.id ?? "unknown"}.`);
    }
    return { start: mask.start, end: mask.end, label: mask.label };
  });

  return {
    sourceId: String(record.id ?? ""),
    language: String(record.language ?? "unknown"),
    text: record.source_text,
    spans,
  };
}

async function readJsonLines(url, onRecord) {
  const response = await fetch(url, { headers: { Accept: "application/jsonl, text/plain" } });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the approved AI4Privacy validation file (${response.status}).`);
  }

  const decoder = new TextDecoder();
  let remainder = "";
  for await (const chunk of response.body) {
    const lines = (remainder + decoder.decode(chunk, { stream: true })).split("\n");
    remainder = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onRecord(JSON.parse(line));
    }
  }
  const finalLine = remainder + decoder.decode();
  if (finalLine.trim()) onRecord(JSON.parse(finalLine));
}

const random = seededRandom(26_171);
const reservoir = [];
let seen = 0;

await readJsonLines(SOURCE_URL, (record) => {
  const fixture = toFixture(record);
  seen += 1;
  if (reservoir.length < SAMPLE_COUNT) {
    reservoir.push(fixture);
    return;
  }
  const replacement = Math.floor(random() * seen);
  if (replacement < SAMPLE_COUNT) reservoir[replacement] = fixture;
});

if (reservoir.length !== SAMPLE_COUNT) {
  throw new Error(`Expected at least ${SAMPLE_COUNT} records but found ${reservoir.length}.`);
}

reservoir.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
const fixture = {
  schemaVersion: "1.0",
  dataset: DATASET_ID,
  split: "validation",
  sourceUrl: SOURCE_URL,
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
    sourceUrl: SOURCE_URL,
    split: "validation",
    samples: SAMPLE_COUNT,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    createdAt: new Date().toISOString(),
    notice: "Local-only benchmark artifact. Do not commit, redistribute, or upload this file.",
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${SAMPLE_COUNT} labelled AI4Privacy samples to ${outputPath}.`);
