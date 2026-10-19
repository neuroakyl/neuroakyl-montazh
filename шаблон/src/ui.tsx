import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { C, F, H, HANDLE, W, clamp, k, lerp, sharp } from "./lib";

// ── Фоны: три мира референса (винный / чёрный / молочный) ─────────────────────
export const Bg: React.FC<{ kind: "red" | "black" | "pink" }> = ({ kind }) => {
  if (kind === "red")
    return <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 55% at 50% 42%, ${C.red} 0%, #8A0509 45%, ${C.redEdge} 100%)` }} />;
  if (kind === "black")
    return <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 45% at 50% 50%, ${C.black} 0%, #0E0C0F 55%, ${C.blackEdge} 100%)` }} />;
  return (
    <AbsoluteFill style={{ background: C.pink }}>
      {/* мягкие тёмные углы, как у оригинала */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 62% at 50% 52%, rgba(255,237,239,0) 62%, rgba(120,100,104,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

export const Handle: React.FC = () =>
  HANDLE ? (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1712, textAlign: "center", fontFamily: F.ui, fontWeight: 500, fontSize: 22, color: "rgba(255,255,255,0.85)" }}>
      {HANDLE}
    </div>
  ) : null;

// ── Появление «размытый зум» (блюр + лёгкий скейл), 0,14 с ─────────────────────
export function blurIn(t: number, a: number, d = 0.14, from = 1.07) {
  const u = k(t, a, d, sharp);
  return { opacity: Math.min(1, u * 2.2), filter: `blur(${lerp(14, 0, u)}px)`, transform: `scale(${lerp(from, 1, u)})` };
}

export const headStyle = (size: number, color = C.white): React.CSSProperties => ({
  fontFamily: F.head,
  fontSize: size,
  lineHeight: 0.92,
  color,
  textTransform: "uppercase",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
});

export const capStyle = (size = 52, color = C.white): React.CSSProperties => ({
  fontFamily: F.ui,
  fontWeight: 700,
  fontSize: size,
  color,
  letterSpacing: "-0.02em",
  whiteSpace: "nowrap",
});

export const scriptStyle = (size: number, color = C.white): React.CSSProperties => ({
  fontFamily: F.script,
  fontSize: size,
  color,
  whiteSpace: "nowrap",
  lineHeight: 1,
});

// По центру точки (x, y)
export const At: React.FC<{ x?: number; y: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ x = W / 2, y, style, children }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", ...style }}>{children}</div>
);

// ── Смена фраз в одном месте: новая заходит блюр-зумом, старая исчезает сразу ──
export type Item = [t: number, node: React.ReactNode];
export const Swap: React.FC<{ t: number; items: Item[]; until: number; y?: number; x?: number; d?: number }> = ({ t, items, until, y = H / 2, x = W / 2, d = 0.13 }) => {
  if (t >= until) return null;
  let cur = -1;
  items.forEach(([a], i) => {
    if (t >= a) cur = i;
  });
  if (cur < 0) return null;
  const [a, node] = items[cur];
  return (
    <At x={x} y={y}>
      <div style={blurIn(t, a, d)}>{node}</div>
    </At>
  );
};

// ── Призрачный «ШАГ»: тёмно-красный по красному, всплывает из размытия ────────
export const Ghost: React.FC<{ t: number; a: number; text: string; y?: number }> = ({ t, a, text, y = H / 2 }) => {
  const u = k(t, a, 0.35);
  return (
    <At y={y}>
      <div style={{ ...headStyle(118, C.redDeep), opacity: 0.7 * u, filter: `blur(${lerp(10, 1.6, u)}px)` }}>{text}</div>
    </At>
  );
};

// ── Плашка: сначала линия, потом раскрывается по высоте (как «НИША») ─────────
export const Plaque: React.FC<{
  t: number;
  a: number;
  children: React.ReactNode;
  bg?: string;
  pad?: string;
  style?: React.CSSProperties;
}> = ({ t, a, children, bg = C.white, pad = "8px 18px", style }) => {
  const line = k(t, a, 0.14);
  const open = k(t, a + 0.1, 0.18);
  if (t < a) return null;
  return (
    <div style={{ position: "relative", display: "inline-block", transform: `scaleX(${lerp(0.15, 1, line)}) scaleY(${lerp(0.08, 1, open)})`, ...style }}>
      <div style={{ background: bg, padding: pad }}>{children}</div>
    </div>
  );
};

// ── Каллиграфия «пишется» слева направо ───────────────────────────────────────
export const Write: React.FC<{ t: number; a: number; d?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ t, a, d = 0.45, children, style }) => {
  const u = interpolate(t, [a, a + d], [0, 1], clamp);
  if (t < a) return null;
  return (
    <div style={{ clipPath: `inset(-30% ${lerp(100, -5, u)}% -30% -5%)`, filter: `blur(${lerp(3, 0, u)}px)`, ...style }}>{children}</div>
  );
};

// ── Стрелка-дуга, рисуется по длине ───────────────────────────────────────────
export const Arc: React.FC<{ t: number; a: number; d?: number; path: string; len?: number; color?: string; width?: number; head?: boolean }> = ({
  t,
  a,
  d = 0.4,
  path,
  len = 600,
  color = "rgba(255,255,255,0.85)",
  width = 2.4,
  head = true,
}) => {
  const u = k(t, a, d, sharp);
  if (t < a) return null;
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={len}
      strokeDashoffset={len * (1 - u)}
      markerEnd={head && u > 0.95 ? "url(#ah)" : undefined}
    />
  );
};

export const ArrowDefs: React.FC<{ color?: string }> = ({ color = "rgba(255,255,255,0.9)" }) => (
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1,1 L8,5 L1,9" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </marker>
  </defs>
);
