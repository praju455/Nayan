# Architecture decisions

## ADR-001: Privacy boundary is enforced in types and runtime

`LocalRawFrame` is branded as local-only and never appears in a transport API. The payload guard independently rejects raw-artifact keys and detected plaintext PII before a request is created. This supports the SIH privacy, redaction, and safety criteria.

## ADR-002: DOM-first with local visual escalation

Nayan uses DOM/ARIA semantics for exact web control identity. Local visual inference is an additive path for canvas, image, and non-semantic visual content; inability to run a model never enables raw-upload fallback.

## ADR-003: Browser is the final authority

The server returns one constrained action. The extension verifies current-page state, target compatibility, token availability, and confirmation policy before DOM execution.
