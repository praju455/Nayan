# Local NER model

Nayan can add local person-name recognition to its deterministic PII rules by using a quantized ONNX TinyBERT model. It is intentionally provisioned at build time rather than transmitted with browser data or fetched during a task.

Run this once before building the extension with NER enabled:

```bash
npm run prepare:ner --workspace=@nayan/extension
```

This creates `extension/public/models/ner/` from `onnx-community/TinyBERT-finetuned-NER-ONNX`. The preparation script uses its quantized ONNX file, adds the standard CoNLL-2003 label mapping needed by the source model, and stores the model only as an extension-local asset. Review the upstream model card and licence terms before redistributing a packaged build.

At runtime, `LocalNerBackend` sets Transformers.js to `allowRemoteModels = false`. It tries WebGPU first, then WASM; if the asset is absent or inference fails, it returns no NER matches and Nayan continues with deterministic PII recognizers and DOM/ARIA field policy. It never uploads text to make that fallback work.
