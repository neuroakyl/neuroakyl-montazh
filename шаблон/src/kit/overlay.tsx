// Детали «живые слои»: оверлеи из пака монтажёра (блики, дым, чернила, частицы, конфетти) и анимированные эмодзи.
// Файлы берутся из библиотеки (MONTAZH_LIB): `оверлеи/<вид>/*.mp4|*_alpha.webm`, `эмодзи-noto/<код>_512.webp`.
// В ролик копировать только нужные: оверлеи → public/fx/, эмодзи → public/emoji/. Каталог «когда брать» — `оверлеи/КАТАЛОГ.md`.
import React from "react";
import { AnimatedImage, OffthreadVideo, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { clamp, pop } from "../lib";

/**
 * Оверлей поверх кадра.
 * mode: "screen" — съёмка на чёрном (блики, дым, частицы, искры): чёрное пропадает, светлое светит;
 *       "multiply" — чернила на белом: белое пропадает, тёмное ложится;
 *       "alpha" — уже прозрачный *_alpha.webm (чернила-переходы с зелёнки).
 * a / b — начало и конец (с), fade — плавный вход и выход (с), o — непрозрачность, trim — с какой секунды файла.
 */
export const Overlay: React.FC<{ t: number; a: number; b: number; src: string; mode?: "screen" | "multiply" | "alpha"; o?: number; fade?: number; trim?: number; rate?: number; fit?: "cover" | "contain"; filter?: string }> = ({
  t, a, b, src, mode = "screen", o = 1, fade = 0.3, trim = 0, rate = 1, fit = "cover", filter,
}) => {
  const { fps } = useVideoConfig();
  if (t < a - 0.05 || t > b + 0.05) return null;
  const v = o * interpolate(t, [a, a + fade, b - fade, b], [0, 1, 1, 0], clamp);
  return (
    <Sequence from={Math.round(a * fps)} durationInFrames={Math.max(1, Math.round((b - a) * fps))} layout="none">
      <OffthreadVideo
        src={staticFile(src)}
        muted
        transparent={mode === "alpha"}
        playbackRate={rate}
        trimBefore={Math.round(trim * fps)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, opacity: v, mixBlendMode: mode === "alpha" ? "normal" : mode, filter, pointerEvents: "none" }}
      />
    </Sequence>
  );
};

/**
 * Анимированный эмодзи Google Noto (CC BY 4.0 — в подписи поста указать «Animated emoji: Google, CC BY 4.0»).
 * code — имя файла без _512.webp (например "1f525" огонь, "2705" галочка). Появляется с «попом», живёт своей анимацией.
 */
export const Emoji: React.FC<{ t: number; a: number; b?: number; code: string; x: number; y: number; size?: number; rot?: number; loop?: boolean }> = ({
  t, a, b = 999, code, x, y, size = 220, rot = 0, loop = true,
}) => {
  const { fps } = useVideoConfig();
  if (t < a - 0.02 || t > b + 0.3) return null;
  const u = pop(t, a, 0.4);
  const out = interpolate(t, [b, b + 0.25], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${u * out}) rotate(${rot}deg)`, filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.35))", pointerEvents: "none" }}>
      <Sequence from={Math.round(a * fps)} layout="none">
        <AnimatedImage src={staticFile(`emoji/${code}_512.webp`)} width={size} height={size} loopBehavior={loop ? "loop" : "pause-after-finish"} />
      </Sequence>
    </div>
  );
};

// ── Лица близких под эмодзи ──────────────────────────────────────────────────
export type FaceKey = [t: number, cx: number, cy: number, s: number];
export type Faces = { w: number; h: number; fps: number; keep: number[]; tracks: { id: number; keys: FaceKey[] }[] };
/** Весёлые лица Noto, которые есть в библиотеке: 😂 😎 🥳 🥰 😍 😊 🤩 😋 🤓 😇 */
export const FUNNY = ["1f602", "1f60e", "1f973", "1f970", "1f60d", "1f60a", "1f929", "1f60b", "1f913", "1f607"];

/** Место лица в момент t: между ключами — линейно; лицо потеряно (профиль, рука) — держим последнее место hold секунд. */
function faceAt(keys: FaceKey[], t: number, hold: number): FaceKey | null {
  if (keys.length === 1) return keys[0]; // фото
  if (t < keys[0][0] - hold || t > keys[keys.length - 1][0] + hold) return null;
  if (t <= keys[0][0]) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const [t1] = keys[i];
    if (t <= t1) {
      const a = keys[i - 1], b = keys[i], u = (t - a[0]) / Math.max(1e-6, t1 - a[0]);
      return [t, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  return keys[keys.length - 1];
}

/** Масштаб и сдвиг кадра исходника, вписанного в коробку как object-fit: cover (по умолчанию — весь экран). */
export const coverFit = (srcW: number, srcH: number, boxW = 1080, boxH = 1920) => {
  const k = Math.max(boxW / srcW, boxH / srcH);
  return { k, ox: (boxW - srcW * k) / 2, oy: (boxH - srcH * k) / 2 };
};

/**
 * Закрыть лица всех, кроме faces.keep (обычно — автор ролика), живыми эмодзи, которые едут за лицом.
 * faces — <файл>.litsa.json из инструменты/litsa.py; t — время ВНУТРИ клипа (с учётом trim); fit — как клип вписан (coverFit по умолчанию).
 * Ставить сразу после видео/фото, в той же коробке. scale — эмодзи больше лица, чтобы закрыть и уши, и край волос.
 */
export const FaceEmoji: React.FC<{ t: number; faces: Faces; fit?: { k: number; ox: number; oy: number }; codes?: string[]; scale?: number; hold?: number; min?: number }> = ({
  t, faces, fit, codes = FUNNY, scale = 1.7, hold = 1.2, min = 150,
}) => {
  const f = fit ?? coverFit(faces.w, faces.h);
  return (
    <>
      {faces.tracks.filter((tr) => !faces.keep.includes(tr.id)).map((tr, i) => {
        const p = faceAt(tr.keys, t, hold);
        if (!p) return null;
        const size = Math.max(min, p[3] * scale * f.k); // мелкое лицо на общем плане — закрыть с запасом
        const lift = Math.max(p[3] * 0.18 * f.k, size * 0.14); // рамка Vision — от бровей до подбородка, а закрыть надо всю голову с шапкой
        const wob = Math.sin(t * 5 + i) * 6; // лёгкое покачивание — живое, а не наклейка
        return (
          <div key={tr.id} style={{ position: "absolute", left: f.ox + p[1] * f.k - size / 2, top: f.oy + p[2] * f.k - lift - size / 2, width: size, height: size, transform: `rotate(${wob}deg)`, filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))", pointerEvents: "none" }}>
            <AnimatedImage src={staticFile(`emoji/${codes[(tr.id + i) % codes.length]}_512.webp`)} width={size} height={size} loopBehavior="loop" />
          </div>
        );
      })}
    </>
  );
};
