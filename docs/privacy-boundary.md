# Privacy boundary

Only a validated `SanitizedContextPackage` may cross the browser/server boundary.

## Local-only artifacts

- Raw visible-tab pixels, raw DOM values, raw OCR, raw canvas/image crops, and pre-mask face regions.
- User task text before tokenization.
- Token-vault mappings and plaintext values resolved for browser typing.

## Required sequence

1. Capture and extract locally.
2. Run local visual classification, selective OCR, and face detection if applicable.
3. Detect sensitive values and fields using policy and deterministic recognizers.
4. Create opaque local tokens and physically redact pixels.
5. Construct a new sanitized package.
6. Verify redaction and scan package schema, field keys, and string values.
7. Send only if every check passes.

Forbidden fields include `rawFrame`, `rawScreenshot`, `rawDOM`, `rawHTML`, `rawOCR`, `tokenVault`, and `plaintextTokenValue`. The guard scans values as well as keys. Privacy failure is a local task failure, never a bypass.
