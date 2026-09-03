import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DATASET_ID = "OSWorld";
const SAMPLE_COUNT = 40;
const SEED = 26_171;
const REPOSITORY = "xlang-ai/OSWorld";
const root = new URL("../", import.meta.url).pathname;
const outputPath = join(root, "shared/eval/external/osworld/chrome-workflows-40.json");
const metadataPath = join(root, "shared/eval/external/osworld/metadata.json");

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

function reservoir(items, count, random) {
  const selected = [];
  for (let index = 0; index < items.length; index += 1) {
    if (selected.length < count) selected.push(items[index]);
    else {
      const replacement = Math.floor(random() * (index + 1));
      if (replacement < count) selected[replacement] = items[index];
    }
  }
  return selected;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`OSWorld request failed (${response.status}) for ${url}.`);
  return response.json();
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

const repository = await fetchJson(`https://api.github.com/repos/${REPOSITORY}`);
const revision = repository.default_branch
  ? (await fetchJson(`https://api.github.com/repos/${REPOSITORY}/commits/${repository.default_branch}`)).sha
  : null;
if (!revision) throw new Error("Could not resolve the OSWorld source revision.");

const taskIndex = await fetchJson(`https://raw.githubusercontent.com/${REPOSITORY}/${revision}/evaluation_examples/test_all.json`);
const chromeTaskIds = Array.isArray(taskIndex.chrome) ? [...taskIndex.chrome].sort((left, right) => left.localeCompare(right)) : [];
if (chromeTaskIds.length < SAMPLE_COUNT) throw new Error(`OSWorld provides only ${chromeTaskIds.length} Chrome tasks; expected at least ${SAMPLE_COUNT}.`);

const selectedIds = reservoir(chromeTaskIds, SAMPLE_COUNT, seededRandom(SEED)).sort((left, right) => left.localeCompare(right));
const tasks = await mapPool(selectedIds, 6, async (id) => {
  const task = await fetchJson(`https://raw.githubusercontent.com/${REPOSITORY}/${revision}/evaluation_examples/examples/chrome/${id}.json`);
  if (task.id !== id || typeof task.instruction !== "string" || !task.instruction.trim()) {
    throw new Error(`Invalid OSWorld Chrome task ${id}.`);
  }
  return {
    id,
    instruction: task.instruction.trim(),
    relatedApps: task.related_apps ?? [],
    evaluator: { function: task.evaluator?.func ?? null, resultType: task.evaluator?.result?.type ?? null },
    proxyRequired: Boolean(task.proxy),
    fixedIpRequired: Boolean(task.fixed_ip),
    environmentChange: task.possibility_of_env_change ?? "unknown",
  };
});

const fixture = {
  schemaVersion: "1.0",
  dataset: DATASET_ID,
  sourceRevision: revision,
  split: "Chrome task specifications",
  sampling: { method: "deterministic reservoir", seed: SEED, count: SAMPLE_COUNT },
  executionBoundary: "Specifications only. Execute only in an official OSWorld isolated desktop environment; this importer does not download or start a VM.",
  tasks,
};
const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized, "utf8");
await writeFile(metadataPath, `${JSON.stringify({
  dataset: DATASET_ID,
  repository: `https://github.com/${REPOSITORY}`,
  sourceRevision: revision,
  tasks: SAMPLE_COUNT,
  sha256: createHash("sha256").update(serialized).digest("hex"),
  createdAt: new Date().toISOString(),
  notice: "Local-only workflow specification artifact. An isolated OSWorld desktop/VM is required before execution.",
}, null, 2)}\n`, "utf8");

console.log(`Wrote ${SAMPLE_COUNT} curated OSWorld Chrome workflow specifications to ${outputPath}.`);
