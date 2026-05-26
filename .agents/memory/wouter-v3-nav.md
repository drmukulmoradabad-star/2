---
name: Wouter v3 navigation
description: Programmatic navigation API changed in wouter v3 — useNavigate no longer exists
---

In wouter v3, `useNavigate` does not exist. Use `useLocation` instead:

```tsx
const [, navigate] = useLocation();
navigate("/some-path");
```

**Why:** Wouter v3 dropped the `useNavigate` export. `useLocation` returns `[currentPath, navigateFn]`.

**How to apply:** Any time you write a page with `navigate("/...")`, import `useLocation` not `useNavigate`.
