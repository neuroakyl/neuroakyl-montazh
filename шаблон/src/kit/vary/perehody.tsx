import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from "remotion";
import { FPS, H, W, back, clamp, has, k, lerp, rand, sharp } from "../../lib";
import { staticFile } from "remotion";
import { B, hexA } from "./recept";

/**
 * Банк переходов: 21 вид. Время s — секунды от начала нового кадра (слово, на котором склейка).
 * Ни один переход не делает полупрозрачного наложения двух кадров: старый уходит, новый приходит, или их делит граница.
 * У каждого — звук (sound.tsx shotCues): движение → свуш, вспышка/глитч → удар, склейка → тихий клик.
 *
 * old / neu — стиль старого и нового кадра (null — кадр скрыт), over — слой поверх обоих.
 */
type St = React.CSSProperties | null;
export type TrDef = {
  d: number;
  old?: (s: number) => St;
  neu?: (s: number) => St;
  oldOnTop?: boolean;
  over?: (s: number) => React.ReactNode;
  sfx: "click" | "whoosh" | "hit";
  ton: ("spokoyno" | "energichno")[];
  // повторить новый кадр ещё раз со своим стилем (двери: верхняя и нижняя половины)
  neu2?: (s: number) => St;
};

const slide = (dx: number, dy: number): TrDef => ({
  d: 0.28,
  old: (s) => ({ transform: `translate(${dx * W * k(s, 0, 0.28, sharp)}px, ${dy * H * k(s, 0, 0.28, sharp)}px)` }),
  neu: (s) => ({ transform: `translate(${-dx * W * (1 - k(s, 0, 0.28, sharp))}px, ${-dy * H * (1 - k(s, 0, 0.28, sharp))}px)` }),
  sfx: "whoosh",
  ton: ["spokoyno", "energichno"],
});
const BOTH: TrDef["ton"] = ["spokoyno", "energichno"];
const EN: TrDef["ton"] = ["energichno"];

const Bars: React.FC<{ s: number; n: number; vertical?: boolean; close: number; open: number; d: number; color: string }> = ({ s, n, vertical, close, open, d, color }) => (
  <AbsoluteFill>
    {Array.from({ length: n }, (_, i) => {
      const lag = (i / n) * 0.06;
      const c = k(s, lag, close, sharp) * (1 - k(s, open + lag, d - open - 0.06, sharp));
      const size = (vertical ? W : H) / n;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            background: i % 2 ? color : B.dark,
            ...(vertical
              ? { left: i * size, top: 0, width: size + 1, height: H, transform: `scaleY(${c})`, transformOrigin: i % 2 ? "top" : "bottom" }
              : { top: i * size, left: 0, height: size + 1, width: W, transform: `scaleX(${c})`, transformOrigin: i % 2 ? "left" : "right" }),
          }}
        />
      );
    })}
  </AbsoluteFill>
);

