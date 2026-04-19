"use strict";
(() => {
  // constants.ts
  var RESAMPLE_COUNT = 128;
  var SVG_SAMPLE_COUNT = 512;
  var STAMP_BASE_SPACING = 10;
  var STAMP_SIZE = 18;

  // shape-matching.ts
  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
  function cleanPoints(input) {
    if (input.length === 0) return [];
    const cleaned = [];
    let last = input[0];
    cleaned.push(last);
    for (let i = 1; i < input.length; i++) {
      const p = input[i];
      if (p.x === last.x && p.y === last.y) {
        continue;
      }
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < 4) {
        continue;
      }
      cleaned.push(p);
      last = p;
    }
    return cleaned;
  }
  function resamplePolylineByArcLength(pointsIn, count) {
    if (count <= 0 || pointsIn.length === 0) return [];
    if (pointsIn.length === 1) {
      return Array.from({ length: count }, () => ({ x: pointsIn[0].x, y: pointsIn[0].y }));
    }
    let totalLength = 0;
    for (let i = 1; i < pointsIn.length; i++) {
      totalLength += Math.sqrt(distanceSquared(pointsIn[i - 1], pointsIn[i]));
    }
    if (totalLength === 0) {
      return Array.from({ length: count }, () => ({ x: pointsIn[0].x, y: pointsIn[0].y }));
    }
    const step = totalLength / (count - 1);
    const resampled = [];
    resampled.push({ x: pointsIn[0].x, y: pointsIn[0].y });
    let D = 0;
    let prev = { x: pointsIn[0].x, y: pointsIn[0].y };
    for (let i = 1; i < pointsIn.length && resampled.length < count - 1; i++) {
      let curr = pointsIn[i];
      let segLen = Math.sqrt(distanceSquared(prev, curr));
      if (segLen === 0) {
        prev = curr;
        continue;
      }
      while (segLen > 0 && resampled.length < count - 1 && D + segLen >= step) {
        const remain = step - D;
        const t = remain / segLen;
        const nx = prev.x + (curr.x - prev.x) * t;
        const ny = prev.y + (curr.y - prev.y) * t;
        const newPoint = { x: nx, y: ny };
        resampled.push(newPoint);
        prev = newPoint;
        segLen -= remain;
        D = 0;
      }
      D += segLen;
      prev = curr;
    }
    const lastOriginal = pointsIn[pointsIn.length - 1];
    while (resampled.length < count - 1) {
      resampled.push({ x: lastOriginal.x, y: lastOriginal.y });
    }
    resampled.push({ x: lastOriginal.x, y: lastOriginal.y });
    if (resampled.length > count) {
      resampled.length = count;
      resampled[count - 1] = { x: lastOriginal.x, y: lastOriginal.y };
    }
    if (resampled.length !== count) {
      console.warn("resamplePolylineByArcLength: length mismatch", {
        inputCount: pointsIn.length,
        expected: count,
        actual: resampled.length
      });
    }
    if (resampled.length > 2) {
      let minSeg = Infinity;
      let maxSeg = 0;
      let totalSeg = 0;
      for (let i = 1; i < resampled.length; i++) {
        const d = Math.sqrt(distanceSquared(resampled[i - 1], resampled[i]));
        if (d < minSeg) minSeg = d;
        if (d > maxSeg) maxSeg = d;
        totalSeg += d;
      }
      const avgSeg = totalSeg / (resampled.length - 1);
      console.debug("resamplePolylineByArcLength spacing", {
        avgSeg,
        minSeg,
        maxSeg
      });
    }
    return resampled;
  }
  function computeStampPoints(path, spacingPx) {
    const n = path.length;
    if (n < 2 || spacingPx <= 0) return [];
    let spacing = spacingPx;
    if (n > 12e3) {
      spacing = 18;
    } else if (n > 5e3) {
      spacing = 14;
    }
    spacing *= 1.5;
    const stamps = [];
    let prev = path[0];
    let acc = 0;
    for (let i = 1; i < n; i++) {
      let curr = path[i];
      let dx = curr.x - prev.x;
      let dy = curr.y - prev.y;
      let segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen === 0) {
        prev = curr;
        continue;
      }
      const angle = Math.atan2(dy, dx);
      while (segLen > 0 && acc + segLen >= spacing) {
        const remain = spacing - acc;
        const t = remain / segLen;
        const x = prev.x + dx * t;
        const y = prev.y + dy * t;
        stamps.push({ x, y, angle });
        prev = { x, y };
        dx = curr.x - prev.x;
        dy = curr.y - prev.y;
        segLen = Math.sqrt(dx * dx + dy * dy);
        acc = 0;
      }
      acc += segLen;
      prev = curr;
    }
    return stamps;
  }
  function centroid(pts) {
    if (pts.length === 0) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / pts.length, y: sy / pts.length };
  }
  function rmsRadius(pts) {
    if (pts.length === 0) return 0;
    let sumSq = 0;
    for (const p of pts) {
      sumSq += p.x * p.x + p.y * p.y;
    }
    return Math.sqrt(sumSq / pts.length);
  }
  function normalizeForMatching(ptsIn) {
    if (ptsIn.length === 0) {
      return { normalized: [], center: { x: 0, y: 0 }, rms: 0 };
    }
    const c = centroid(ptsIn);
    const centered = ptsIn.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const r = rmsRadius(centered);
    if (r <= 0) {
      return { normalized: centered, center: c, rms: r };
    }
    const scale = 1 / r;
    const normalized = centered.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    return { normalized, center: c, rms: r };
  }
  function rotatePoints(pts, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    return pts.map((p) => ({
      x: p.x * cosA - p.y * sinA,
      y: p.x * sinA + p.y * cosA
    }));
  }
  function chamferDistance(a, b) {
    if (a.length === 0 || b.length === 0) return Infinity;
    function avgNearest(from, to) {
      let sum = 0;
      for (const p of from) {
        let minDist = Infinity;
        for (const q of to) {
          const d = Math.sqrt(distanceSquared(p, q));
          if (d < minDist) {
            minDist = d;
          }
        }
        sum += minDist;
      }
      return sum / from.length;
    }
    return avgNearest(a, b) + avgNearest(b, a);
  }
  function sampleSvgPathToPoints(svgString, sampleCount) {
    try {
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.width = "0";
      container.style.height = "0";
      container.style.overflow = "hidden";
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      container.innerHTML = svgString.trim();
      document.body.appendChild(container);
      const paths = Array.from(container.querySelectorAll("path"));
      if (!paths.length) {
        console.error("SVG sampling failed: <path> not found");
        container.remove();
        return null;
      }
      const lengths = paths.map((p) => p.getTotalLength());
      const totalLen = lengths.reduce((acc, v) => acc + v, 0);
      if (!isFinite(totalLen) || totalLen <= 0) {
        console.error("SVG sampling failed: invalid total path length");
        container.remove();
        return null;
      }
      const counts = [];
      let allocated = 0;
      for (let i = 0; i < paths.length; i++) {
        let n = Math.round(lengths[i] / totalLen * sampleCount);
        if (n < 2) n = 2;
        counts.push(n);
        allocated += n;
      }
      let diff = sampleCount - allocated;
      let idx = 0;
      while (diff !== 0 && paths.length > 0) {
        const j = idx % paths.length;
        const step = diff > 0 ? 1 : -1;
        const candidate = counts[j] + step;
        if (candidate >= 2) {
          counts[j] = candidate;
          diff -= step;
        }
        idx++;
      }
      const allPts = [];
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const pathLen = lengths[i];
        const n = counts[i];
        const subPts = [];
        if (!isFinite(pathLen) || pathLen <= 0) {
          continue;
        }
        for (let k = 0; k < n; k++) {
          const t = n === 1 ? 0 : k / (n - 1) * pathLen;
          const p = path.getPointAtLength(t);
          subPts.push({ x: p.x, y: p.y });
        }
        if (subPts.length) {
          allPts.push(subPts);
        }
      }
      container.remove();
      return allPts;
    } catch (err) {
      console.error("SVG sampling error", err);
      return null;
    }
  }

  // svgs.ts
  var POINTER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 22.028">
  <g transform="translate(3.7859e-7 -722.07)">
    <g transform="matrix(.23944 0 0 .23944 94.337 797.27)">
      <path fill="#fefefe" d="m-368.99-226.1v-9h-4v-8h-4v-8h-4v-9h-5v-4h-4v-8h9v4h4v12h4v-54h8v38h4v-17h9v17h4v-13h8v17h4v-13h5v5h4v29h-4v12h-5v9h-33z"/>
      <path fill="#000" d="m-372.99-222.1v-13h-4v-8h-4v-8h-5v-9h-4v-4h-4v-12h13v4h4v-38h4v-4h8v4h4v17h9v4h12v4h9v4h4v5h4v29h-4v12h-4v13h-42zm37-4v-9h5v-12h4v-29h-4v-5h-5v13h-4v-17h-8v13h-4v-17h-9v17h-4v-38h-8v54h-4v-12h-4v-4h-9v8h4v4h5v9h4v8h4v8h4v9h33z"/>
    </g>
  </g>
