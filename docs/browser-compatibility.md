# Browser compatibility

| Capability | Chromium | Firefox |
| --- | --- | --- |
| Manifest V3 extension | Supported | Built by WXT’s Firefox target; manifest behavior varies by release |
| DOM/ARIA extraction and safe DOM actions | Supported | Supported |
| Visible-tab capture | `tabs.captureVisibleTab` | `browser.tabs.captureVisibleTab` |
| ONNX baseline | WASM | WASM |
| WebGPU acceleration | Preferred local ONNX/Transformers.js execution path, with WASM fallback | Uses packaged WASM baseline; WebGPU availability varies by release/device |
| Chromium CDP enhancement | Future optional | Not used |

The shared DOM/ARIA path is the functional baseline. A perception failure uses semantic mode; it never changes the privacy boundary or enables raw upload.
