type Point = { x: number; y: number };

type TemplateDefinition = {
    id: string;
    name: string;
    svg: string;
    description: string;
    quote?: string;
  };

  type TemplateMatch = {
    id: string;
    name: string;
    score: number;
    angleDeg: number;
    templatePaths: Point[][]; // resampled template subpaths in SVG coords
    projectedPaths: Point[][]; // projected subpaths in viewport coords
  };

  type MatchResult = {
    recordedResampled: Point[]; // cleaned + resampled in viewport coords
    matches: TemplateMatch[]; // sorted by ascending score, up to top K
  };

  export {
    type Point,
    type TemplateDefinition,
    type TemplateMatch,
    type MatchResult,
  };
