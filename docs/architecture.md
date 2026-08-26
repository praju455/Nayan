# Architecture

Nayan makes a hard distinction between local raw artifacts and network-safe artifacts.

```text
Extension background             Content script
────────────────────             ──────────────
visible-tab capture              DOM/ARIA semantic tree
local ONNX classifier            canvas-only selective OCR
local face detector              safe DOM execution
            ╲                    ╱
              scene fusion
                   ↓
             privacy engine
   deterministic PII + policy + token vault
                   ↓
       new sanitized visual/context artifact
                   ↓
           final payload guard
                   ↓
═══════ browser/server boundary ═══════
                   ↓
FastAPI schema gate → context builder → planner → action validator
                   ↓
browser action validator → confirmation gate → DOM action → recapture
```

`LocalRawFrame` is local-only and transport does not accept it. `SanitizedContextPackage` carries only structured element identity, roles, placeholder text, redaction metadata, confidence, and optional already-redacted visual data. It is constructed after privacy processing and is the sole transport input.

DOM/ARIA is preferred for exact control identity. Local visual classification adds grounding, OCR runs only on eligible visible canvas regions, and face detection feeds the same redaction policy. The planner returns one action from a closed enum and cannot return page JavaScript. Both the server and browser validate the action; the browser checks live target state and confirmation policy immediately before execution.
