// Детали «телефон»: мокап, лента роликов со свайпом и счётчиком просмотров, телефон сбоку с интерфейсом Reels.
import React from "react";
import { OffthreadVideo, Sequence, staticFile } from "remotion";
import { C, F, FPS, H, W, count, inOut, k, lerp, sharp } from "../lib";

/** Мокап телефона (рамка, скругление, тень). Внутрь — видео, картинка или интерфейс. */
export const Phone: React.FC<{ w: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ w, children, style }) => {
  const h = w * 2.06;
  const r = w * 0.14;
  return (
    <div style={{ position: "absolute", width: w, height: h, borderRadius: r, background: "#1B1B1D", padding: w * 0.028, boxShadow: "0 30px 60px rgba(0,0,0,0.35), inset 0 0 0 2px #4a4a4e", ...style }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: r * 0.82, overflow: "hidden", background: "#000" }}>{children}</div>
    </div>
  );
};

export const Eye: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M1.5 12 C4.5 6.5 8 4.5 12 4.5 C16 4.5 19.5 6.5 22.5 12 C19.5 17.5 16 19.5 12 19.5 C8 19.5 4.5 17.5 1.5 12Z" fill="white" />
    <circle cx="12" cy="12" r="4.2" fill="#111" />
    <circle cx="12" cy="12" r="2" fill="white" />
  </svg>
);

const Clip: React.FC<{ file: string; from: number }> = ({ file, from }) => (
  <Sequence from={Math.round(from * FPS)} layout="none">
    <OffthreadVideo src={staticFile(`clips/${file}`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  </Sequence>
);

/**
 * Лента в телефоне: телефон падает сверху (низ на y = bottom), ролики сменяются свайпом вверх,
 * у каждого счётчик просмотров бежит до своего числа. clips: [файл в public/clips/, просмотры, время смены].
 */
export const PhoneFeed: React.FC<{ t: number; a: number; clips: [file: string, views: number, at: number][]; w?: number; bottom?: number }> = ({ t, a, clips, w = 560, bottom = 840 }) => {
  if (t < a) return null;
  const ph = w * 2.06;
  const drop = k(t, a, 0.45, sharp);
  let ci = 0;
  clips.forEach(([, , at], i) => {
    if (t >= at) ci = i;
  });
  const sw = k(t, clips[ci][2], 0.22, inOut);
  return (
    <Phone w={w} style={{ left: W / 2 - w / 2, top: lerp(-ph - 40, bottom - ph, drop) }}>
      {clips.map(([f, , at], i) =>
        i === ci || i === ci - 1 ? (
          <div key={f + i} style={{ position: "absolute", inset: 0, transform: `translateY(${i === ci ? lerp(100, 0, ci === 0 ? 1 : sw) : lerp(0, -100, sw)}%)` }}>
            <Clip file={f} from={at} />
          </div>
        ) : null,
      )}
      <div style={{ position: "absolute", left: 34, bottom: 34, display: "flex", alignItems: "center", gap: 10, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}>
        <Eye size={40} />
        <span style={{ fontFamily: F.ui, fontWeight: 700, fontSize: 38, color: C.white }}>{count(t, clips[ci][2], ci === clips.length - 1 ? 1.6 : 0.7, 0, clips[ci][1])}</span>
      </div>
    </Phone>
  );
};

/** Иконки Reels справа: лайк, комментарий, репост, отправка — с числами. */
export const ReelsUI: React.FC<{ counts?: [string, string, string, string] }> = ({ counts = ["48,2K", "512", "1 204", "3 870"] }) => {
  const icon = (d: React.ReactNode, n: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={54} height={54} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
        {d}
      </svg>
      <span style={{ fontFamily: F.ui, fontWeight: 600, fontSize: 20, color: "white" }}>{n}</span>
    </div>
  );
  return (
    <div style={{ position: "absolute", right: 22, bottom: 150, display: "flex", flexDirection: "column", gap: 26, filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.5))" }}>
      {icon(<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />, counts[0])}
      {icon(<path d="M20 12a8 8 0 1 1-3.2-6.4L20 4v5h-5" />, counts[1])}
      {icon(<path d="M4 9h12l-3-3M20 15H8l3 3" />, counts[2])}
      {icon(<path d="M21 4 10 14M21 4l-6 17-5-7-7-4z" />, counts[3])}
    </div>
  );
};

/** Телефон сбоку (выезжает слева, обрезан краем кадра) с роликом и интерфейсом Reels — справа остаётся место словам. */
export const PhoneSide: React.FC<{ t: number; a: number; file: string; w?: number; side?: "left" | "right" }> = ({ t, a, file, w = 640, side = "left" }) => {
  const ph = w * 2.06;
  const slide = k(t, a - 0.05, 0.4, sharp);
  const x = side === "left" ? lerp(-w, -w * 0.3, slide) : lerp(W, W - w * 0.7, slide);
  return (
    <Phone w={w} style={{ left: x, top: H / 2 - ph / 2, filter: `blur(${lerp(8, 0, slide)}px)` }}>
      <Clip file={file} from={a} />
      <ReelsUI />
    </Phone>
  );
};
