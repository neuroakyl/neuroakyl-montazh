import React from "react";
import { H, W, back, k, rand } from "../lib";
import type { V3 } from "./camera";

/**
 * Объём кодом без долгой возни (ролик «Тест — алтын», 08.11.2026: «анимации скучные — сделай 2D/3D»).
 * Два способа, оба без размытия и тумана: глубина = размер + темнее.
 *   1) проекция точек: рой частиц, шар с деталями по сфере, вращение (Swarm3D, SpherePoints + proj);
 *   2) CSS-3D: плоский предмет с толщиной и бликом, который поворачивается к зрителю (Slab3D).
 *
 *   <Swarm3D t={t} a={a} color="gold" />                         — рой из 220 шаров вращается и рождается
 *   <Slab3D t={t} w={900} h={320} ry={lerp(-50, 10, u)} rx={20} side="#AEB6C6">{лицевая сторона}</Slab3D>
 *   <Sparks t={t} a={a} x={540} y={960} />                        — искры из точки (успех, «бах»)
 */
export const rotY = ([x, y, z]: V3, a: number): V3 => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
export const rotX = ([x, y, z]: V3, a: number): V3 => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
/** точка в кадр: z — к зрителю, камера на расстоянии D. s — масштаб (ближе = крупнее) */
export const proj = (p: V3, cx: number, cy: number, D = 1700) => {
  const s = D / (D - p[2]);
  return { x: cx + p[0] * s, y: cy + p[1] * s, s, z: p[2] };
};
/** n точек ровно по единичной сфере (спираль Фибоначчи) — «детали по всему шару» */
export const spherePoints = (n: number): V3[] =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  });
/** последовательность «случайных» чисел от зерна (кадр не мигает: одно и то же на каждом рендере) */
export const seq = (seed: number) => {
  let n = seed * 97 + 1;
  return () => rand(n++);
};

// Шары с объёмом: радиальный градиент с бликом. Свой цвет — добавь строку [светлый, основной, тёмный].
export const BALLS: Record<string, [string, string, string]> = {
  gold: ["#FFF0A8", "#F2B526", "#6E4A05"],
  red: ["#FFC2CB", "#E5294A", "#5E0716"],
  violet: ["#E7CCFF", "#B26BFF", "#3D1170"],
  blue: ["#D6F4FF", "#5FD3FF", "#0B4A73"],
  green: ["#CFFFE2", "#2EE37A", "#0B5A2C"],
  white: ["#FFFFFF", "#D9DEE8", "#5E6678"],
};
export const BallDefs: React.FC = () => (
  <defs>
    {Object.entries(BALLS).map(([id, [l, m, d]]) => (
      <radialGradient key={id} id={`ball-${id}`} cx="34%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="18%" stopColor={l} />
        <stop offset="55%" stopColor={m} />
        <stop offset="100%" stopColor={d} />
      </radialGradient>
    ))}
  </defs>
);
/** шар внутри <svg> с <BallDefs />. dark 0..1 — затемнение дальних */
export const Ball: React.FC<{ x: number; y: number; r: number; color?: string; dark?: number; o?: number; bg?: string }> = ({ x, y, r, color = "gold", dark = 0, o = 1, bg = "6,10,23" }) =>
  r <= 0.2 ? null : (
    <g opacity={o}>
      <circle cx={x} cy={y} r={r} fill={`url(#ball-${color})`} />
      {dark > 0.02 && <circle cx={x} cy={y} r={r} fill={`rgba(${bg},${dark})`} />}
    </g>
  );

