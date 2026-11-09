import React from "react";
import { AbsoluteFill } from "remotion";
import { H, W, back, inOut, k, lerp, rand, sharp } from "../../lib";
import { B, P, hexA } from "./recept";

/**
 * Банк акцентов — чем выделить главное в кадре (цифру, слово, предмет): 10 видов. Цвет — бренд, вид — рецепт (P.akcent).
 *   <Akcent t={t} a={at("главное")} x={540} y={900} w={600} h={220} />   — рамка цели: центр x, y и размер w × h
 * ellipse — обвод от руки; underline — черта снизу; arrow — стрелка прилетает сбоку; box — рамка рисуется; brackets — уголки
 * защёлкиваются; burst — лучи-всплеск; spot — прожектор (всё вокруг темнеет); disc — круг цвета бренда за целью;
 * sparkle — звёздочки; tag — плашка-ярлык сверху. disc и spot ставь в сцене ДО цели (они под ней), остальные — после.
 *
 * Камера (как живёт кадр): kamera(t, hits) → transform для всего тела ролика. Виды — KAMERA.
 */
export const AKCENT = ["ellipse", "underline", "arrow", "box", "brackets", "burst", "spot", "disc", "sparkle", "tag"] as const;
export const KAMERA = ["drift", "handheld", "breathe", "punch", "sway", "steps", "float", "still"] as const;

