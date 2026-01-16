## Simple Mouse Path Recorder (Chrome Extension - Manifest V3)

This is a **minimal Chrome extension (MV3)** that:

- **Always records** mouse movement as \((x, y)\) coordinates in memory (no persistence).
- Uses a **content script on `<all_urls>`**.
- **Does not read** page content, DOM elements, URLs, or metadata.
- Samples mouse movement at ~60fps using `requestAnimationFrame`.
- Can **optionally draw** the recorded path using a transparent `canvas` overlay.
- Provides a **small toggle button** in the page to turn drawing on/off.

The extension logic is implemented in **TypeScript** (`content.ts`) and compiled to **JavaScript** (`content.js`) for Chrome to load.

---

### Files

- **`manifest.json`**: Chrome extension manifest (MV3), wires the content script.
- **`content.ts`**: TypeScript source for the content script.
- **`content.js`**: Compiled JavaScript that Chrome actually runs (output of TypeScript).
- **`package.json`**: Minimal Node/TypeScript setup.
- **`tsconfig.json`**: TypeScript compiler configuration.
- **`README.md`**: This file.

---

### 1. Install dependencies (once)

From the project root (`/Users/emilymorgan/Desktop/scroll-divination`):

```bash
cd /Users/emilymorgan/Desktop/scroll-divination
npm install
```

This installs **TypeScript 5.8.3** locally as a dev dependency.

---

### 2. Build the content script (TypeScript → JavaScript)

Whenever you change `content.ts`, recompile to update `content.js`:

```bash
npm run build
```

This runs `tsc` using `tsconfig.json` and emits `content.js` at the project root, which is what `manifest.json` references.

> **Note:** A prebuilt `content.js` is already checked in so you can load the extension immediately. Re-run `npm run build` after making any TypeScript changes.

---

### 3. Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **“Load unpacked”**.
4. Select the folder:  
   `/Users/emilymorgan/Desktop/scroll-divination`
5. The extension should now appear in the list.

---

### 4. Test the behavior

1. With the extension loaded, open any webpage (e.g., `https://example.com`).
2. Move the mouse around:
   - The extension **records** \((x, y)\) positions in memory on every frame (throttled via `requestAnimationFrame`).
   - No visual overlay is shown yet.
3. At the bottom-right of the page, you should see a small button labeled **“Show drawing”**:
   - Click **“Show drawing”**:
     - A transparent `canvas` overlay is shown, fixed to the viewport.
     - As you move the mouse, **red lines** are drawn following your path.
     - The canvas uses `pointer-events: none`, so it **does not block** clicks or interactions on the page.
   - Click **“Hide drawing”**:
     - The canvas is hidden and cleared.
     - **Recording continues silently** in memory, but nothing is drawn.

The extension never stores data persistently; everything remains in memory and is reset when the page is reloaded or closed.

---

### 5. Editing and iterating

Typical edit cycle:

1. Edit `content.ts` in your editor.
2. Run:

   ```bash
   npm run build
   ```

3. In `chrome://extensions`, click **Reload** on the extension.
4. Refresh your test page and verify the new behavior.

That’s it — this is intentionally kept as small and readable as possible while meeting all your stated requirements.

