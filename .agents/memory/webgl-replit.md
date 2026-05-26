---
name: WebGL in Replit preview sandbox
description: WebGL context creation fails in Replit's sandboxed iframe preview; always add graceful fallback
---

Replit's preview pane is a sandboxed iframe without GPU access. Any Three.js / WebGL app will fail with "Error creating WebGL context" in the preview.

**Fix pattern:**
1. Check WebGL availability before rendering: `const ctx = canvas.getContext("webgl2") || canvas.getContext("webgl"); return !!ctx;`
2. Wrap the Canvas in an ErrorBoundary that catches the WebGL error
3. Show a meaningful fallback UI explaining that the viewer works in a real browser

**Why:** The sandbox has no GPU. This is not a code bug — the app renders correctly in any real browser. Never try to "fix" this by downgrading Three.js or changing GL settings.

**How to apply:** Any time building a Three.js / R3F / WebGL app, always add a checkWebGL() guard and a graceful fallback component.
