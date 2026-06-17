export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** ease-out cubic */
export const eo3 = (t: number) => 1 - (1 - t) ** 3;

/** ease-in cubic */
export const ei3 = (t: number) => t ** 3;

/** smoothstep between edges */
export const sm = (p: number, a: number, b: number) => {
  const t = clamp01((p - a) / Math.max(0.0001, b - a));
  return t * t * (3 - 2 * t);
};

export type PortalTheme = "dark" | "light" | "void";

export type PinScene = {
  id: string;
  label: string;
  theme: PortalTheme;
  trackHeightVh: number;
  update: (progress: number, refs: PortalSceneRefs) => void;
};

export type PortalSceneRefs = {
  root: HTMLElement;
  isMobile: boolean;
  blurScale: number;
};