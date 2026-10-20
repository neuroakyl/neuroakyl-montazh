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