</svg>
`.trim();
  var WHEEL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 800 800"
     fill="none"
     stroke="black"
     stroke-width="4"
     stroke-linecap="round"
     stroke-linejoin="round">

  <!-- outer outline -->
  <circle cx="400" cy="400" r="320" />

  <!-- 4 evenly spaced interior lines (diameters) -->
  <line x1="80"  y1="400" x2="720" y2="400" />  <!-- 0\xB0 -->
  <line x1="400" y1="80"  x2="400" y2="720" />  <!-- 90\xB0 -->

  <!-- 45\xB0 and 135\xB0 (endpoints on the circle) -->
  <line x1="173.726" y1="173.726" x2="626.274" y2="626.274" />
  <line x1="173.726" y1="626.274" x2="626.274" y2="173.726" />
</svg>
`;
  var SPIRAL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 800 800"
     fill="none"
     stroke="black"
     stroke-width="14"
     stroke-linecap="round"
     stroke-linejoin="round">
  <path d="
    M400 400
    C420 400 440 380 440 360
    C440 320 380 300 340 340
    C280 400 340 500 440 500
    C580 500 640 360 540 260
    C400 120 180 260 220 440
    C260 660 540 720 680 540
    C840 340 620 80 360 120
  "/>
</svg>
`;
  var HEART_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 120 120">
  <path d="M0,38
           C-22,20 -50,5 -40,-20
           C-32,-44 -10,-46 0,-28
           C10,-46 32,-44 40,-20
           C50,5 22,20 0,38 Z" />
</svg>`;
  var FISH_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -50 160 100">
  <path d="
    M-55,0
    L-75,-18
    L-62,0
    L-75,18
    Z
  " />
  <path d="
    M-55,0
    C-30,-30 10,-32 45,-10
    C62,0 62,0 45,10
    C10,32 -30,30 -55,0
    Z
  " />
