import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from "remotion";
import { H, W, has, rand } from "../../lib";
import { B, P, hexA } from "./recept";

/**
 * Банк фонов графических сцен: 13 видов, все в цветах бренда и все живые (кадр не стоит даже на паузе).
 *   <Fon t={t} />  или  <Fon t={t} kind="grid" />    tone — 0..1 сколько цвета бренда подмешать (по умолчанию 0,35)
 * pak — текстура из пака монтажёра (P.pak.tekstura: картинка или видео в public/pak); нет файла — gradient.
 */
export const FON = ["gradient", "grid", "dots", "aurora", "rays", "stripes", "bokeh", "paper", "mesh", "rings", "hud", "split", "pak"] as const;

export const Fon: React.FC<{ t: number; kind?: string; tone?: number }> = ({ t, kind, tone = 0.35 }) => {
  let kd = kind ?? P.fon;
  const file = P.pak?.tekstura;
  if (kd === "pak" && !(file && has(file))) kd = "gradient";
  const A = B.accent;
  const D = B.dark;
  const base = <AbsoluteFill style={{ background: `radial-gradient(120% 75% at 50% 35%, ${mix(D, A, tone * 0.5)} 0%, ${D} 72%)` }} />;
  const vignette = <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)" }} />;
  let layer: React.ReactNode = null;
  switch (kd) {
    case "grid": {
      const off = (t * 120) % 120;
      layer = (
        <AbsoluteFill style={{ perspective: 900 }}>
          <div style={{ position: "absolute", left: -W, right: -W, top: H * 0.45, height: H * 1.2, transform: "rotateX(68deg)", transformOrigin: "50% 0", backgroundImage: `linear-gradient(${hexA(A, 0.35)} 2px, transparent 2px), linear-gradient(90deg, ${hexA(A, 0.35)} 2px, transparent 2px)`, backgroundSize: "120px 120px", backgroundPosition: `0 ${off}px` }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.43, height: 6, background: A, boxShadow: `0 0 40px ${A}`, opacity: 0.6 }} />
        </AbsoluteFill>
      );
      break;
    }
    case "dots":
      layer = <AbsoluteFill style={{ backgroundImage: `radial-gradient(${hexA(A, 0.45)} 3px, transparent 3.5px)`, backgroundSize: "54px 54px", backgroundPosition: `${t * 14}px ${t * 22}px`, maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 20%, transparent 80%)" }} />;
      break;
    case "aurora":
      layer = (
        <AbsoluteFill style={{ filter: "blur(90px)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ position: "absolute", width: 900, height: 900, borderRadius: 450, background: i === 1 ? hexA(B.light, 0.18) : hexA(A, 0.45), left: W / 2 - 450 + Math.sin(t * 0.5 + i * 2.1) * 380, top: H * (0.2 + i * 0.28) - 450 + Math.cos(t * 0.4 + i) * 200 }} />
          ))}
        </AbsoluteFill>
      );
      break;
    case "rays":
      layer = <AbsoluteFill style={{ background: `repeating-conic-gradient(from ${t * 8}deg at 50% 40%, ${hexA(A, 0.16)} 0deg 8deg, transparent 8deg 20deg)`, maskImage: "radial-gradient(circle at 50% 40%, #000 0%, transparent 70%)" }} />;
      break;
    case "stripes":
      layer = <AbsoluteFill style={{ background: `repeating-linear-gradient(-35deg, ${hexA(A, 0.1)} 0 40px, transparent 40px 110px)`, backgroundPosition: `${t * 60}px 0`, backgroundSize: "200% 200%" }} />;
      break;
    case "bokeh":
      layer = (
        <AbsoluteFill>
          {Array.from({ length: 22 }, (_, i) => {
            const r = 30 + rand(i) * 120;
            return <div key={i} style={{ position: "absolute", width: r * 2, height: r * 2, borderRadius: r, background: hexA(i % 3 ? A : B.light, 0.08 + rand(i + 9) * 0.12), left: rand(i + 1) * W - r, top: ((rand(i + 2) * H - t * (20 + rand(i + 3) * 40)) % H + H) % H - r, filter: `blur(${4 + rand(i + 4) * 10}px)` }} />;
          })}
        </AbsoluteFill>
      );
      break;
    case "paper": {
      const seed = Math.floor(t * 8);
      layer = (
        <AbsoluteFill style={{ opacity: 0.22, mixBlendMode: "overlay" }}>
          <svg width={W} height={H}>
            <filter id={`paper${seed}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="4" seed={seed % 3} />
            </filter>
            <rect width={W} height={H} filter={`url(#paper${seed})`} />
          </svg>
        </AbsoluteFill>
      );
      break;
    }
    case "mesh":
      layer = <AbsoluteFill style={{ background: `radial-gradient(60% 45% at ${30 + Math.sin(t * 0.6) * 15}% ${30 + Math.cos(t * 0.5) * 10}%, ${hexA(A, 0.5)} 0%, transparent 70%), radial-gradient(55% 40% at ${70 + Math.cos(t * 0.4) * 15}% ${72 + Math.sin(t * 0.7) * 8}%, ${hexA(B.light, 0.18)} 0%, transparent 70%)` }} />;
      break;
    case "rings":
      layer = (
        <AbsoluteFill>
          {Array.from({ length: 7 }, (_, i) => {
            const r = ((i * 180 + t * 90) % 1260) + 60;
            return <div key={i} style={{ position: "absolute", left: W / 2 - r, top: H * 0.42 - r, width: 2 * r, height: 2 * r, borderRadius: r, border: `3px solid ${hexA(A, Math.max(0, 0.45 - r / 2800))}` }} />;
          })}
        </AbsoluteFill>
      );
      break;
    case "hud":
      layer = (
        <AbsoluteFill>
          <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(0deg, ${hexA(A, 0.07)} 0 2px, transparent 2px 8px)` }} />
          <div style={{ position: "absolute", left: 0, right: 0, height: 140, top: ((t * 300) % (H + 140)) - 140, background: `linear-gradient(180deg, transparent, ${hexA(A, 0.12)}, transparent)` }} />
          {[
            [60, 60, "0 0"],
            [W - 160, 60, "1 0"],
            [60, H - 160, "0 1"],
            [W - 160, H - 160, "1 1"],
          ].map(([x, y, c], i) => {
            const [cx, cy] = String(c).split(" ").map(Number);
            return <div key={i} style={{ position: "absolute", left: x as number, top: y as number, width: 100, height: 100, borderColor: hexA(A, 0.7), borderStyle: "solid", borderWidth: `${cy ? 0 : 5}px ${cx ? 5 : 0}px ${cy ? 5 : 0}px ${cx ? 0 : 5}px` }} />;
          })}
        </AbsoluteFill>
      );
      break;
    case "split":
      layer = <AbsoluteFill style={{ background: `linear-gradient(${155 + Math.sin(t * 0.5) * 4}deg, ${mix(D, A, 0.22)} 0 50%, ${D} 50% 100%)` }} />;
      break;
    case "pak":
      layer = /\.(mp4|webm|mov)$/i.test(file!) ? (
        <OffthreadVideo src={staticFile(file!)} muted style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />
      ) : (
        <Img src={staticFile(file!)} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5, transform: `scale(${1.05 + t * 0.004})` }} />
      );
      break;
    default: // gradient
      layer = <AbsoluteFill style={{ background: `radial-gradient(70% 45% at ${50 + Math.sin(t * 0.4) * 10}% ${38 + Math.cos(t * 0.3) * 6}%, ${hexA(A, tone)} 0%, transparent 70%)` }} />;
  }
  return (
    <AbsoluteFill style={{ background: D, overflow: "hidden" }}>
      {base}
      {layer}
      {vignette}
    </AbsoluteFill>
  );
};

// смешать два hex-цвета
function mix(a: string, b: string, u: number) {
  const p = (h: string) => {
    const x = h.replace("#", "");
    const n = parseInt(x.length === 3 ? x.split("").map((c) => c + c).join("") : x.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * u)).join(",")})`;
}
