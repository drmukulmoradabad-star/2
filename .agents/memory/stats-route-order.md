---
name: Stats route ordering in Express
description: Static path segments must be registered before param segments in Express routers
---

In Express, route registration order matters. A path like `/scans/stats` will be caught by `/scans/:id` if `:id` is registered first.

**Fix:** Always register specific static routes BEFORE param routes:
```ts
router.get("/stats", handler);   // must come first
router.get("/:id", handler);     // must come after
```

**Why:** Express matches routes in registration order. `/scans/stats` matches `/:id` with id="stats" if /:id is first.

**How to apply:** In any router with both `/something` and `/:id`, put the static path first.
