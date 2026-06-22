# N3 Kotoba

A private browser study app generated from **十六年N3词汇真题词汇全编（高频顺）.pdf**.

The source contains 1,015 vocabulary entries: 556 at 1×, 253 at 2×, 111 at 3×, 57 at 4×, 25 at 5×, 8 at 6×, 4 at 7×, and 1 at 8×.

Double-click `index.html` to open the app. Study progress is stored only in the browser's local storage.

For a local preview at `http://127.0.0.1:4173`, run `powershell -ExecutionPolicy Bypass -File .\serve-app.ps1`.

`extract-pdf.mjs` documents the extraction and can regenerate `words.js` from `source.pdf`.