export const Akcent: React.FC<{ t: number; a: number; x: number; y: number; w: number; h: number; kind?: string; label?: string; out?: number }> = ({ t, a, x, y, w, h, kind, label = "!", out = 999 }) => {
  if (t < a || t > out + 0.3) return null;
  const kd = kind ?? P.akcent;
  const s = t - a;
  const u = k(s, 0, 0.4, inOut);
  const fade = 1 - k(t, out, 0.25);
  const C = B.accent;
  const L = x - w / 2;
  const T = y - h / 2;
  let el: React.ReactNode = null;
  switch (kd) {
    case "underline":
      el = <div style={{ position: "absolute", left: L, top: y + h / 2 + 6, height: 14, width: w * u, background: C, borderRadius: 14, transform: "rotate(-1.5deg)" }} />;
      break;
    case "arrow": {
      // стрелка прилетает справа и упирается в правый край цели, остриё смотрит на цель
      const p = k(s, 0, 0.35, sharp);
      const ax = lerp(W + 300, x + w / 2 + 30, p);
      el = (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <g transform={`translate(${ax}, ${y + h * 0.15}) rotate(-18)`}>
            <path d="M 0 0 Q 120 -70 250 -20" stroke={C} strokeWidth={16} fill="none" strokeLinecap="round" />
            <path d="M 0 0 L 52 -26 M 0 0 L 40 42" stroke={C} strokeWidth={16} fill="none" strokeLinecap="round" />
          </g>
        </svg>
      );
      break;
    }
    case "box": {
      const per = 2 * (w + h) + 40;
      el = (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <rect x={L - 20} y={T - 20} width={w + 40} height={h + 40} rx={18} stroke={C} strokeWidth={10} fill="none" strokeDasharray={per} strokeDashoffset={per * (1 - u)} />
        </svg>
      );
      break;
    }
    case "brackets": {
      const p = k(s, 0, 0.3, back);
      const g = lerp(80, 0, p);
      const sz = 70;
      el = (
        <>
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([dx, dy], i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x + dx * (w / 2 + 20 + g) - (dx > 0 ? sz : 0),
                top: y + dy * (h / 2 + 20 + g) - (dy > 0 ? sz : 0),
                width: sz,
                height: sz,
                borderColor: C,
                borderStyle: "solid",
                borderWidth: `${dy < 0 ? 10 : 0}px ${dx > 0 ? 10 : 0}px ${dy > 0 ? 10 : 0}px ${dx < 0 ? 10 : 0}px`,
                opacity: Math.min(1, p * 2),
              }}
            />
          ))}
        </>
      );
      break;
    }
    case "burst":
      el = (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const p = k(s, 0, 0.35, sharp);
            const r0 = Math.max(w, h) / 2 + 20 + p * 40;
            const r1 = r0 + lerp(0, 90, p) * (1 - k(s, 0.35, 0.3));
            return <line key={i} x1={x + Math.cos(ang) * r0} y1={y + Math.sin(ang) * r0} x2={x + Math.cos(ang) * r1} y2={y + Math.sin(ang) * r1} stroke={C} strokeWidth={12} strokeLinecap="round" />;
          })}
        </svg>
      );
      break;
    case "spot":
      el = <AbsoluteFill style={{ background: `radial-gradient(ellipse ${w * 0.75}px ${h * 0.9}px at ${x}px ${y}px, transparent 60%, rgba(0,0,0,${0.7 * u}) 100%)` }} />;
      break;
    case "disc": {
      const p = k(s, 0, 0.35, back);
      const r = (Math.max(w, h) / 2 + 40) * p;
      el = <div style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: r, background: hexA(C, 0.35), boxShadow: `0 0 80px ${hexA(C, 0.5)}` }} />;
      break;
    }
    case "sparkle":
      el = (
        <>
          {Array.from({ length: 6 }, (_, i) => {
            const ang = rand(i + 5) * Math.PI * 2;
            const rr = Math.max(w, h) / 2 + 30 + rand(i) * 60;
            const p = k(s, i * 0.05, 0.3, back);
            const tw = 0.7 + 0.3 * Math.sin((s - i * 0.05) * 10);
            const sz = (34 + rand(i + 2) * 30) * p * tw;
            return (
              <svg key={i} width={sz * 2} height={sz * 2} viewBox="-10 -10 20 20" style={{ position: "absolute", left: x + Math.cos(ang) * rr - sz, top: y + Math.sin(ang) * rr - sz }}>
                <path d="M0 -10 Q1 -1 10 0 Q1 1 0 10 Q-1 1 -10 0 Q-1 -1 0 -10Z" fill={i % 2 ? C : B.light} />
              </svg>
            );
          })}
        </>
      );
      break;
    case "tag": {
      const p = k(s, 0, 0.3, back);
      el = (
        <div style={{ position: "absolute", left: x, top: T - 90, transform: `translateX(-50%) scale(${p}) rotate(-4deg)`, background: C, color: B.dark, fontFamily: "K-Head", fontSize: 54, padding: "6px 26px", borderRadius: 12 }}>
          {label}
        </div>
      );
      break;
    }
    default: {
      // ellipse — обвод от руки (контур чуть не замкнут)
      const rx = w / 2 + 40;
      const ry = h / 2 + 30;
      const per = Math.PI * (rx + ry) * 1.15;
      el = (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(-4 ${x} ${y})`} stroke={C} strokeWidth={11} fill="none" strokeLinecap="round" strokeDasharray={per} strokeDashoffset={per * (1 - u * 1.08)} />
        </svg>
      );
    }
  }
  return <AbsoluteFill style={{ opacity: fade, pointerEvents: "none" }}>{el}</AbsoluteFill>;
};

/** как живёт кадр: transform для тела ролика; hits — удары (главные слова) */
export const kamera = (t: number, hits: number[] = [], kind?: string): string => {
  const kd = kind ?? P.kamera;
  const n = (s: number) => Math.sin(t * s) * 0.6 + Math.sin(t * s * 2.3 + 1.7) * 0.4;
  const last = hits.filter((h) => h <= t).at(-1);
  const hit = (amp: number, d = 0.45) => (last !== undefined && t - last < d ? 1 + amp * (1 - (t - last) / d) : 1);
  switch (kd) {
    case "handheld":
      return `translate(${n(1.7) * 7}px, ${n(1.3) * 6}px) rotate(${n(0.9) * 0.35}deg) scale(${1.03 * hit(0.03)})`;
    case "breathe":
      return `scale(${1.02 + Math.sin(t * 1.2) * 0.012})`;
    case "punch":
      return `scale(${hit(0.08, 0.35)})`;
    case "sway":
      return `rotate(${Math.sin(t * 0.7) * 0.6}deg) scale(${1.03 * hit(0.03)})`;
    case "steps": {
      // рывки крупности 100 ↔ 112 % на каждом ударе (как в трендовых роликах)
      const i = hits.filter((h) => h <= t).length;
      return `scale(${i % 2 ? 1.12 : 1})`;
    }
    case "float":
      return `translate(${Math.sin(t * 0.35) * 16}px, ${Math.cos(t * 0.3) * 12}px) scale(1.04)`;
    case "still":
      return "none";
    default: // drift
      return `scale(${(1 + Math.min(0.06, t * 0.003)) * hit(0.035)})`;
  }
};

