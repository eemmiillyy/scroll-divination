// content.ts - records mouse (x, y) movement and can optionally replay it as a drawing.
// Recording is always on by default; drawing is user-toggleable via a small button.

// `chrome` is provided by the Chrome extensions environment at runtime.
declare const chrome: any;

(() => {
  'use strict';

  type Point = { x: number; y: number };

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
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none'; // Do not block page interaction.
    canvas.style.background = 'transparent';
    canvas.style.zIndex = '2147483646';
    canvas.style.display = 'none';

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const context = canvas.getContext('2d');
    if (!context) return;
    ctx = context;

    // Very dark green stroke color for the path.
    ctx.strokeStyle = 'rgba(0, 64, 0, 0.9)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    document.body.appendChild(canvas);
  }

  // Resize canvas when the viewport changes.
  function handleResize(): void {
    if (!canvas || !ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // We intentionally do NOT redraw past points to keep the logic simple.
  }

  // Draw the full path from all recorded points on the canvas.
  function drawFullPath(): void {
    if (!canvas || !ctx) return;
    if (points.length < 2) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    const first = points[0];
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // Create a small toggle button to show/hide drawing.
  function createToggleButton(): void {
    const button = document.createElement('button');
    button.textContent = 'Show drawing';
    button.style.position = 'fixed';
    button.style.bottom = '10px';
    button.style.right = '10px';
    button.style.zIndex = '2147483647';
    button.style.padding = '4px 8px';
    button.style.fontSize = '12px';
    button.style.border = '1px solid #ccc';
    button.style.borderRadius = '4px';
    button.style.background = 'rgba(255,255,255,0.9)';
    button.style.color = '#000';
    button.style.cursor = 'pointer';

    button.addEventListener('click', () => {
      drawingEnabled = !drawingEnabled;

      if (drawingEnabled) {
        // Show past path and pause tracking while visible.
        trackingEnabled = false;
        button.textContent = 'Hide drawing';
        if (canvas) {
          canvas.style.display = 'block';
        }
        drawFullPath();
      } else {
        // Hide drawing, reset history (including persisted data),
        // and resume tracking from a clean slate.
        points.length = 0;
        lastX = null;
        lastY = null;
        hasNewSample = false;
        savePointsToStorage();

        trackingEnabled = true;
        button.textContent = 'Show drawing';
        if (canvas && ctx) {
          canvas.style.display = 'none';
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });

    document.body.appendChild(button);
  }

  // Mousemove handler: only capture (x, y) coordinates.
  function handleMouseMove(event: MouseEvent): void {
    if (!trackingEnabled) return;
    lastX = event.clientX;
    lastY = event.clientY;
    hasNewSample = true;
  }

  // Animation loop throttled by requestAnimationFrame (~60fps).
  function animationLoop(): void {
    window.requestAnimationFrame(animationLoop);

    if (!trackingEnabled || !hasNewSample) {
      return;
    }

    hasNewSample = false;

    const x = lastX;
    const y = lastY;
    if (x == null || y == null) return;

    points.push({ x, y });
    // Keep storage in sync while we are tracking.
    savePointsToStorage();
  }

  function init(): void {
    // Restore any previously recorded path for this extension BEFORE
    // we wire up UI and start tracking, so the first "Show drawing"
    // click always sees the restored path.
    loadPointsFromStorage(() => {
      createCanvasOverlay();
      createToggleButton();

      window.addEventListener('resize', handleResize);
      window.addEventListener('mousemove', handleMouseMove, { passive: true });

      animationLoop();
    });
  }

  init();
})();

