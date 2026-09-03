import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MINIMUM_CAPTURES = 50;
const MAXIMUM_CAPTURES = 100;
const root = new URL("../", import.meta.url).pathname;
const rawRoot = join(root, "shared/eval/real-web-raw");
const annotationsRoot = join(rawRoot, "annotations");
const outputPath = join(root, "shared/eval/results/real-web-validation.json");
const allowedActions = new Set(["click", "type", "select", "scroll", "navigate", "wait", "done", "confirmation_required"]);

function validBox(box) {
  return Array.isArray(box)
    && box.length === 4
    && box.every(Number.isFinite)
    && box[2] > 0
    && box[3] > 0;
}

function addCount(counts, value) {
  const key = value || "unknown";
  counts[key] = (counts[key] ?? 0) + 1;
}

await access(annotationsRoot).catch(() => {
  throw new Error(
    `No controlled real-web annotations found. Keep raw screenshots and their JSON labels only under ${rawRoot}; they are ignored by Git.`,
  );
});

const files = (await readdir(annotationsRoot)).filter((name) => name.endsWith(".json")).sort();
if (files.length < MINIMUM_CAPTURES || files.length > MAXIMUM_CAPTURES) {
  throw new Error(`Expected ${MINIMUM_CAPTURES}-${MAXIMUM_CAPTURES} annotated test-account captures, found ${files.length}.`);
}

const captureIds = new Set();
const applications = {};
const actionTypes = {};
const piiTypes = {};
let actions = 0;
let piiRegions = 0;
let faceRegions = 0;

for (const file of files) {
  const annotation = JSON.parse(await readFile(join(annotationsRoot, file), "utf8"));
  const label = file.replace(/\.json$/, "");
  if (annotation.schemaVersion !== "1.0" || typeof annotation.captureId !== "string" || annotation.captureId !== label || captureIds.has(annotation.captureId)) {
    throw new Error(`Invalid or duplicate capture ID in ${file}. The file name must match captureId.`);
  }
  captureIds.add(annotation.captureId);
  if (!annotation.provenance || annotation.provenance.accountType !== "test-only" || annotation.provenance.containsOnlySyntheticOrConsentedData !== true) {
    throw new Error(`${file} is not attested as a test-only capture containing only synthetic or consented data.`);
  }
  if (typeof annotation.provenance.application !== "string" || !annotation.provenance.application.trim() || typeof annotation.provenance.origin !== "string" || !/^https:\/\//.test(annotation.provenance.origin)) {
    throw new Error(`${file} must include an application name and HTTPS origin.`);
  }
  if (typeof annotation.screenshotPath !== "string" || !annotation.screenshotPath.startsWith("shared/eval/real-web-raw/") || annotation.screenshotPath.includes("..")) {
    throw new Error(`${file} has an invalid local screenshot path.`);
  }
  await access(join(root, annotation.screenshotPath)).catch(() => {
    throw new Error(`${file} references a screenshot that does not exist locally.`);
  });
  if (!Array.isArray(annotation.expectedActions) || annotation.expectedActions.length === 0) throw new Error(`${file} needs at least one expected action.`);
  for (const action of annotation.expectedActions) {
    if (!allowedActions.has(action.action) || typeof action.targetLabel !== "string" || !action.targetLabel.trim() || !validBox(action.bbox)) {
      throw new Error(`${file} has an invalid expected action.`);
    }
    actions += 1;
    addCount(actionTypes, action.action);
  }
  if (!Array.isArray(annotation.piiRegions) || !Array.isArray(annotation.faceRegions)) throw new Error(`${file} must contain piiRegions and faceRegions arrays.`);
  for (const region of annotation.piiRegions) {
    if (typeof region.type !== "string" || !validBox(region.bbox) || !["tokenize", "blackout", "blur"].includes(region.expectedMethod)) {
      throw new Error(`${file} has an invalid PII region.`);
    }
    piiRegions += 1;
    addCount(piiTypes, region.type);
  }
  for (const box of annotation.faceRegions) {
    if (!validBox(box)) throw new Error(`${file} has an invalid face region.`);
    faceRegions += 1;
  }
  addCount(applications, annotation.provenance.application.trim());
}

const report = {
  schemaVersion: "1.0",
  dataset: "nayan-real-web",
  status: "validated-local-only",
  captures: files.length,
  applications,
  expectedActions: { total: actions, byType: actionTypes },
  sensitiveRegions: { pii: piiRegions, byType: piiTypes, faces: faceRegions },
  privacyBoundary: "Raw screenshots and annotations remain under ignored shared/eval/real-web-raw. This report contains aggregate counts only.",
  annotationFileNameSha256: createHash("sha256").update(files.join("\n")).digest("hex"),
  createdAt: new Date().toISOString(),
};
await mkdir(join(root, "shared/eval/results"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Validated ${files.length} controlled real-web captures and wrote aggregate-only report to ${outputPath}.`);
