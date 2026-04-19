import { RESAMPLE_COUNT, STAMP_BASE_SPACING, STAMP_SIZE, SVG_SAMPLE_COUNT } from './constants';
import { centroid, chamferDistance, cleanPoints, computeStampPoints, normalizeForMatching, resamplePolylineByArcLength, rmsRadius, rotatePoints, sampleSvgPathToPoints } from './shape-matching';
import { SVGs } from './svgs';
import { Point, TemplateDefinition, TemplateMatch, MatchResult } from './types';
// `chrome` is provided by the Chrome extensions environment at runtime.
declare const chrome: any;

(() => {
  'use strict';

  const pinkRGB = '255, 77, 166';
  const EXTENSION_ROOT_ID = 'fortune-extension-root';

  let shadowHost: HTMLDivElement | null = null;
  let shadowRootRef: ShadowRoot | null = null;
  let uiRoot: HTMLDivElement | null = null;
  let fontLoadPromise: Promise<void> | null = null;

  function ensureExtensionFontLoaded(): Promise<void> {
    if (fontLoadPromise) return fontLoadPromise;

    const fontUrl = chrome.runtime.getURL('fonts/Ballet_24pt-Regular.woff2');

    fontLoadPromise = (async () => {
      try {
        const font = new FontFace('BalletFortune', `url(${fontUrl}) format('woff2')`, {
          weight: '400',
          style: 'normal',
        });
        await font.load();
        document.fonts.add(font);
      } catch (error) {
        console.warn('Failed to load BalletFortune font:', error);
      }
    })();

    return fontLoadPromise;
  }

  function createIsolatedRoot(): void {
    if (shadowRootRef && uiRoot) return;

    const existingHost = document.getElementById(EXTENSION_ROOT_ID) as HTMLDivElement | null;
    if (existingHost?.shadowRoot) {
      shadowHost = existingHost;
      shadowRootRef = existingHost.shadowRoot;
      uiRoot = shadowRootRef.querySelector('.fortune-ui-root') as HTMLDivElement | null;
      if (uiRoot) return;
    }

    const host = existingHost ?? document.createElement('div');
    host.id = EXTENSION_ROOT_ID;
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647';
    host.style.contain = 'layout style paint';

    if (!existingHost) {
      document.documentElement.appendChild(host);
    }

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
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
    uiRoot = shadow.querySelector('.fortune-ui-root') as HTMLDivElement | null;
  }

  function appendToUiRoot<T extends HTMLElement>(element: T): T {
    createIsolatedRoot();
    if (!uiRoot) {
      throw new Error('Fortune UI root is unavailable.');
    }
    uiRoot.appendChild(element);
    return element;
  }

  // In-memory list of sampled points (entire history for this page).
  const points: Point[] = [];

  // Key used to persist the recorded path in chrome.storage.local.
  const STORAGE_KEY = 'mousePath';

  // Tracking (recording) is on by default; can be paused while drawing is shown.
  let trackingEnabled = true;

  // Drawing overlay is off by default.
  let drawingEnabled = false;

  // Latest mouse position from the last mousemove event.
  let lastX: number | null = null;
  let lastY: number | null = null;

  // Flag to indicate we have a new mouse position to sample this frame.
  let hasNewSample = false;

  // Canvas and context used for drawing when enabled.
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let overlayCanvas: HTMLCanvasElement | null = null;
  let overlayCtx: CanvasRenderingContext2D | null = null;

  const TEMPLATES: TemplateDefinition[] = [
    { id: 'heart', name: 'heart', svg: SVGs.HEART_SVG, quote: '"Despite the difficulties of my story, despite discomforts, doubts, despairs, despite impulses to be done with it, I unceasingly affirm love, within myself, as a value." -- Roland Barthes, A Lover\'s Discourse: Fragments.', description: '...A new relationship could be on the horizon. This could also be a sign to recalibrate your attention towards the existing love and passion in your current relationships.' },
    { id: 'fish', name: 'fish', svg: SVGs.FISH_SVG, quote: 'Aphrodite and her son Eros were saved by disguising themselves as fish in order to avoid the monster Typhon. They were cast into the stars as the constellation Pisces.', description: 'Good news is on the way. This missive will help you overcome a major challenge in your life right now. Be patient and open to receive it.' },
    { id: 'star', name: 'star', svg: SVGs.STAR_SVG, quote: '"Flames from the pit of her stomach fanned through joints and membranes, a suggestion of wings in brilliant cobalt space, fiery stars where bodies should have been." -- Robert Gluck, Margery Kempe.', description: 'You are particularly attuned to the divine cosmos right now. Blessings abound.' },
    { id: 'crescent', name: 'crescent', svg: SVGs.CRESCENT_SVG, description: 'You will be lauded publicly in the coming months. Expect recognition and rewards for your hard work. Pause, reflect, and enjoy the moment.' },
    { id: 'horseshoe', name: 'horseshoe', svg: SVGs.HORSESHOE_SVG, description: 'A horseshoe is a symbol of good luck and fortune. Now is the time to go all in on any (reasonably) risky endeavours you have put on ice. Fate is on your side presently, who knows how long it will last.' },
    { id: 'house', name: 'house', svg: SVGs.HOUSE_SVG, quote: '"For our house is our corner of the world. As has often been said, it is our first universe, a real cosmos in every sense of the word." -- Gaston Bachelard, The Poetics of Space.', description: 'The house is a physical refuge from the chaos of the world, but it is also somewhere to day dream and imagine. What kinds of emotions and memories does your first house bring to mind? Return to some of these feelings.' },
    { id: 'tree', name: 'tree', svg: SVGs.TREE_SVG, quote: '"Sometimes I lie stretched on the ground, overcome with fatigue and dying with thirst; sometimes, late in the night, when the moon shines above me, I recline against an aged tree in some sequestered forest, to rest my weary limbs, when, exhausted and worn, I sleep till break of day." -- Goethe, Sorrows of Young Werther.', description: 'A tree is a symbol of growth and renewal. Spend some restful time in nature accepting the invevitability of new beginnings.' },
  ];

  // Cached best matches for current recorded path (if any).
  let matchResult: MatchResult | null = null;

  // Timeout IDs for label animations. Needed to clear correctly.
  let timeoutIds: number[] = [];

  // Cached resampled templates (subpaths, in SVG coordinates), keyed by template id.
  const templateCache: Record<string, Point[][] | null> = {};

  // Cached pointer bitmap for stamped path rendering.
  let pointerBitmapPromise: Promise<ImageBitmap | HTMLImageElement> | null = null;

  // UI elements for comparison.
  let matchLabels: HTMLDivElement[] = [];

  // Persist the current points array to chrome.storage.local.
  function savePointsToStorage(): void {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEY]: points });
  }

  // Load any previously stored points from chrome.storage.local into memory,
  // then invoke the provided callback (always, even if nothing was stored).
  function loadPointsFromStorage(onDone: () => void): void {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      onDone();
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (result: any) => {
      const stored = result && result[STORAGE_KEY];
      points.length = 0;
      if (Array.isArray(stored)) {
        for (const p of stored) {
          if (p && typeof p.x === 'number' && typeof p.y === 'number') {
            points.push({ x: p.x, y: p.y });
          }
        }
      }
      onDone();
    });
  }

  // Create the fixed, transparent canvas overlay.
  function createCanvasOverlay(): void {
    canvas = document.createElement('canvas');
    canvas.style.all = 'initial';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.background = 'transparent';
    canvas.style.zIndex = '0';
    canvas.style.display = 'none';

    const context = canvas.getContext('2d');
    if (!context) return;
    ctx = context;

    appendToUiRoot(canvas);

    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.all = 'initial';
    overlayCanvas.style.position = 'fixed';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.width = '100vw';
    overlayCanvas.style.height = '100vh';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.background = 'transparent';
    overlayCanvas.style.zIndex = '1';
    overlayCanvas.style.display = 'none';

    const overlayContext = overlayCanvas.getContext('2d');
    if (!overlayContext) return;
    overlayCtx = overlayContext;

    appendToUiRoot(overlayCanvas);
    resizeCanvasForDisplay();
  }

  // Resize canvas when the viewport changes.
  function handleResize(): void {
    resizeCanvasForDisplay();
  }

  // Handle high-DPI displays so drawing uses CSS pixels but remains crisp.
  function resizeCanvasForDisplay(): void {
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (overlayCanvas && overlayCtx) {
      const dpr = window.devicePixelRatio || 1;
      overlayCanvas.width = Math.round(window.innerWidth * dpr);
      overlayCanvas.height = Math.round(window.innerHeight * dpr);
      overlayCanvas.style.width = '100vw';
      overlayCanvas.style.height = '100vh';
      overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // Draw the projected template overlays (best matches), if available.
  function drawTemplateOverlays(): void {
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
      }, index * 5000);
      timeoutIds.push(timeout);
    });

    const drawPath = (match: TemplateMatch, index: number, opacityStep: number) => {
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

    let startTime: number | null = null;
    const FADE_DURATION_MS = 3000;

    const animate = (timeStamp: number) => {
      const staggerDelay = 2000;

      overlayCtx?.clearRect(0, 0, overlayCanvas?.width ?? 0, overlayCanvas?.height ?? 0);
      if (startTime === null) {
        startTime = timeStamp;
      }

      let allAnimationsDone = true;

      matches.forEach((match, index) => {
        const delay = staggerDelay * (index + 1);
        const currentElapsed = timeStamp - startTime! - delay;

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

  // Draw the recorded path as a series of stamped pointer icons.
  async function drawStampedPath(): Promise<void> {
    if (!canvas || !ctx) return;

    const cleaned = cleanPoints(points);
    if (cleaned.length < 2) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      return;
    }

    let bitmap: ImageBitmap | HTMLImageElement;
    try {
      bitmap = await loadPointerBitmap();
    } catch (err) {
      console.error('Failed to load pointer bitmap', err);
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

  // Create the single toggle button to reveal/hide the fortune.
  function createToggleButton(): void {
    const button = document.createElement('button');
    button.textContent = 'Reveal fortune';
    button.classList.add('fortune-text');
    button.style.all = 'initial';
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.zIndex = '2';
    button.style.padding = '4px 8px';
    button.style.fontSize = '32px';
    button.style.border = 'none';
    button.style.background = 'transparent';
    button.style.color = '#ff4da6';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';
    button.style.fontFamily = 'BalletFortune, serif';

    button.addEventListener('click', async () => {
      drawingEnabled = !drawingEnabled;

      if (drawingEnabled) {
        trackingEnabled = false;
        button.textContent = 'Hide fortune';
        if (canvas) {
          canvas.style.display = 'block';
        }
        if (overlayCanvas) {
          overlayCanvas.style.display = 'block';
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
        button.textContent = 'Reveal fortune';
        if (canvas && ctx) {
          canvas.style.display = 'none';
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
        if (overlayCanvas && overlayCtx) {
          overlayCanvas.style.display = 'none';
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

  // Mousemove handler: only capture (x, y) coordinates.
  function handleMouseMove(event: MouseEvent): void {
    if (!trackingEnabled) return;
    lastX = event.clientX;
    lastY = event.clientY;
    hasNewSample = true;
  }

  function clearMatchLabels(): void {
    for (const timeoutId of timeoutIds) {
      clearTimeout(timeoutId);
    }
    timeoutIds = [];
    for (const el of matchLabels) {
      try {
        el.remove();
      } catch {
        // ignore
      }
    }
    matchLabels = [];
  }

  function createMatchOverlays(matches: TemplateMatch[]): void {
    void matches;
    drawTemplateOverlays();
  }

  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const drawLabel = (match: TemplateMatch, index: number) => {
    const positions = [
      { x: 0.15, y: 0.15 },
      { x: 0.85, y: 0.20 },
      { x: 0.20, y: 0.80 },
    ];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const posIdx = index < positions.length ? index : positions.length - 1;
    const pos = positions[posIdx];
    const x = pos.x * vw;
    const y = pos.y * vh;

    const label = document.createElement('div');
    label.classList.add('fortune-label', 'fortune-text');
    label.style.all = 'initial';
    label.style.position = 'fixed';
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    label.style.transform = 'translate(-50%, -50%)';
    label.style.pointerEvents = 'none';
    label.style.zIndex = '2';
    label.style.whiteSpace = 'nowrap';
    label.style.color = '#ff4da6';
    label.style.fontFamily = 'BalletFortune, serif';

    const title = document.createElement('div');
    title.textContent = `${index + 1}. ${capitalize(match.name)}`;
    title.style.all = 'initial';
    title.style.fontSize = '60px';
    title.style.display = 'block';
    title.style.color = '#ff4da6';
    title.style.fontFamily = 'BalletFortune, serif';
    label.appendChild(title);

    const def = TEMPLATES.find((t) => t.id === match.id);
    if (def && def.description) {
      const desc = document.createElement('div');
      desc.style.all = 'initial';
      desc.innerHTML = (def.quote ? def.quote + '<br/><br/>' : '') + def.description;
      desc.style.whiteSpace = 'pre-wrap';
      desc.style.maxWidth = '300px';
      desc.style.marginTop = '4px';
      desc.style.fontFamily = 'monospace';
      desc.style.fontSize = '12px';
      desc.style.background = '#ffffff';
      desc.style.color = '#000000';
      desc.style.padding = '2px 4px';
      desc.style.borderRadius = '2px';
      desc.style.display = 'block';
      label.appendChild(desc);
    }

    appendToUiRoot(label);
    matchLabels.push(label);
  };

  function getTemplateResampled(def: TemplateDefinition): Point[][] | null {
    const cached = templateCache[def.id];
    if (cached) return cached;

    const sampled = sampleSvgPathToPoints(def.svg, SVG_SAMPLE_COUNT);
    if (!sampled || sampled.length === 0) {
      templateCache[def.id] = null;
      return null;
    }

    let paths: Point[][];
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

  function loadPointerBitmap(): Promise<ImageBitmap | HTMLImageElement> {
    if (pointerBitmapPromise) return pointerBitmapPromise;

    pointerBitmapPromise = (async () => {
      const blob = new Blob([SVGs.POINTER_SVG], { type: 'image/svg+xml' });

      return new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (typeof img.decode === 'function') {
            img
              .decode()
              .catch(() => {
                // ignore decode errors; image is still usable after onload
              })
              .then(() => {
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

  function projectTemplateOntoRecorded(
    recordedRaw: Point[],
    templatePathsRaw: Point[][],
    bestAngleDeg: number
  ): Point[][] {
    if (recordedRaw.length === 0 || templatePathsRaw.length === 0) return [];

    const cR = centroid(recordedRaw);

    const flatTemplate: Point[] = [];
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

    const rad = (bestAngleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const projectedPaths: Point[][] = [];
    for (const path of templatePathsRaw) {
      const projectedSub: Point[] = [];
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

  function runShapeComparison(): void {
    const cleaned = cleanPoints(points);
    if (cleaned.length < 20) {
      matchResult = null;
      clearMatchLabels();
      console.log('Shape comparison skipped: not enough points.');
      return;
    }

    const recordedResampled = resamplePolylineByArcLength(cleaned, RESAMPLE_COUNT);
    const recordedNormInfo = normalizeForMatching(recordedResampled);
    const recordedNorm = recordedNormInfo.normalized;
    if (recordedNorm.length === 0) {
      matchResult = null;
      clearMatchLabels();
      console.log('Shape comparison failed: unable to normalize recorded path.');
      return;
    }

    const allMatches: TemplateMatch[] = [];

    for (const def of TEMPLATES) {
      const templatePaths = getTemplateResampled(def);
      if (!templatePaths) {
        console.warn(`Template sampling failed for ${def.name}`);
        continue;
      }

      const flatTemplate: Point[] = [];
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
        projectedPaths: [],
      });
    }

    if (allMatches.length === 0) {
      matchResult = null;
      clearMatchLabels();
      console.log('Shape comparison failed: no valid template result.');
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
      matches: topMatches,
    };

    createMatchOverlays(topMatches);
    console.log(
      'Shape comparison ->',
      topMatches.map((m) => ({
        name: m.name,
        score: m.score,
        angleDeg: m.angleDeg,
      }))
    );
  }

  let animationFrameId: number | null = null;
  function animationLoop(): void {
    window.requestAnimationFrame(animationLoop);

    if (!trackingEnabled || !hasNewSample) {
      return;
    }

    hasNewSample = false;

    const x = lastX;
    const y = lastY;
    if (x == null || y == null) return;

    const maxPoints = 5000;
    if (points.length >= maxPoints) {
      points.shift();
    }
    points.push({ x, y });
    savePointsToStorage();
  }

  function init(): void {
    loadPointsFromStorage(() => {
      createIsolatedRoot();
      createCanvasOverlay();
      createToggleButton();

      window.addEventListener('resize', handleResize);
      window.addEventListener('mousemove', handleMouseMove, { passive: true });

      animationLoop();
    });
  }

  init();
})();
