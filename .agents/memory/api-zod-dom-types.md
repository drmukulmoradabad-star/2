---
name: API-zod tsconfig DOM types
description: lib/api-zod needs dom lib when OpenAPI spec includes multipart/binary file fields
---

When the OpenAPI spec includes a `multipart/form-data` schema with a binary `file` field, Orval generates `File` and `Blob` types in `lib/api-zod/src/generated/`. These fail typecheck unless the tsconfig includes DOM lib.

**Fix:** Add to `lib/api-zod/tsconfig.json`:
```json
"lib": ["esnext", "dom"]
```

**Why:** Orval generates `zod.instanceof(File)` for binary fields. `File` is a DOM global, not available in default esnext-only lib.

**How to apply:** Any time the API spec has a file upload endpoint with binary fields, add dom to api-zod's tsconfig lib.
