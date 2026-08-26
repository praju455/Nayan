# Architecture

Nayan processes raw pixels only in the browser boundary. It fuses local DOM/ARIA semantics with optional local ONNX perception, detects sensitive information, creates a distinct sanitized context package, and only then invokes the planning API. The planner returns a constrained action which the browser validates and executes.

See `architecture-decisions.md` and `privacy-boundary.md` for the security invariants.