</svg>`;
  var STAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 95">
  <path
    d="
      M 50 2
      L 61 35
      L 96 35
      L 67 56
      L 78 90
      L 50 70
      L 22 90
      L 33 56
      L 4 35
      L 39 35
      Z
    "
    fill="none"
    stroke="black"
    stroke-width="4"
    stroke-linejoin="round"
  />
</svg>
`;
  var CRESCENT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path
    d="
      M 65 10
      A 45 45 0 1 0 65 90
      A 30 30 0 1 1 65 10
      Z
    "
    fill="none"
    stroke="black"
    stroke-width="4"
    stroke-linejoin="round"
  />
</svg>
`;
  var HORSESHOE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 800 800"
     fill="none"
     stroke="black"
     stroke-width="4"
     stroke-linecap="round"
     stroke-linejoin="round">
  <path d="
    M130 80
    H290
    C255 140 235 230 235 330
    C235 520 315 655 400 690
    C485 655 565 520 565 330
    C565 230 545 140 510 80
    H670
    C705 80 725 100 725 135
    V170
    C725 205 705 225 670 225
    H615
    C640 300 660 370 660 440

    C660 620 610 745 400 760
    C190 745 140 620 140 440

    C140 370 160 300 185 225
    H130
    C95 225 75 205 75 170
    V135
    C75 100 95 80 130 80
    Z
  "/>
</svg>

`;
  var HOUSE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 614 654" width="614" height="654">
  <path fill="#000" fill-rule="evenodd" d="
    M 310 71
    L 48 345
    L 47 357
    L 56 366
    L 102 366
    L 106 369
    L 106 610
    L 515 611
    L 517 369
    L 521 366
    L 567 366
    L 576 357
    L 575 345
    L 495 261
    L 495 146
    L 492 140
    L 480 132
    L 416 132
    L 404 141
    L 400 162
    L 317 75
    Z

    M 311 98
    L 392 182
    L 401 187
    L 411 186
    L 418 180
    L 423 150
    L 476 152
    L 476 268
    L 550 346
    L 512 349
    L 502 357
    L 498 365
    L 496 592
    L 125 590
    L 125 365
    L 121 357
    L 111 349
    L 73 346
    Z
  "/>
</svg>

