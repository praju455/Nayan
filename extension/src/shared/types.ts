export type BoundingBox = readonly [number, number, number, number];
export type PiiCategory = "EMAIL" | "PHONE" | "CREDIT_CARD" | "PAN" | "AADHAAR" | "IP_ADDRESS" | "DATE_OF_BIRTH" | "BANK_ACCOUNT" | "PASSWORD" | "EMPLOYEE_ID" | "PERSON_NAME" | "FINANCIAL_AMOUNT" | "DEPARTMENT" | "ADDRESS" | "FACE" | "USER_PROVIDED_TEXT" | "USER_SELECTED_RECIPIENT";

declare const localRawFrameBrand: unique symbol;
/** Local-only. This type must never be imported by transport modules. */
export type LocalRawFrame = Readonly<{ image: ImageData; width: number; height: number; createdAt: number; [localRawFrameBrand]: true }>;

export type RawSemanticNode = Readonly<{ id: string; tag: string; role: string; label?: string; text?: string; value?: string; inputType?: string; autocomplete?: string; bbox: BoundingBox; visible: boolean; interactive: boolean; disabled: boolean; source: readonly ("dom" | "aria" | "ocr")[] }>;
export type VisualElement = Readonly<{ id: string; type: string; bbox: BoundingBox; confidence: number }>;
export type SanitizedElement = Readonly<{ id: string; role: string; semanticType?: string; label?: string; text?: string; bbox: BoundingBox; visible: boolean; interactive: boolean; confidence: number; source: readonly ("dom" | "aria" | "vision" | "ocr")[] }>;
export type RedactionRecord = Readonly<{ type: PiiCategory; token: string | null; bbox: BoundingBox; method: "black" | "blur" | "pixelate" | "tokenize" }>;
export type SanitizedContextPackage = Readonly<{ protocolVersion: "1.0"; taskId: string; screen: { width: number; height: number }; task: string; elements: readonly SanitizedElement[]; redactions: readonly RedactionRecord[]; state: { step: number; pageFingerprint: string; confirmed?: boolean }; redactedScreenshot?: string | null }>;
export type AgentAction = Readonly<{ action: "click" | "type" | "scroll" | "select" | "click_visible_text" | "focus" | "navigate" | "wait" | "done" | "confirm_needed"; targetId?: string; valueToken?: string; destination?: string; deltaY?: number; message?: string; confidence: number; reason: string }>;
export type PiiMatch = Readonly<{ category: PiiCategory; value: string; start: number; end: number; confidence: number }>;
