// Осциллограф: бегущий график с точкой на конце (ускорение, пульс, сигнал, «шаг против тряски»).
// Сигнал — функция времени; готовые: steps (зубцы на заданных моментах), noise (беспорядочная тряска), calm (почти ровно).
// Из ролика «как айфон считает шаги» (21.10.2026): под зубцами едут следы — `scopeX` даёт x зубца на экране.
import React from "react";
import { FPS } from "../lib";
import { useCurrentFrame } from "remotion";

export type Sig = (t: number) => number;

/** Зубец: провал → высокий пик → провал. */
export const spike = (u: number) =>
  Math.exp(-((u / 0.032) ** 2)) - 0.42 * Math.exp(-(((u - 0.075) / 0.045) ** 2)) - 0.18 * Math.exp(-(((u + 0.07) / 0.05) ** 2));

/** Зубцы в моменты times (секунды) поверх лёгкого дрожания. */
export const steps = (times: number[], amp = 1): Sig => (t) => {
  let v = 0.035 * Math.sin(t * 13) + 0.02 * Math.sin(t * 29);
  for (const s of times) if (Math.abs(t - s) < 0.4) v += amp * spike(t - s);
  return v;
};

/** Беспорядочная тряска: сумма синусов с «случайными» частотами (детерминированно по seed). */
export const noise = (seed: number, amp = 0.75, speed = 1): Sig => {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const parts = Array.from({ length: 9 }, () => ({ f: (6 + r() * 38) * speed, p: r() * 6.28, a: 0.3 + r() * 0.7 }));
  const sum = parts.reduce((x, q) => x + q.a, 0);
  return (t) => ((amp * parts.reduce((x, q) => x + q.a * Math.sin(t * q.f + q.p), 0)) / sum) * 1.6;
};

export const calm = (amp = 0.06): Sig => (t) => amp * (Math.sin(t * 9) * 0.6 + Math.sin(t * 23 + 1) * 0.4);

/** X на экране для момента s (чтобы поставить след/метку под зубцом). */
export const scopeX = (x: number, w: number, s: number, t: number, win = 2.4, pad = 26) => x + pad + ((s - (t - win)) / win) * (w - pad * 2);

export const Scope: React.FC<{
  x: number; y: number; w: number; h: number; sig: Sig; color: string; win?: number; amp?: number; lw?: number;
  frame?: boolean; label?: string; timeLabel?: string; font?: string; panel?: string; line?: string; children?: React.ReactNode;
}> = ({ x, y, w, h, sig, color, win = 2.4, amp = 0.38, lw = 5, frame = true, label, timeLabel, font = "monospace", panel = "rgba(8,34,24,.72)", line = "rgba(170,255,140,.22)", children }) => {
  const t = useCurrentFrame() / FPS;
  const N = 220, pad = 26, iw = w - pad * 2, mid = h * 0.56;
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    pts.push(`${(pad + u * iw).toFixed(1)},${(mid - sig(t - win + u * win) * h * amp).toFixed(1)}`);
  }
  const last = pts[N - 1].split(",").map(Number);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 18, background: frame ? panel : "transparent", border: frame ? `2px solid ${line}` : "none" }}>
      {label && <div style={{ position: "absolute", left: 18, top: 14, fontFamily: font, fontSize: 21, opacity: 0.6, color: "#fff" }}>{label}</div>}
      {timeLabel && <div style={{ position: "absolute", right: 18, bottom: 12, fontFamily: font, fontSize: 21, opacity: 0.6, color: "#fff" }}>{timeLabel}</div>}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={lw + 8} strokeLinejoin="round" opacity={0.18} />
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={lw} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
        <circle cx={last[0]} cy={last[1]} r={lw + 3} fill={color} style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
      </svg>
      {children}
    </div>
  );
};