`;
  var TREE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 640" width="512" height="640">
  <!-- Canopy -->
  <path
    d="
      M256 40
      C190 40 140 80 130 120
      C80 125 50 165 60 210
      C30 240 30 300 70 330
      C90 380 150 400 190 395
      C205 410 225 415 256 415
      C287 415 307 410 322 395
      C362 400 422 380 442 330
      C482 300 482 240 452 210
      C462 165 432 125 382 120
      C372 80 322 40 256 40
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- Trunk -->
  <path
    d="
      M230 415
      C220 470 210 520 210 600
      C210 620 302 620 302 600
      C302 520 292 470 282 415
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>


`;
  var UMBRELLA_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">

  <!-- Canopy -->
  <path
    d="
      M64 224
      C92 132 180 88 256 88
      C332 88 420 132 448 224

      C414 206 382 206 352 224
      C320 206 288 206 256 224
      C224 206 192 206 160 224
      C130 206 98 206 64 224
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- Shaft (closed, straight, always visible when filled) -->
  <path
    d="
      M246 224
      L266 224
      L266 384
      L246 384
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linejoin="round"
  />

  <!-- Hook -->
  <path
    d="
      M266 384
      C266 424 222 438 196 418
      C172 400 180 360 214 350

      C204 366 206 386 222 394
      C238 402 266 392 266 384
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

</svg>