/** рой частиц в объёме: рождается из центра с отскоком, вращается, ближние крупнее и светлее */
export const Swarm3D: React.FC<{ t: number; a: number; n?: number; R?: number; cx?: number; cy?: number; spin?: number; size?: number; zoom?: number; color?: string; seed?: number }> = ({
  t,
  a,
  n = 220,
  R = 520,
  cx = W / 2,
  cy = 900,
  spin = 0.35,
  size = 15,
  zoom = 1,
  color = "gold",
  seed = 700,
}) => {
  const pts = Array.from({ length: n }, (_, i) => {
    const r = seq(i + seed);
    const th = r() * Math.PI * 2;
    const ph = Math.acos(2 * r() - 1);
    const rad = R * Math.cbrt(r()) * zoom;
    const born = k(t, a + r() * 1.1, 0.45, back);
    let p: V3 = [Math.sin(ph) * Math.cos(th) * rad * born, Math.cos(ph) * rad * born, Math.sin(ph) * Math.sin(th) * rad * born];
    p = rotX(rotY(p, (t - a) * spin + 0.6), 0.32);
    const q = proj(p, cx, cy);
    return { ...q, rr: size * (0.6 + r() * 0.8) * q.s * born * zoom, i };
  }).sort((u, v) => u.z - v.z);
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <BallDefs />
      {pts.map((p) => (
        <Ball key={p.i} x={p.x} y={p.y} r={p.rr} color={color} dark={Math.max(0, Math.min(0.6, (-p.z / (R * zoom)) * 0.55))} />
      ))}
    </svg>
  );
};

/**
 * Плоский предмет с толщиной (карта, телефон, тест, купюра, табличка): лицевая сторона — children (w×h),
 * под ней layers слоёв цвета side — это и есть толщина. Блик едет по лицу при повороте ry.
 * Углы — в градусах. Поворот к зрителю на слове = ry от −50 к 10 за 1 с.
 */
export const Slab3D: React.FC<{
  w: number;
  h: number;
  ry: number;
  rx?: number;
  rz?: number;
  s?: number;
  cx?: number;
  cy?: number;
  side?: string;
  radius?: number;
  layers?: number;
  shadow?: boolean;
  children: React.ReactNode;
}> = ({ w, h, ry, rx = 0, rz = 0, s = 1, cx = W / 2, cy = H / 2, side = "#AEB6C6", radius = 40, layers = 16, shadow = true, children }) => {
  const shine = ((ry + 60) / 120) * 100;
  return (
    <div style={{ position: "absolute", left: cx, top: cy, width: 0, height: 0, perspective: 2200 }}>
      <div style={{ position: "absolute", left: -w / 2, top: -h / 2, width: w, height: h, transformStyle: "preserve-3d", transform: `scale(${s}) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)` }}>
        {shadow && (
          <div style={{ position: "absolute", left: w * 0.07, top: h * 0.35, width: w * 0.86, height: h * 0.4, borderRadius: h, background: "radial-gradient(closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0))", transform: `translateZ(-${layers * 5 + 60}px)` }} />
        )}
        {Array.from({ length: layers }, (_, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, borderRadius: radius, background: side, transform: `translateZ(${-(i + 1) * 5}px)` }} />
        ))}
        <div style={{ position: "absolute", inset: 0, borderRadius: radius, overflow: "hidden", transform: "translateZ(1px)" }}>
          {children}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg, rgba(255,255,255,0) ${shine - 12}%, rgba(255,255,255,0.6) ${shine}%, rgba(255,255,255,0) ${shine + 12}%)` }} />
        </div>
      </div>
    </div>
  );
};

/** искры из точки: разлёт с гравитацией, гаснут за ~0,8 с */
export const Sparks: React.FC<{ t: number; a: number; x: number; y: number; n?: number; spread?: number; color?: string; glow?: string; seed?: number }> = ({
  t,
  a,
  x,
  y,
  n = 16,
  spread = 1,
  color = "#FFE27A",
  glow = "#FFC83D",
  seed = 400,
}) =>
  t < a ? null : (
    <>
      {Array.from({ length: n }, (_, i) => {
        const r = seq(i + seed);
        const p = Math.max(0, t - a - r() * 0.4);
        const ang = r() * Math.PI * 2;
        const v = (260 + r() * 420) * spread;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x + Math.cos(ang) * p * v,
              top: y + Math.sin(ang) * p * v + p * p * 300,
              width: 16,
              height: 16,
              borderRadius: 8,
              background: color,
              boxShadow: `0 0 18px ${glow}`,
              opacity: Math.max(0, 1 - p * 1.3),
            }}
          />
        );
      })}
    </>
  );
