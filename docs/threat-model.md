# Threat model

Nayan assumes webpage content can be malicious and the planning service can make mistakes. The browser is the final authority.

| Threat | Mitigation |
| --- | --- |
| Raw screen or DOM leakage | Local-only raw types, separately constructed safe artifact, key/value payload guard, regression tests |
| PII in task, forms, or OCR | Local deterministic recognition, DOM sensitivity rules, task tokenization, final rescan |
| Face or canvas/image PII | Local ONNX face detection, selective visual path, blur redactions |
| Token exfiltration | Task-scoped in-memory vault; only opaque placeholders reach server |
| Prompt injection on page | Page content labelled untrusted; injection markers surface in server context; actions are schema constrained |
| Unsafe action or stale target | Server validator, then client validator immediately before DOM execution |
| Unsafe navigation/submission | Confirmation gates; server does not run page JavaScript |
| Model, network, or policy failure | Task fails locally; no raw fallback |
| Telemetry/debug leakage | Content is never included in telemetry contracts |
