import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const DATASET_ID = "GroundCUA";
const SAMPLE_COUNT = 300;
const APPS_TO_SAMPLE = 30;
const SAMPLES_PER_APP = SAMPLE_COUNT / APPS_TO_SAMPLE;
const SEED = 26_171;
const root = new URL("../", import.meta.url).pathname;
const datasetRoot = join(root, "shared/eval/external/groundcua");
const annotationsRoot = join(datasetRoot, "source/annotations");
const imagesRoot = join(datasetRoot, "source/images");
const outputPath = join(datasetRoot, "groundcua-300-manifest.json");
const metadataPath = join(datasetRoot, "metadata.json");
const SOURCE_REVISION = "5d6845b0116029d46ec762e734701c5b8ce207c3";
const treeRoot = `https://huggingface.co/api/datasets/ServiceNow/GroundCUA/tree/${SOURCE_REVISION}`;
const resolveRoot = `https://huggingface.co/datasets/ServiceNow/GroundCUA/resolve/${SOURCE_REVISION}`;

if (!process.argv.includes("--confirm-research-use") || process.env.NAYAN_GROUNDCUA_RESEARCH_USE_CONFIRMED !== "1") {
  throw new Error(
    "GroundCUA is research/educational benchmark data. After confirming your intended use complies with its terms, rerun with NAYAN_GROUNDCUA_RESEARCH_USE_CONFIRMED=1 npm run benchmark:groundcua.",
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

function stringSeed(value) {
  let hash = SEED;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 0x45d9f3b);
  return hash >>> 0;
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchResponse(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`GroundCUA request failed (${response.status}) for ${url}.`);
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(`GroundCUA request retries unexpectedly exhausted for ${url}.`);
}

async function listTree(path) {
  const items = [];
  let url = `${treeRoot}/${encodePath(path)}?recursive=false&expand=false&limit=1000`;
  while (url) {
    const response = await fetchResponse(url);
    items.push(...await response.json());
    const link = response.headers.get("link") ?? "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next?.[1] ?? "";
  }
  return items;
}

async function fetchJson(path) {
  return (await fetchResponse(`${resolveRoot}/${encodePath(path)}`)).json();
}

async function download(path, destination) {
  const response = await fetchResponse(`${resolveRoot}/${encodePath(path)}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function validTarget(annotation) {
  if (!annotation || typeof annotation.text !== "string" || !annotation.text.trim()) return false;
  if (!Array.isArray(annotation.bbox) || annotation.bbox.length !== 4 || !annotation.bbox.every(Number.isFinite)) return false;
  const [x1, y1, x2, y2] = annotation.bbox;
  return x2 > x1 && y2 > y1 && annotation.text.trim().length <= 120;
}

function chooseTarget(annotations) {
  const candidates = annotations.filter(validTarget);
  // Prefer labels a user can plausibly locate and act on, while retaining every label in the local source JSON.
  return candidates.find((item) => /button|menu|navigation|sidebar|input|field|tab|toolbar/i.test(item.category ?? ""))
    ?? candidates[0]
    ?? null;
}

const apps = (await listTree("data"))
  .filter((item) => item.type === "directory" && typeof item.path === "string")
  .map((item) => item.path.slice("data/".length))
  .sort((left, right) => left.localeCompare(right));
if (apps.length < APPS_TO_SAMPLE) throw new Error(`GroundCUA has only ${apps.length} application folders; expected at least ${APPS_TO_SAMPLE}.`);

const random = seededRandom(SEED);
const appOrder = shuffled(apps, random);

async function samplesForApp(app) {
  const files = (await listTree(`data/${app}`))
    .filter((item) => item.type === "file" && item.path.endsWith(".json"))
    .map((item) => item.path)
    .sort((left, right) => left.localeCompare(right));
  const appRandom = seededRandom(stringSeed(app));
  const firstPass = reservoir(files, Math.min(files.length, Math.max(SAMPLES_PER_APP * 4, 40)), appRandom);
  const parsed = await mapPool(firstPass, 3, async (annotationPath) => {
    try {
      const annotations = await fetchJson(annotationPath);
      const target = chooseTarget(annotations);
      return target ? { annotationPath, annotations, target } : null;
    } catch {
      return null;
    }
  });
  const usable = parsed.filter(Boolean);
  return usable.length >= SAMPLES_PER_APP
    ? reservoir(usable, SAMPLES_PER_APP, seededRandom(stringSeed(`${app}:targets`))).map((sample) => ({ app, ...sample }))
    : null;
}

const selected = [];
const selectedApps = [];
for (const app of appOrder) {
  const samples = await samplesForApp(app);
  if (!samples) {
    console.log(`Skipping ${app}: fewer than ${SAMPLES_PER_APP} usable labels in the deterministic candidate set.`);
    continue;
  }
  selected.push(...samples);
  selectedApps.push(app);
  console.log(`Selected ${selectedApps.length}/${APPS_TO_SAMPLE} applications: ${app}`);
  if (selectedApps.length === APPS_TO_SAMPLE) break;
}

if (selected.length !== SAMPLE_COUNT) throw new Error(`Expected ${SAMPLE_COUNT} selected screenshots from ${APPS_TO_SAMPLE} applications but found ${selected.length} from ${selectedApps.length}.`);

await mapPool(selected, 4, async (sample) => {
  const imagePath = sample.target.image_path;
  if (typeof imagePath !== "string" || !imagePath.endsWith(".png") || imagePath.includes("..")) {
    throw new Error(`Invalid GroundCUA image path for ${sample.annotationPath}.`);
  }
  const annotationDestination = join(annotationsRoot, sample.annotationPath.slice("data/".length));
  const imageDestination = join(imagesRoot, imagePath);
  await Promise.all([
    mkdir(dirname(annotationDestination), { recursive: true }).then(() => writeFile(annotationDestination, `${JSON.stringify(sample.annotations, null, 2)}\n`, "utf8")),
    download(`images/${imagePath}`, imageDestination),
  ]);
  sample.localAnnotation = relative(root, annotationDestination);
  sample.localImage = relative(root, imageDestination);
});

const fixture = {
  schemaVersion: "1.0",
  dataset: DATASET_ID,
  split: "published screenshot annotations",
  sampling: { method: "deterministic stratified reservoir", seed: SEED, applications: APPS_TO_SAMPLE, perApplication: SAMPLES_PER_APP, count: SAMPLE_COUNT },
  samples: selected.map(({ app, annotationPath, target, localAnnotation, localImage }) => ({
    app,
    sourceAnnotation: annotationPath,
    localAnnotation,
    localImage,
    instruction: `Locate the labelled UI element: ${target.text.trim()}`,
    target: { text: target.text.trim(), category: target.category ?? "unknown", bbox: target.bbox, id: target.id ?? null },
  })).sort((left, right) => left.localImage.localeCompare(right.localImage)),
};
const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized, "utf8");
await writeFile(metadataPath, `${JSON.stringify({
  dataset: DATASET_ID,
  source: "ServiceNow/GroundCUA",
  sourceRevision: SOURCE_REVISION,
  samples: SAMPLE_COUNT,
  applications: selectedApps,
  sha256: createHash("sha256").update(serialized).digest("hex"),
  createdAt: new Date().toISOString(),
  notice: "Local-only research benchmark artifact. Do not commit, redistribute, or upload source screenshots or annotations.",
}, null, 2)}\n`, "utf8");

console.log(`Wrote ${SAMPLE_COUNT} labelled GroundCUA screenshot/action samples to ${outputPath}.`);
