---
name: fix-build
description: Fix electron-vite build failures by reading errors and patching the failing files
disable-model-invocation: true
argument-hint: [error-output]
---

# Fix build

When the electron-vite build fails, read the error output, identify the failing file(s), and fix the issue. Run `npx electron-vite build` again to verify.
