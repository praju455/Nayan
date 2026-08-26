# Local models

The checked-in local baseline is `public/models/mobilenetv3_small.onnx`, an Apache-2.0 MobileNetV3-small GUI element classifier. It classifies locally cropped, DOM-grounded regions into 15 UI classes and is fused with DOM semantics; it does not replace a future pixel-only GUI detector. Nayan falls back to DOM/ARIA semantic mode if model loading fails and never uploads a raw frame as fallback.
