import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = dirname(fileURLToPath(import.meta.url));
const output = join(repository, "../extension/public/models/ner");
const runtimeOutput = join(repository, "../extension/public/models/ner-runtime");
const source = "https://huggingface.co/onnx-community/TinyBERT-finetuned-NER-ONNX/resolve/main/";
const files = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt", "onnx/model_quantized.onnx"];
const coNllLabels = { "0": "O", "1": "B-PER", "2": "I-PER", "3": "B-ORG", "4": "I-ORG", "5": "B-LOC", "6": "I-LOC", "7": "B-MISC", "8": "I-MISC" };

await mkdir(join(output, "onnx"), { recursive: true });
for (const file of files) {
  const response = await fetch(`${source}${file}`);
  if (!response.ok) throw new Error(`Could not download the local NER asset: ${file}`);
  const destination = join(output, file);
  if (file === "config.json") {
    const config = await response.json();
    config.id2label = coNllLabels;
    config.label2id = Object.fromEntries(Object.entries(coNllLabels).map(([id, label]) => [label, Number(id)]));
    await writeFile(destination, `${JSON.stringify(config, null, 2)}\n`);
  } else {
    await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
  }
}

// The Web-only Transformers.js entry point is kept as a runtime asset. WXT
// must not bundle it into the service worker, otherwise optional NER pulls
// unused Node/ORT variants into every install. Patch its one package import to
// the colocated browser-only ONNX Runtime asset.
await mkdir(runtimeOutput, { recursive: true });
const transformersSource = await readFile(
  join(repository, "../node_modules/@huggingface/transformers/dist/transformers.web.min.js"),
  "utf8"
);
const patchedSource = transformersSource.replace(
  /from["']onnxruntime-web\/webgpu["']/,
  'from"./ort.webgpu.mjs"'
);
if (patchedSource === transformersSource) {
  throw new Error("Could not prepare the browser-only Transformers.js runtime import.");
}
await writeFile(join(runtimeOutput, "transformers.web.min.mjs"), patchedSource);
for (const file of [
  "ort.webgpu.mjs",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm"
]) {
  await copyFile(
    join(repository, "../node_modules/onnxruntime-web/dist", file),
    join(runtimeOutput, file)
  );
}

console.log("Prepared packaged local TinyBERT NER and browser-only Transformers.js runtime assets.\n");