export const PEREHODY: Record<string, TrDef> = {
  cut: { d: 0, sfx: "click", ton: BOTH },
  "slide-l": slide(-1, 0),
  "slide-r": slide(1, 0),
  "slide-u": slide(0, -1),
  "slide-d": slide(0, 1),
  // нырок: старый летит в камеру, потом новый приезжает из глубины
  dive: {
    d: 0.39,
    old: (s) => (s < 0.12 ? { transform: `scale(${lerp(1, 1.9, Math.pow(s / 0.12, 2))})` } : null),
    neu: (s) => (s < 0.12 ? null : { transform: `scale(${lerp(0.72, 1, k(s, 0.12, 0.27, sharp))})` }),
    oldOnTop: true,
    sfx: "whoosh",
    ton: BOTH,
  },
  // новый кадр садится с 160 % из размытия поверх старого
  pull: { d: 0.38, neu: (s) => ({ transform: `scale(${lerp(1.6, 1, k(s, 0, 0.38, sharp))})`, filter: `blur(${lerp(14, 0, k(s, 0, 0.3, sharp))}px)` }), sfx: "whoosh", ton: BOTH },
  // хлыст: очень быстрый проезд с размытием
  whip: {
    d: 0.22,
    old: (s) => ({ transform: `translateX(${-W * k(s, 0, 0.22, sharp)}px)`, filter: `blur(${18 * Math.sin(Math.PI * Math.min(1, s / 0.22))}px)` }),
    neu: (s) => ({ transform: `translateX(${W * (1 - k(s, 0, 0.22, sharp))}px)`, filter: `blur(${18 * Math.sin(Math.PI * Math.min(1, s / 0.22))}px)` }),
    sfx: "whoosh",
    ton: EN,
  },
  // белая вспышка на шве
  flash: {
    d: 0.32,
    old: (s) => (s < 0.06 ? {} : null),
    neu: (s) => (s < 0.06 ? null : { transform: `scale(${lerp(1.06, 1, k(s, 0.06, 0.26))})` }),
    over: (s) => <AbsoluteFill style={{ background: B.light, opacity: interpolate(s, [0, 0.06, 0.32], [0, 1, 0], clamp) }} />,
    sfx: "hit",
    ton: EN,
  },
  // цифровой сбой: сдвиг цветов, полосы, дрожь
  glitch: {
    d: 0.26,
    old: (s) => (s < 0.12 ? glitchSt(s, 1) : null),
    neu: (s) => (s < 0.12 ? null : glitchSt(s, 2)),
    over: (s) => (
      <AbsoluteFill>
        {Array.from({ length: 5 }, (_, i) => {
          const r = rand(i * 13 + Math.floor(s * 40));
          return s < 0.24 ? <div key={i} style={{ position: "absolute", left: 0, right: 0, top: r * H, height: 12 + r * 60, background: i % 2 ? hexA(B.accent, 0.8) : "rgba(0,255,255,0.5)", transform: `translateX(${(r - 0.5) * 200}px)` }} /> : null;
        })}
      </AbsoluteFill>
    ),
    sfx: "hit",
    ton: EN,
  },
  // круг раскрывает новый кадр, по краю — кольцо цвета бренда
  iris: {
    d: 0.42,
    neu: (s) => ({ clipPath: `circle(${lerp(0, 80, k(s, 0, 0.42, sharp))}% at 50% 50%)` }),
    over: (s) => {
      const u = k(s, 0, 0.42, sharp);
      const r = (u * 0.8 * Math.hypot(W, H)) / Math.SQRT2;
      return s < 0.42 ? <div style={{ position: "absolute", left: W / 2 - r, top: H / 2 - r, width: 2 * r, height: 2 * r, borderRadius: r, border: `10px solid ${B.accent}` }} /> : null;
    },
    sfx: "whoosh",
    ton: BOTH,
  },
  // косая шторка с полосой цвета бренда
  wipe: {
    d: 0.36,
    neu: (s) => {
      const x = lerp(-0.4, 1.4, k(s, 0, 0.36, sharp)) * W;
      return { clipPath: `polygon(0 0, ${x + 300}px 0, ${x - 300}px ${H}px, 0 ${H}px)` };
    },
    over: (s) => {
      const x = lerp(-0.4, 1.4, k(s, 0, 0.36, sharp)) * W;
      return s < 0.36 ? <div style={{ position: "absolute", left: x - 30, top: -200, width: 60, height: H + 400, background: B.accent, transform: "skewX(-17deg)", transformOrigin: "50% 50%" }} /> : null;
    },
    sfx: "whoosh",
    ton: BOTH,
  },
  // жалюзи: полосы закрывают старый и открывают новый
  shutter: {
    d: 0.44,
    old: (s) => (s < 0.22 ? {} : null),
    neu: (s) => (s < 0.22 ? null : {}),
    over: (s) => (s < 0.44 ? <Bars s={s} n={6} close={0.16} open={0.24} d={0.44} color={B.accent} /> : null),
    sfx: "whoosh",
    ton: EN,
  },
  // поворот с зумом
  spin: {
    d: 0.32,
    old: (s) => (s < 0.14 ? { transform: `rotate(${lerp(0, 25, s / 0.14)}deg) scale(${lerp(1, 1.5, s / 0.14)})` } : null),
    neu: (s) => (s < 0.14 ? null : { transform: `rotate(${lerp(-25, 0, k(s, 0.14, 0.18, sharp))}deg) scale(${lerp(1.5, 1, k(s, 0.14, 0.18, sharp))})` }),
    oldOnTop: true,
    sfx: "whoosh",
    ton: EN,
  },
  // «выключили телевизор»: старый схлопывается в линию, новый раскрывается из линии
  squash: {
    d: 0.36,
    old: (s) => (s < 0.14 ? { transform: `scale(${lerp(1, 1.12, s / 0.14)}, ${lerp(1, 0.004, k(s, 0, 0.14, sharp))})` } : null),
    neu: (s) => (s < 0.16 ? null : { transform: `scaleY(${lerp(0.004, 1, k(s, 0.16, 0.2, back))})` }),
    over: (s) => (s > 0.1 && s < 0.2 ? <div style={{ position: "absolute", left: 0, right: 0, top: H / 2 - 4, height: 8, background: B.light, boxShadow: `0 0 40px ${B.accent}` }} /> : null),
    sfx: "hit",
    ton: EN,
  },
  // мозаика: квадраты закрывают и открывают кадр в случайном порядке
  pixel: {
    d: 0.42,
    old: (s) => (s < 0.21 ? {} : null),
    neu: (s) => (s < 0.21 ? null : {}),
    over: (s) => {
      const cols = 9;
      const size = W / cols;
      const rows = Math.ceil(H / size);
      return s < 0.42 ? (
        <AbsoluteFill>
          {Array.from({ length: cols * rows }, (_, i) => {
            const r = rand(i * 7 + 3) * 0.12;
            const on = s >= r && s < 0.3 + r;
            return on ? <div key={i} style={{ position: "absolute", left: (i % cols) * size, top: Math.floor(i / cols) * size, width: size + 1, height: size + 1, background: rand(i) > 0.75 ? B.accent : B.dark }} /> : null;
          })}
        </AbsoluteFill>
      ) : null;
    },
    sfx: "hit",
    ton: EN,
  },
  // двери: половины нового кадра съезжаются сверху и снизу
  doors: {
    d: 0.34,
    neu: (s) => ({ clipPath: `inset(0 0 50% 0)`, transform: `translateY(${-(H / 2) * (1 - k(s, 0, 0.34, sharp))}px)` }),
    neu2: (s) => ({ clipPath: `inset(50% 0 0 0)`, transform: `translateY(${(H / 2) * (1 - k(s, 0, 0.34, sharp))}px)` }),
    sfx: "whoosh",
    ton: BOTH,
  },
  // размытие на шве: старый уходит в расфокус, новый выходит из него
  blur: {
    d: 0.3,
    old: (s) => (s < 0.12 ? { filter: `blur(${lerp(0, 26, s / 0.12)}px)`, transform: `scale(${lerp(1, 1.06, s / 0.12)})` } : null),
    neu: (s) => (s < 0.12 ? null : { filter: `blur(${lerp(26, 0, k(s, 0.12, 0.18, sharp))}px)`, transform: `scale(${lerp(1.06, 1, k(s, 0.12, 0.18, sharp))})` }),
    sfx: "whoosh",
    ton: BOTH,
  },
  // вытяжка: кадр уезжает вверх, растягиваясь
  stretch: {
    d: 0.26,
    old: (s) => ({ transform: `translateY(${-H * k(s, 0, 0.26, sharp)}px) scaleY(${1 + 0.6 * k(s, 0, 0.26)})`, transformOrigin: "50% 100%" }),
    neu: (s) => ({ transform: `translateY(${H * (1 - k(s, 0, 0.26, sharp))}px) scaleY(${1 + 0.6 * (1 - k(s, 0, 0.26, sharp))})`, transformOrigin: "50% 0%" }),
    sfx: "whoosh",
    ton: EN,
  },
  // карточка: старый кадр сжимается в карточку и улетает, новый под ним
  card: {
    d: 0.42,
    old: (s) => {
      const u = k(s, 0, 0.42, sharp);
      return { transform: `translate(${u * W * 0.9}px, ${-u * 200}px) rotate(${u * 14}deg) scale(${lerp(1, 0.62, k(s, 0, 0.2, sharp))})`, borderRadius: 60 * u, boxShadow: "0 40px 80px rgba(0,0,0,0.6)" };
    },
    neu: (s) => ({ transform: `scale(${lerp(1.08, 1, k(s, 0, 0.42, sharp))})` }),
    oldOnTop: true,
    sfx: "whoosh",
    ton: BOTH,
  },
  // переход из пака монтажёра (засветка, film burn, переход с альфой): файл public/pak/<P.pak.perehod>; нет файла — вспышка
  pak: {
    d: 0, // склейка ровно на слове, засветка из пака закрывает шов (PakOver: пик на склейке)
    sfx: "whoosh",
    ton: BOTH,
  },
};
// старые имена Shots: l r u d z
const ALIAS: Record<string, string> = { l: "slide-l", r: "slide-r", u: "slide-u", d: "slide-d", z: "dive" };
export const trDef = (name?: string) => PEREHODY[ALIAS[name ?? ""] ?? name ?? "cut"] ?? PEREHODY.cut;

