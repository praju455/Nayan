import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const manifest = JSON.parse(await readFile(join(root, "extension/models/model-manifest.json"), "utf8"));
let blocked = 0;

for (const model of manifest.models) {
  const contents = await readFile(join(root, model.path));
  const actual = createHash("sha256").update(contents).digest("hex");
  if (actual !== model.sha256) throw new Error(`Checksum mismatch: ${model.path}`);
  if (model.provenanceStatus !== "verified") blocked++;
  console.log(`${model.provenanceStatus.toUpperCase()}  ${model.path}`);
}

if (blocked) console.log(`\n${blocked} model(s) have verified integrity but incomplete source provenance; replace or document them before release.`);
