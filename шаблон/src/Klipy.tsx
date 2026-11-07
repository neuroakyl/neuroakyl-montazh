import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { useFonts } from "./fonts";
import { C, F, FPS, clamp, words } from "./lib";
import MONTAZH from "./montazh.json";
import { Poverh } from "./Poverh";
import { db } from "./sound";

// Любой ролик из готовых кусков: живая съёмка, аватар, сгенерированные клипы и картинки, цветные плашки. Вертикаль и горизонталь.
// Весь монтаж — в src/montazh.json (его пишут rezka.py и завод или ты сам), свои детали поверх — в src/Poverh.tsx.
// Клип: { src, ot, do, zvuk, gromkost, skorost, vpisat: "cover"|"blur", fokus: "50% 30%", kamera: "in"|"out"|"none", perehod: "cut"|"fade"|"flash"|"zoom" }
// Картинка: { src, dlit, kamera }. Плашка: { cvet, dlit }.
export type Klip = {
  src?: string;
  cvet?: string;
  ot?: number;
  do?: number;
  dlit?: number;
  zvuk?: boolean;
  gromkost?: number;
  skorost?: number;
  vpisat?: "cover" | "blur";
  fokus?: string;
  kamera?: "in" | "out" | "none";
  perehod?: "cut" | "fade" | "flash" | "zoom";
};
type Montazh = { format: string; klipy: Klip[]; golos: string | null; muzyka: string | null; muzykaDb: number; subtitry: boolean };

const M = MONTAZH as Montazh;
export const FORMAT = M.format === "horizontal" ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };

const isImg = (s = "") => /\.(jpe?g|png|webp)$/i.test(s);
const dlina = (k: Klip) => (k.do !== undefined ? (k.do - (k.ot ?? 0)) / (k.skorost ?? 1) : (k.dlit ?? 3));

// начало каждого клипа в кадрах: округляем накопленное время, иначе ошибка округления копится и звук уезжает
const starts: number[] = [];
M.klipy.reduce((sum, k, i) => ((starts[i] = Math.round(sum * FPS)), sum + dlina(k)), 0);
export const KLIPY_DURATION = Math.max(1 / FPS, M.klipy.reduce((sum, k) => sum + dlina(k), 0));

const Media: React.FC<{ k: Klip; frames: number; style: React.CSSProperties; muted?: boolean }> = ({ k, frames, style, muted }) => {
  if (isImg(k.src)) return <Img src={staticFile(k.src!)} style={style} />;
  const vol = (f: number) => (k.gromkost ?? 1) * interpolate(f, [0, 2, frames - 2, frames], [0, 1, 1, 0], clamp); // мягкие края: на склейках без щелчков
  return (
    <OffthreadVideo
      src={staticFile(k.src!)}
      trimBefore={Math.round((k.ot ?? 0) * FPS)}
      trimAfter={k.do !== undefined ? Math.round(k.do * FPS) : undefined}
      playbackRate={k.skorost ?? 1}
      muted={muted || !k.zvuk}
      volume={muted ? 0 : vol}
      style={style}
    />
  );
};

const KlipView: React.FC<{ k: Klip; frames: number }> = ({ k, frames }) => {
  const f = useCurrentFrame();
  const p = f / Math.max(1, frames - 1);
  const kam = k.kamera ?? (isImg(k.src) ? "in" : "none");
  const move = kam === "in" ? 1 + 0.08 * p : kam === "out" ? 1.08 - 0.08 * p : 1;
  const per = k.perehod ?? "cut";
  const zoom = per === "zoom" ? interpolate(f, [0, 8], [1.18, 1], clamp) : 1;
  const opacity = per === "fade" ? interpolate(f, [0, 9], [0, 1], clamp) : 1;
  const flash = per === "flash" ? interpolate(f, [0, 4], [1, 0], clamp) : 0;
  const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
  if (k.cvet) return <AbsoluteFill style={{ background: k.cvet, opacity }} />;
  return (
    <AbsoluteFill style={{ background: "#000", opacity }}>
      {k.vpisat === "blur" && <Media k={k} frames={frames} muted style={{ ...fill, objectFit: "cover", filter: "blur(40px) brightness(0.55)", transform: "scale(1.15)" }} />}
      <Media
        k={k}
        frames={frames}
        style={{ ...fill, objectFit: k.vpisat === "blur" ? "contain" : "cover", objectPosition: k.fokus ?? "50% 50%", transform: `scale(${move * zoom})` }}
      />
      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};

// Подписи фразами: новая фраза после паузы, знака препинания или когда строка заполнена; текущее слово — акцентом
const MAX_CHARS = FORMAT.w > FORMAT.h ? 46 : 26;
const phrases = words.reduce<(typeof words)[]>((out, w, i) => {
  const cur = out[out.length - 1];
  const prev = words[i - 1];
  const len = cur ? cur.map((x) => x.text).join(" ").length + w.text.length + 1 : 0;
  if (!cur || len > MAX_CHARS || w.start - prev.end > 0.3 || /[.!?…,:;]$/.test(prev.text)) out.push([w]);
  else cur.push(w);
  return out;
}, []);

const Subtitry: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const ph = phrases.find((p, i) => t >= p[0].start - 0.05 && t < (phrases[i + 1]?.[0].start ?? p[p.length - 1].end + 0.6) - 0.05);
  if (!ph) return null;
  const wide = FORMAT.w > FORMAT.h;
  return (
    <div
      style={{
        position: "absolute", left: 60, right: 60, textAlign: "center",
        ...(wide ? { bottom: 70 } : { top: 1270 }), // в вертикали ниже 1450 текст закрывает интерфейс Reels
        fontFamily: F.ui, fontWeight: 800, fontSize: wide ? 54 : 68, lineHeight: 1.15, color: C.white,
        textShadow: "0 3px 14px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.9)",
      }}
    >
      {ph.map((w, i) => (
        <span key={i} style={{ color: t >= w.start && t < w.end + 0.05 ? "#D7FF3E" : C.white }}>{w.text}{" "}</span>
      ))}
    </div>
  );
};

export const Klipy: React.FC = () => {
  const ready = useFonts();
  const total = Math.round(KLIPY_DURATION * FPS);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {M.klipy.map((k, i) => {
        const frames = (starts[i + 1] ?? total) - starts[i];
        return (
          <Sequence key={i} from={starts[i]} durationInFrames={frames}>
            <KlipView k={k} frames={frames} />
          </Sequence>
        );
      })}
      <Poverh />
      {ready && M.subtitry && <Subtitry />}
      {M.golos && <Audio src={staticFile(M.golos)} volume={db(2)} />}
      {M.muzyka && (
        <Audio
          src={staticFile(M.muzyka)}
          volume={(f) => db(M.muzykaDb) * interpolate(f / FPS, [0, 0.3, KLIPY_DURATION - 1.2, KLIPY_DURATION], [0, 1, 1, 0], clamp)}
        />
      )}
    </AbsoluteFill>
  );
};