function glitchSt(s: number, seed: number): React.CSSProperties {
  const r = rand(Math.floor(s * 60) + seed * 31);
  return { transform: `translate(${(r - 0.5) * 60}px, ${(rand(r * 99) - 0.5) * 20}px)`, filter: `drop-shadow(${12 * r}px 0 0 rgba(255,0,60,0.8)) drop-shadow(${-12 * r}px 0 0 rgba(0,255,255,0.8))` };
}

/**
 * Слой перехода из пака: file — путь в public (pak/…); blend "screen" для засветок на чёрном, "normal" для альфы.
 * Как у монтажёров: вспыхивает к склейке (0,25 с), пик на шве, гаснет за 0,5 с — кадр закрыт не дольше полсекунды.
 * from — с какой секунды файла брать (начало у засветок обычно пустое).
 */
export const PakOver: React.FC<{ a: number; file: string; blend?: "screen" | "normal"; from?: number }> = ({ a, file, blend = "screen", from = 0.6 }) => {
  const start = Math.round((a - 0.25) * FPS);
  return has(file) ? (
    <Sequence from={start} durationInFrames={Math.round(0.8 * FPS)} layout="none">
      <PakEnv a={a} start={start} blend={blend}>
        <OffthreadVideo src={staticFile(file)} muted transparent={blend === "normal"} trimBefore={blend === "normal" ? 0 : Math.round(from * FPS)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </PakEnv>
    </Sequence>
  ) : null;
};
const PakEnv: React.FC<{ a: number; start: number; blend: string; children: React.ReactNode }> = ({ a, start, blend, children }) => {
  const f = useCurrentFrame();
  const t = (start + f) / FPS;
  const o = blend === "normal" ? 1 : interpolate(t, [a - 0.25, a, a + 0.5], [0, 0.95, 0], clamp);
  return <AbsoluteFill style={{ mixBlendMode: blend as React.CSSProperties["mixBlendMode"], opacity: o }}>{children}</AbsoluteFill>;
};
