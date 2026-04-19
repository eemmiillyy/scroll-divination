import { RESAMPLE_COUNT, SVG_SAMPLE_COUNT } from './constants';
import { SVGs } from './svgs';
import { Point, TemplateDefinition } from './types';

  function distanceSquared(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  type StampPoint = { x: number; y: number; angle: number };

  function cleanPoints(input: Point[]): Point[] {
    if (input.length === 0) return [];
    const cleaned: Point[] = [];
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
        // Drop tiny moves (< 2px).
        continue;
      }
      cleaned.push(p);
      last = p;
    }
    return cleaned;
  }

  function resamplePolylineByArcLength(pointsIn: Point[], count: number): Point[] {
    if (count <= 0 || pointsIn.length === 0) return [];
    if (pointsIn.length === 1) {
      return Array.from({ length: count }, () => ({ x: pointsIn[0].x, y: pointsIn[0].y }));
    }

    // Compute total length of the polyline.
    let totalLength = 0;
    for (let i = 1; i < pointsIn.length; i++) {
      totalLength += Math.sqrt(distanceSquared(pointsIn[i - 1], pointsIn[i]));
    }
    if (totalLength === 0) {
      return Array.from({ length: count }, () => ({ x: pointsIn[0].x, y: pointsIn[0].y }));
    }

    const step = totalLength / (count - 1);
    const resampled: Point[] = [];
    resampled.push({ x: pointsIn[0].x, y: pointsIn[0].y });

    let D = 0; // distance since last emitted point
    let prev: Point = { x: pointsIn[0].x, y: pointsIn[0].y };

    for (let i = 1; i < pointsIn.length && resampled.length < count - 1; i++) {
      let curr = pointsIn[i];
      let segLen = Math.sqrt(distanceSquared(prev, curr));

      // Skip zero-length segments.
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

        // Prepare for possibly emitting another point within the same segment.
        prev = newPoint;
        segLen -= remain;
        D = 0;
      }

      D += segLen;
      prev = curr;
    }

    // Ensure last point is exactly the end of the original polyline.
    const lastOriginal = pointsIn[pointsIn.length - 1];
    while (resampled.length < count - 1) {
      resampled.push({ x: lastOriginal.x, y: lastOriginal.y });
    }
    resampled.push({ x: lastOriginal.x, y: lastOriginal.y });

    // Clamp and enforce final count.
    if (resampled.length > count) {
      resampled.length = count;
      resampled[count - 1] = { x: lastOriginal.x, y: lastOriginal.y };
    }

    if (resampled.length !== count) {
      console.warn('resamplePolylineByArcLength: length mismatch', {
        inputCount: pointsIn.length,
        expected: count,
        actual: resampled.length,
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
      console.debug('resamplePolylineByArcLength spacing', {
        avgSeg,
        minSeg,
        maxSeg,
      });
    }

    return resampled;
  }

  function computeStampPoints(path: Point[], spacingPx: number): StampPoint[] {
    const n = path.length;
    if (n < 2 || spacingPx <= 0) return [];

    // Adaptive spacing based on path length, scaled ~50% more than before.
    let spacing = spacingPx;
    if (n > 12000) {
      spacing = 18;
    } else if (n > 5000) {
      spacing = 14;
    }
    spacing *= 1.5;

    const stamps: StampPoint[] = [];
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

        // Move along the segment for further stamps.
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

  function centroid(pts: Point[]): Point {
    if (pts.length === 0) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / pts.length, y: sy / pts.length };
  }

  function rmsRadius(pts: Point[]): number {
    if (pts.length === 0) return 0;
    let sumSq = 0;
    for (const p of pts) {
      sumSq += p.x * p.x + p.y * p.y;
    }
    return Math.sqrt(sumSq / pts.length);
  }

  function normalizeForMatching(ptsIn: Point[]): { normalized: Point[]; center: Point; rms: number } {
    if (ptsIn.length === 0) {
      return { normalized: [], center: { x: 0, y: 0 }, rms: 0 };
    }
    const c = centroid(ptsIn);
    const centered: Point[] = ptsIn.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const r = rmsRadius(centered);
    if (r <= 0) {
      return { normalized: centered, center: c, rms: r };
    }
    const scale = 1 / r;
    const normalized = centered.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    return { normalized, center: c, rms: r };
  }

  function rotatePoints(pts: Point[], angleDeg: number): Point[] {
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    return pts.map((p) => ({
      x: p.x * cosA - p.y * sinA,
      y: p.x * sinA + p.y * cosA,
    }));
  }

  function chamferDistance(a: Point[], b: Point[]): number {
    if (a.length === 0 || b.length === 0) return Infinity;

    function avgNearest(from: Point[], to: Point[]): number {
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

  function sampleSvgPathToPoints(svgString: string, sampleCount: number): Point[][] | null {
    try {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.width = '0';
      container.style.height = '0';
      container.style.overflow = 'hidden';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      container.innerHTML = svgString.trim();
      document.body.appendChild(container);

      const paths = Array.from(container.querySelectorAll('path')) as SVGPathElement[];
      if (!paths.length) {
        console.error('SVG sampling failed: <path> not found');
        container.remove();
        return null;
      }

      const lengths = paths.map((p) => p.getTotalLength());
      const totalLen = lengths.reduce((acc, v) => acc + v, 0);
      if (!isFinite(totalLen) || totalLen <= 0) {
        console.error('SVG sampling failed: invalid total path length');
        container.remove();
        return null;
      }

      // Distribute samples across paths roughly proportional to length.
      const counts: number[] = [];
      let allocated = 0;
      for (let i = 0; i < paths.length; i++) {
        let n = Math.round((lengths[i] / totalLen) * sampleCount);
        if (n < 2) n = 2;
        counts.push(n);
        allocated += n;
      }
      // Adjust to hit the requested total sampleCount.
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

      const allPts: Point[][] = [];
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const pathLen = lengths[i];
        const n = counts[i];
        const subPts: Point[] = [];
        if (!isFinite(pathLen) || pathLen <= 0) {
          continue;
        }
        for (let k = 0; k < n; k++) {
          const t = n === 1 ? 0 : (k / (n - 1)) * pathLen;
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
      console.error('SVG sampling error', err);
      return null;
    }
  }

  export {
    type Point,
    type StampPoint,
    distanceSquared,
    cleanPoints,
    resamplePolylineByArcLength,
    computeStampPoints,
    centroid,
    rmsRadius,
    normalizeForMatching,
    rotatePoints,
    chamferDistance,
    sampleSvgPathToPoints
  };