# Architecture decisions

## ADR-001: Privacy boundary is enforced in types and runtime

`LocalRawFrame` is branded as local-only and never appears in a transport API. The payload guard independently rejects raw-artifact keys and detected plaintext PII before a request is created. This supports the SIH privacy, redaction, and safety criteria.

## ADR-002: DOM-first with local visual escalation

Nayan uses DOM/ARIA semantics for exact web control identity. Local visual inference is an additive path for canvas, image, and non-semantic visual content; inability to run a model never enables raw-upload fallback.

## ADR-003: Browser is the final authority

The server returns one constrained action. The extension verifies current-page state, target compatibility, token availability, and confirmation policy before DOM execution.

## ADR-004: Transformers.js NER is optional, local, and separately provisioned

The extension uses Transformers.js as the browser inference interface for a quantized ONNX named-entity-recognition model. It is an enhancement for person-name detection, not a substitute for deterministic PII and DOM recognizers. The model and browser-only ONNX runtime are prepared as local extension assets; remote model loading is disabled before inference. Keeping this runtime outside the always-on service-worker bundle prevents optional ML code from inflating the base extension. If the asset, WebGPU, or WASM runtime is unavailable, Nayan continues with local deterministic detection or fails a privacy-sensitive action safely; it never sends text to a hosted model as a fallback.
