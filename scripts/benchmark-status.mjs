import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const registryPath = join(root, "shared/eval/dataset-registry.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));

let ready = 0;
for (const dataset of registry.datasets) {
  const localPath = join(root, dataset.localDirectory);
  const isPresent = await access(localPath).then(() => true).catch(() => false);
  if (isPresent) ready++;
  console.log(`${isPresent ? "READY" : "PENDING"}  ${dataset.id}\n  target: ${dataset.target}\n  source: ${dataset.source}`);
}

console.log(`\n${ready}/${registry.datasets.length} local benchmark directories present.`);
console.log("Review every external dataset licence before download. Raw real-web captures must stay outside Git.");