`;
  var SVGs = {
    POINTER_SVG,
    WHEEL_SVG,
    // TODO wheel svg not working
    SPIRAL_SVG,
    HEART_SVG,
    FISH_SVG,
    STAR_SVG,
    CRESCENT_SVG,
    HORSESHOE_SVG,
    HOUSE_SVG,
    TREE_SVG,
    UMBRELLA_SVG
  };

  // content.ts
  (() => {
    "use strict";
    const pinkRGB = "255, 77, 166";
    const EXTENSION_ROOT_ID = "fortune-extension-root";
    let shadowHost = null;
    let shadowRootRef = null;
    let uiRoot = null;
    let fontLoadPromise = null;
    function ensureExtensionFontLoaded() {
      if (fontLoadPromise) return fontLoadPromise;
      const fontUrl = chrome.runtime.getURL("fonts/Ballet_24pt-Regular.woff2");
      fontLoadPromise = (async () => {
        try {
          const font = new FontFace("BalletFortune", `url(${fontUrl}) format('woff2')`, {
            weight: "400",
            style: "normal"
          });
          await font.load();
          document.fonts.add(font);
        } catch (error) {
          console.warn("Failed to load BalletFortune font:", error);
        }
      })();
      return fontLoadPromise;
    }
    function createIsolatedRoot() {
      if (shadowRootRef && uiRoot) return;
      const existingHost = document.getElementById(EXTENSION_ROOT_ID);
      if (existingHost?.shadowRoot) {
        shadowHost = existingHost;
        shadowRootRef = existingHost.shadowRoot;
        uiRoot = shadowRootRef.querySelector(".fortune-ui-root");
        if (uiRoot) return;
      }
      const host = existingHost ?? document.createElement("div");
      host.id = EXTENSION_ROOT_ID;
      host.style.all = "initial";
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.width = "100vw";
      host.style.height = "100vh";
      host.style.pointerEvents = "none";
      host.style.zIndex = "2147483647";
      host.style.contain = "layout style paint";
      if (!existingHost) {
        document.documentElement.appendChild(host);
      }
      const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      void ensureExtensionFontLoaded();
      shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        *, *::before, *::after {
          box-sizing: border-box;
        }

        .fortune-ui-root {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          isolation: isolate;
          overflow: hidden;
        }

        .fortune-text {
          font-family: 'BalletFortune', serif;
          color: #ff4da6;
        }

        .fortune-label {
          opacity: 0;
          animation: fortuneLabelFadeIn 2s ease forwards;
        }

        @keyframes fortuneLabelFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      </style>
      <div class="fortune-ui-root"></div>
    `;
      shadowHost = host;
      shadowRootRef = shadow;
      uiRoot = shadow.querySelector(".fortune-ui-root");
    }
    function appendToUiRoot(element) {
      createIsolatedRoot();
      if (!uiRoot) {
        throw new Error("Fortune UI root is unavailable.");
      }
      uiRoot.appendChild(element);
      return element;
    }
    const points = [];
    const STORAGE_KEY = "mousePath";
    let trackingEnabled = true;
    let drawingEnabled = false;
    let lastX = null;
    let lastY = null;
    let hasNewSample = false;
    let canvas = null;
    let ctx = null;
    let overlayCanvas = null;
    let overlayCtx = null;
    const TEMPLATES = [
      { id: "heart", name: "heart", svg: SVGs.HEART_SVG, quote: `"Despite the difficulties of my story, despite discomforts, doubts, despairs, despite impulses to be done with it, I unceasingly affirm love, within myself, as a value." -- Roland Barthes, A Lover's Discourse: Fragments.`, description: "...A new relationship could be on the horizon. This could also be a sign to recalibrate your attention towards the existing love and passion in your current relationships." },
      { id: "fish", name: "fish", svg: SVGs.FISH_SVG, quote: "Aphrodite and her son Eros were saved by disguising themselves as fish in order to avoid the monster Typhon. They were cast into the stars as the constellation Pisces.", description: "Good news is on the way. This missive will help you overcome a major challenge in your life right now. Be patient and open to receive it." },
      { id: "star", name: "star", svg: SVGs.STAR_SVG, quote: '"Flames from the pit of her stomach fanned through joints and membranes, a suggestion of wings in brilliant cobalt space, fiery stars where bodies should have been." -- Robert Gluck, Margery Kempe.', description: "You are particularly attuned to the divine cosmos right now. Blessings abound." },
      { id: "crescent", name: "crescent", svg: SVGs.CRESCENT_SVG, description: "You will be lauded publicly in the coming months. Expect recognition and rewards for your hard work. Pause, reflect, and enjoy the moment." },
      { id: "horseshoe", name: "horseshoe", svg: SVGs.HORSESHOE_SVG, description: "A horseshoe is a symbol of good luck and fortune. Now is the time to go all in on any (reasonably) risky endeavours you have put on ice. Fate is on your side presently, who knows how long it will last." },
      { id: "house", name: "house", svg: SVGs.HOUSE_SVG, quote: '"For our house is our corner of the world. As has often been said, it is our first universe, a real cosmos in every sense of the word." -- Gaston Bachelard, The Poetics of Space.', description: "The house is a physical refuge from the chaos of the world, but it is also somewhere to day dream and imagine. What kinds of emotions and memories does your first house bring to mind? Return to some of these feelings." },
      { id: "tree", name: "tree", svg: SVGs.TREE_SVG, quote: '"Sometimes I lie stretched on the ground, overcome with fatigue and dying with thirst; sometimes, late in the night, when the moon shines above me, I recline against an aged tree in some sequestered forest, to rest my weary limbs, when, exhausted and worn, I sleep till break of day." -- Goethe, Sorrows of Young Werther.', description: "A tree is a symbol of growth and renewal. Spend some restful time in nature accepting the invevitability of new beginnings." }
    ];
    let matchResult = null;
    let timeoutIds = [];
    const templateCache = {};
    let pointerBitmapPromise = null;
    let matchLabels = [];
    function savePointsToStorage() {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        return;
      }
      chrome.storage.local.set({ [STORAGE_KEY]: points });
    }
    function loadPointsFromStorage(onDone) {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        onDone();
        return;
      }
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const stored = result && result[STORAGE_KEY];
        points.length = 0;
        if (Array.isArray(stored)) {
          for (const p of stored) {
            if (p && typeof p.x === "number" && typeof p.y === "number") {
              points.push({ x: p.x, y: p.y });
            }
          }
        }
        onDone();
      });
    }
    function createCanvasOverlay() {
      canvas = document.createElement("canvas");
      canvas.style.all = "initial";
      canvas.style.position = "fixed";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      canvas.style.pointerEvents = "none";
      canvas.style.background = "transparent";
      canvas.style.zIndex = "0";
      canvas.style.display = "none";
      const context = canvas.getContext("2d");
      if (!context) return;
      ctx = context;
      appendToUiRoot(canvas);
      overlayCanvas = document.createElement("canvas");
      overlayCanvas.style.all = "initial";
      overlayCanvas.style.position = "fixed";
      overlayCanvas.style.top = "0";
      overlayCanvas.style.left = "0";
      overlayCanvas.style.width = "100vw";
      overlayCanvas.style.height = "100vh";
      overlayCanvas.style.pointerEvents = "none";
      overlayCanvas.style.background = "transparent";
      overlayCanvas.style.zIndex = "1";
      overlayCanvas.style.display = "none";
      const overlayContext = overlayCanvas.getContext("2d");
      if (!overlayContext) return;
      overlayCtx = overlayContext;
      appendToUiRoot(overlayCanvas);
      resizeCanvasForDisplay();
    }
    function handleResize() {
      resizeCanvasForDisplay();
    }
    function resizeCanvasForDisplay() {
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (overlayCanvas && overlayCtx) {
        const dpr = window.devicePixelRatio || 1;
        overlayCanvas.width = Math.round(window.innerWidth * dpr);
        overlayCanvas.height = Math.round(window.innerHeight * dpr);
        overlayCanvas.style.width = "100vw";
        overlayCanvas.style.height = "100vh";
        overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    function drawTemplateOverlays() {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (!overlayCanvas || !overlayCtx) return;
      if (!matchResult || matchResult.matches.length === 0) return;
      overlayCtx.save();
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      const opacities = [0.4, 1, 1];
      const lineWidths = [1, 4, 4];
      const dashPatterns = [[], [], [6, 4]];
      const fill = [true, false, false];
      const matches = matchResult.matches;
      matches.forEach((match, index) => {
        const timeout = window.setTimeout(() => {
          drawLabel(match, index);
        }, index * 5e3);
        timeoutIds.push(timeout);
      });
      const drawPath = (match, index, opacityStep) => {
        const paths = match.projectedPaths;
        if (!paths || paths.length === 0) return;
        const targetAlpha = opacities[index] ?? opacities[opacities.length - 1];
        const currentAlpha = targetAlpha * opacityStep;
        const lineWidth = lineWidths[index] ?? lineWidths[lineWidths.length - 1];
        if (!overlayCtx) return;
        overlayCtx.strokeStyle = `rgba(${pinkRGB}, ${currentAlpha})`;
        overlayCtx.lineWidth = lineWidth;
        overlayCtx.setLineDash(dashPatterns[index] ?? dashPatterns[dashPatterns.length - 1]);
        for (const subpath of paths) {
          if (subpath.length < 2) return;
          overlayCtx.beginPath();
          overlayCtx.moveTo(subpath[0].x, subpath[0].y);
          for (let j = 1; j < subpath.length; j++) {
            const p = subpath[j];
            overlayCtx.lineTo(p.x, p.y);
          }
          if (fill[index] ?? fill[fill.length - 1]) {
            overlayCtx.fillStyle = `rgba(${pinkRGB}, ${currentAlpha})`;
            overlayCtx.fill();
          } else {
            overlayCtx.stroke();
          }
        }
      };
      let startTime = null;
      const FADE_DURATION_MS = 3e3;
      const animate = (timeStamp) => {
        const staggerDelay = 2e3;
        overlayCtx?.clearRect(0, 0, overlayCanvas?.width ?? 0, overlayCanvas?.height ?? 0);
        if (startTime === null) {
          startTime = timeStamp;
        }
        let allAnimationsDone = true;
        matches.forEach((match, index) => {
          const delay = staggerDelay * (index + 1);
          const currentElapsed = timeStamp - startTime - delay;
          if (currentElapsed <= 0) {
            allAnimationsDone = false;
            return;
          }
          const fadeProgress = Math.min(1, currentElapsed / FADE_DURATION_MS);
          if (fadeProgress < 1) {
            allAnimationsDone = false;
          }
          drawPath(match, index, fadeProgress);
        });
        if (!allAnimationsDone) {
          animationFrameId = requestAnimationFrame(animate);
        } else {
          animationFrameId = null;
        }
      };
      animationFrameId = requestAnimationFrame(animate);
      overlayCtx.restore();
    }
    async function drawStampedPath() {
      if (!canvas || !ctx) return;
      const cleaned = cleanPoints(points);
      if (cleaned.length < 2) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        return;
      }
      let bitmap;
      try {
        bitmap = await loadPointerBitmap();
      } catch (err) {
        console.error("Failed to load pointer bitmap", err);
        return;
      }
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const stampPoints = computeStampPoints(cleaned, STAMP_BASE_SPACING);
      if (stampPoints.length === 0) {
        return;
      }
      const aspect = 22.028 / 17;
      const width = STAMP_SIZE;
      const height = STAMP_SIZE * aspect;
      const anchorX = 2;
      const anchorY = 2;
      for (const s of stampPoints) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.drawImage(bitmap, -anchorX, -anchorY, width, height);
        ctx.restore();
      }
      drawTemplateOverlays();
    }
    function createToggleButton() {
      const button = document.createElement("button");
      button.textContent = "Reveal fortune";
      button.classList.add("fortune-text");
      button.style.all = "initial";
      button.style.position = "fixed";
      button.style.bottom = "20px";
      button.style.right = "20px";
      button.style.zIndex = "2";
      button.style.padding = "4px 8px";
      button.style.fontSize = "32px";
      button.style.border = "none";
      button.style.background = "transparent";
      button.style.color = "#ff4da6";
      button.style.cursor = "pointer";
      button.style.pointerEvents = "auto";
      button.style.fontFamily = "BalletFortune, serif";
      button.addEventListener("click", async () => {
        drawingEnabled = !drawingEnabled;
        if (drawingEnabled) {
          trackingEnabled = false;
          button.textContent = "Hide fortune";
          if (canvas) {
            canvas.style.display = "block";
          }
          if (overlayCanvas) {
            overlayCanvas.style.display = "block";
          }
          runShapeComparison();
          await drawStampedPath();
        } else {
          points.length = 0;
          lastX = null;
          lastY = null;
          hasNewSample = false;
          savePointsToStorage();
          matchResult = null;
          clearMatchLabels();
          trackingEnabled = true;
          button.textContent = "Reveal fortune";
          if (canvas && ctx) {
            canvas.style.display = "none";
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          }
          if (overlayCanvas && overlayCtx) {
            overlayCanvas.style.display = "none";
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          }
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
        }
      });
      appendToUiRoot(button);
    }
    function handleMouseMove(event) {
      if (!trackingEnabled) return;
      lastX = event.clientX;
      lastY = event.clientY;
      hasNewSample = true;
    }
    function clearMatchLabels() {
      for (const timeoutId of timeoutIds) {
        clearTimeout(timeoutId);
      }
      timeoutIds = [];
      for (const el of matchLabels) {
        try {
          el.remove();
        } catch {
        }
      }
      matchLabels = [];
    }
    function createMatchOverlays(matches) {
      void matches;
      drawTemplateOverlays();
    }
    const capitalize = (str) => {
      return str.charAt(0).toUpperCase() + str.slice(1);
    };
    const drawLabel = (match, index) => {
      const positions = [
        { x: 0.15, y: 0.15 },
        { x: 0.85, y: 0.2 },
        { x: 0.2, y: 0.8 }
      ];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const posIdx = index < positions.length ? index : positions.length - 1;
      const pos = positions[posIdx];
      const x = pos.x * vw;
      const y = pos.y * vh;
      const label = document.createElement("div");
      label.classList.add("fortune-label", "fortune-text");
      label.style.all = "initial";
      label.style.position = "fixed";
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      label.style.transform = "translate(-50%, -50%)";
      label.style.pointerEvents = "none";
      label.style.zIndex = "2";
      label.style.whiteSpace = "nowrap";
      label.style.color = "#ff4da6";
      label.style.fontFamily = "BalletFortune, serif";
      const title = document.createElement("div");
      title.textContent = `${index + 1}. ${capitalize(match.name)}`;
      title.style.all = "initial";
      title.style.fontSize = "60px";
      title.style.display = "block";
      title.style.color = "#ff4da6";
      title.style.fontFamily = "BalletFortune, serif";
      label.appendChild(title);
      const def = TEMPLATES.find((t) => t.id === match.id);
      if (def && def.description) {
        const desc = document.createElement("div");
        desc.style.all = "initial";
        desc.innerHTML = (def.quote ? def.quote + "<br/><br/>" : "") + def.description;
        desc.style.whiteSpace = "pre-wrap";
        desc.style.maxWidth = "300px";
        desc.style.marginTop = "4px";
        desc.style.fontFamily = "monospace";
        desc.style.fontSize = "12px";
        desc.style.background = "#ffffff";
        desc.style.color = "#000000";
        desc.style.padding = "2px 4px";
        desc.style.borderRadius = "2px";
        desc.style.display = "block";
        label.appendChild(desc);
      }
      appendToUiRoot(label);
      matchLabels.push(label);
    };
    function getTemplateResampled(def) {
      const cached = templateCache[def.id];
      if (cached) return cached;
      const sampled = sampleSvgPathToPoints(def.svg, SVG_SAMPLE_COUNT);
      if (!sampled || sampled.length === 0) {
        templateCache[def.id] = null;
        return null;
      }
      let paths;
      if (sampled.length === 1) {
        paths = [resamplePolylineByArcLength(sampled[0], RESAMPLE_COUNT)];
      } else {
        const numPaths = sampled.length;
        const baseCount = Math.floor(RESAMPLE_COUNT / numPaths);
        let remainder = RESAMPLE_COUNT - baseCount * numPaths;
        paths = [];
        for (let i = 0; i < numPaths; i++) {
          let cnt = baseCount;
          if (remainder > 0) {
            cnt++;
            remainder--;
          }
          if (cnt < 2) cnt = 2;
          const sub = resamplePolylineByArcLength(sampled[i], cnt);
          paths.push(sub);
        }
      }
      templateCache[def.id] = paths;
      return paths;
    }
    function loadPointerBitmap() {
      if (pointerBitmapPromise) return pointerBitmapPromise;
      pointerBitmapPromise = (async () => {
        const blob = new Blob([SVGs.POINTER_SVG], { type: "image/svg+xml" });
        return new Promise((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (typeof img.decode === "function") {
              img.decode().catch(() => {
              }).then(() => {
                URL.revokeObjectURL(url);
                resolve(img);
              });
            } else {
              URL.revokeObjectURL(url);
              resolve(img);
            }
          };
          img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
          };
          img.src = url;
        });
      })();
      return pointerBitmapPromise;
    }
    function projectTemplateOntoRecorded(recordedRaw, templatePathsRaw, bestAngleDeg) {
      if (recordedRaw.length === 0 || templatePathsRaw.length === 0) return [];
      const cR = centroid(recordedRaw);
      const flatTemplate = [];
      for (const path of templatePathsRaw) {
        for (const p of path) flatTemplate.push(p);
      }
      if (flatTemplate.length === 0) return [];
      const cT = centroid(flatTemplate);
      const recordedCentered = recordedRaw.map((p) => ({ x: p.x - cR.x, y: p.y - cR.y }));
      const templateCenteredFlat = flatTemplate.map((p) => ({ x: p.x - cT.x, y: p.y - cT.y }));
      const rR = rmsRadius(recordedCentered);
      const rT = rmsRadius(templateCenteredFlat);
      if (rR <= 0 || rT <= 0) {
        return [];
      }
      const scale = rR / rT;
      const rad = bestAngleDeg * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const projectedPaths = [];
      for (const path of templatePathsRaw) {
        const projectedSub = [];
        for (const p of path) {
          const px = p.x - cT.x;
          const py = p.y - cT.y;
          const rx = px * cosA - py * sinA;
          const ry = px * sinA + py * cosA;
          const sx = rx * scale;
          const sy = ry * scale;
          projectedSub.push({ x: sx + cR.x, y: sy + cR.y });
        }
        projectedPaths.push(projectedSub);
      }
      return projectedPaths;
    }
    function runShapeComparison() {
      const cleaned = cleanPoints(points);
      if (cleaned.length < 20) {
        matchResult = null;
        clearMatchLabels();
        console.log("Shape comparison skipped: not enough points.");
        return;
      }
      const recordedResampled = resamplePolylineByArcLength(cleaned, RESAMPLE_COUNT);
      const recordedNormInfo = normalizeForMatching(recordedResampled);
      const recordedNorm = recordedNormInfo.normalized;
      if (recordedNorm.length === 0) {
        matchResult = null;
        clearMatchLabels();
        console.log("Shape comparison failed: unable to normalize recorded path.");
        return;
      }
      const allMatches = [];
      for (const def of TEMPLATES) {
        const templatePaths = getTemplateResampled(def);
        if (!templatePaths) {
          console.warn(`Template sampling failed for ${def.name}`);
          continue;
        }
        const flatTemplate = [];
        for (const path of templatePaths) {
          for (const p of path) flatTemplate.push(p);
        }
        if (flatTemplate.length === 0) {
          console.warn(`Template has no points for ${def.name}`);
          continue;
        }
        const templateNormInfo = normalizeForMatching(flatTemplate);
        const templateNorm = templateNormInfo.normalized;
        if (templateNorm.length === 0) {
          console.warn(`Template normalization failed for ${def.name}`);
          continue;
        }
        let shapeBestScore = Infinity;
        let shapeBestAngle = 0;
        for (let angle = 0; angle < 360; angle += 10) {
          const rotated = rotatePoints(templateNorm, angle);
          const score = chamferDistance(recordedNorm, rotated);
          if (score < shapeBestScore) {
            shapeBestScore = score;
            shapeBestAngle = angle;
          }
        }
        if (!isFinite(shapeBestScore)) {
          continue;
        }
        allMatches.push({
          id: def.id,
          name: def.name,
          score: shapeBestScore,
          angleDeg: shapeBestAngle,
          templatePaths,
          projectedPaths: []
        });
      }
      if (allMatches.length === 0) {
        matchResult = null;
        clearMatchLabels();
        console.log("Shape comparison failed: no valid template result.");
        return;
      }
      allMatches.sort((a, b) => a.score - b.score);
      const topK = Math.min(3, allMatches.length);
      const topMatches = allMatches.slice(0, topK);
      for (const m of topMatches) {
        m.projectedPaths = projectTemplateOntoRecorded(
          recordedResampled,
          m.templatePaths,
          m.angleDeg
        );
      }
      matchResult = {
        recordedResampled,
        matches: topMatches
      };
      createMatchOverlays(topMatches);
      console.log(
        "Shape comparison ->",
        topMatches.map((m) => ({
          name: m.name,
          score: m.score,
          angleDeg: m.angleDeg
        }))
      );
    }
    let animationFrameId = null;
    function animationLoop() {
      window.requestAnimationFrame(animationLoop);
      if (!trackingEnabled || !hasNewSample) {
        return;
      }
      hasNewSample = false;
      const x = lastX;
      const y = lastY;
      if (x == null || y == null) return;
      const maxPoints = 5e3;
      if (points.length >= maxPoints) {
        points.shift();
      }
      points.push({ x, y });
      savePointsToStorage();
    }
    function init() {
      loadPointsFromStorage(() => {
        createIsolatedRoot();
        createCanvasOverlay();
        createToggleButton();
        window.addEventListener("resize", handleResize);
        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        animationLoop();
      });
    }
    init();
  })();
})();
