import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const SAMPLE_COUNT = 500;
const DATASET_ID = "WIDER FACE";
const root = new URL("../", import.meta.url).pathname;
const sourceRoot = process.env.NAYAN_WIDER_FACE_SOURCE_DIR
  ? new URL(process.env.NAYAN_WIDER_FACE_SOURCE_DIR, `file://${root}`).pathname
  : join(root, "shared/eval/external/wider-face/source");
const imagesRoot = join(sourceRoot, "WIDER_val/images");
const annotationPath = join(sourceRoot, "wider_face_split/wider_face_val_bbx_gt.txt");
const outputPath = join(root, "shared/eval/external/wider-face/validation-500-manifest.json");
const metadataPath = join(root, "shared/eval/external/wider-face/metadata.json");

if (!process.argv.includes("--accept-license") || process.env.NAYAN_WIDER_FACE_LICENSE_APPROVED !== "1") {
  throw new Error(
    "WIDER FACE is local-only benchmark data. After your team has reviewed the licence, rerun with NAYAN_WIDER_FACE_LICENSE_APPROVED=1 npm run benchmark:wider-face.",
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

function parseAnnotationRows(contents) {
  const lines = contents.split(/\r?\n/);
  const samples = [];
  let index = 0;
  while (index < lines.length) {
    const filename = lines[index++].trim();
    if (!filename) continue;
    const count = Number.parseInt(lines[index++]?.trim() ?? "", 10);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Invalid face count for ${filename}.`);
    }
    const faces = [];
    for (let faceIndex = 0; faceIndex < count; faceIndex += 1) {
      const parts = (lines[index++] ?? "").trim().split(/\s+/).map(Number);
      const [x, y, width, height, blur, expression, illumination, invalid, occlusion, pose] = parts;
      if (parts.length < 10 || ![x, y, width, height].every(Number.isFinite)) {
        throw new Error(`Invalid face box for ${filename}.`);
      }
      if (width > 0 && height > 0 && invalid === 0) {
        faces.push({ x, y, width, height, blur, expression, illumination, occlusion, pose });
      }
    }
    if (faces.length > 0) samples.push({ filename, faces });
  }
  return samples;
}

await Promise.all([
  access(imagesRoot),
  access(annotationPath),
]).catch(() => {
  throw new Error(
    `Missing WIDER FACE source files. Extract WIDER_val.zip and wider_face_split.zip under ${sourceRoot} so WIDER_val/images and wider_face_split/wider_face_val_bbx_gt.txt exist.`,
  );
});

const eligible = parseAnnotationRows(await readFile(annotationPath, "utf8"));
if (eligible.length < SAMPLE_COUNT) {
  throw new Error(`Expected at least ${SAMPLE_COUNT} valid annotated images but found ${eligible.length}.`);
}

const random = seededRandom(26_171);
const selected = [];
for (let index = 0; index < eligible.length; index += 1) {
  const sample = eligible[index];
  if (selected.length < SAMPLE_COUNT) {
    selected.push(sample);
    continue;
  }
  const replacement = Math.floor(random() * (index + 1));
  if (replacement < SAMPLE_COUNT) selected[replacement] = sample;
}

selected.sort((left, right) => left.filename.localeCompare(right.filename));
const fixture = {
  schemaVersion: "1.0",
  dataset: DATASET_ID,
  split: "validation",
  imagesRoot: relative(root, imagesRoot),
  annotationFile: relative(root, annotationPath),
  sampling: { method: "deterministic-reservoir", seed: 26_171, count: SAMPLE_COUNT },
  samples: selected,
};
const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized, "utf8");
await writeFile(
  metadataPath,
  `${JSON.stringify({
    dataset: DATASET_ID,
    sourceDirectory: relative(root, sourceRoot),
    samples: SAMPLE_COUNT,
    totalAnnotatedFaces: selected.reduce((total, sample) => total + sample.faces.length, 0),
    sha256: createHash("sha256").update(serialized).digest("hex"),
    createdAt: new Date().toISOString(),
    notice: "Local-only benchmark artifact. Do not commit, redistribute, or upload images or annotations.",
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${SAMPLE_COUNT} labelled WIDER FACE samples to ${outputPath}.`);
