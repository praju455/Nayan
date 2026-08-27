# Real-application demo script

Use a real browser application in an account you control. The mock reimbursement portal is retained only for repeatable regression tests; it is not required for the presentation.

## Recommended safe demonstration: Gmail test account

1. Use a separate Gmail account containing only non-sensitive test mail. Start the FastAPI server with `NAYAN_REASONING_BACKEND=cloud`, a Gemini key, and optionally a Groq fallback key.
2. Build and load the extension, then open `https://mail.google.com` in Chrome. Click **Allow current site** in Nayan; this creates a local, explicit site approval rather than a blanket permission.
3. Give Nayan a low-risk task: **“Open Compose and then stop.”** The extension captures and parses the active screen locally, detects/redacts any sensitive fields, sends only the sanitized structure to the server planner, and validates the returned click against live DOM state.
4. Show that the visible action occurs in Gmail. The execution target must be a live DOM/ARIA element; a purely visual model region cannot be clicked.
5. For a consequential action such as sending, submitting, deleting, or paying, Nayan always pauses for a local confirmation. Do not demonstrate a real send or delete during judging.

## Public-site alternative

Open a public GitHub repository or documentation site and ask Nayan to **scroll to a visible section** or **open a visible documentation link**. This demonstrates real-site screen grounding without a login or external side effect.

## What to explain to judges

- Raw screenshots, DOM, OCR output, task secrets, and token-vault values remain local.
- Pixel-only local regions improve layout understanding but never become executable controls by themselves.
- Gemini receives the sanitized reasoning context first. Groq is used only if Gemini fails, and both outputs are constrained to one validated action.
- The UI action still passes the browser-side target, token, and confirmation checks after the server responds.

The site may change its UI, show CAPTCHAs, or block automation. If that happens, use the public-site alternative or the offline regression fixture; Nayan must fail safely rather than guessing.
