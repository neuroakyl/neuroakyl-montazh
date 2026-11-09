import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";
import { F, FPS, H, W, back, inOut, k, lerp, sharp, words, type Word } from "../lib";

/**
 * Живые кадры и слой ролика (ролики 08.11.2026). Живой кадр с человеком — через один (правило «живо и объёмно»).
 *
 *   <Clip file="hug.mp4" a={a} from={3} fit="42% 40%" />           — клип из public/clips, идёт с начала сцены a
 *   <LiveShot t={t} a={a} file="hug.mp4" />                          — то же + камера дышит и садится (кадр не стоит)
 *   <BigWord t={t} a={at("алтын")} text="АЛТЫН" y={300} />            — крупное слово из сценария
 *   <Grain t={t} />                                                  — зерно поверх всего (кадр «снят», а не нарисован)
 *   <KaraokeSubs t={t} y={1460} />                                   — субтитры 1–3 слова, звучащее слово цветом
 */
export const Clip: React.FC<{ file: string; a: number; from?: number; rate?: number; fit?: string; grade?: string; style?: React.CSSProperties }> = ({
  file,
  a,
  from = 0,
  rate = 1,
  fit = "50% 50%",
  grade = "saturate(1.05) contrast(1.08)",
  style,
}) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }}>
    {/* своё время с начала сцены: без Sequence клип берёт время всего ролика */}
    <Sequence from={Math.round(a * FPS)} layout="none">
      <OffthreadVideo
        src={staticFile(`clips/${file}`)}
        muted
        trimBefore={Math.round(from * FPS)}
        playbackRate={rate}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: fit, filter: grade }}
      />
    </Sequence>
  </div>
);

/** живой кадр: въезд с 1,1 → 1 за 0,35 с, потом медленный наезд на 10 % за 3 с (как в «Тест — алтын») */
export const LiveShot: React.FC<{ t: number; a: number; file: string; from?: number; fit?: string; d?: number; zoom?: number; children?: React.ReactNode }> = ({
  t,
  a,
  file,
  from = 0,
  fit,
  d = 3,
  zoom = 0.1,
  children,
}) => {
  const z = lerp(1, 1 + zoom, Math.min(1, Math.max(0, (t - a) / d))) * lerp(1.1, 1, k(t, a, 0.35));
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${z})` }}>
        <Clip file={file} a={a} from={from} fit={fit} />
      </AbsoluteFill>
      {/* низ темнее — субтитры читаются на любом кадре */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)" }} />
      {children}
    </AbsoluteFill>
  );
};

/** крупное слово: входит с 1,3 → 1 с отскоком; out — когда уйти. Только слова из сценария. */
export const BigWord: React.FC<{ t: number; a: number; text: string; y: number; size?: number; color?: string; font?: string; out?: number }> = ({
  t,
  a,
  text,
  y,
  size = 150,
  color = "#FFFFFF",
  font = F.head,
  out = 999,
}) => {
  if (t < a || t > out + 0.3) return null;
  const u = k(t, a, 0.22, back);
  const o = k(t, out, 0.25, inOut);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, textAlign: "center", transform: `scale(${lerp(1.3, 1, u) * lerp(1, 0.8, o)})`, opacity: Math.min(1, u * 2) * (1 - o) }}>
      <span style={{ fontFamily: font, fontSize: size, color, textShadow: `0 0 50px ${color}66, 0 10px 40px rgba(0,0,0,0.7)`, whiteSpace: "nowrap" }}>{text}</span>
    </div>
  );
};

/** зерно: детерминированное, меняется 15 раз в секунду */
export const Grain: React.FC<{ t: number; o?: number }> = ({ t, o = 0.07 }) => {
  const seed = Math.floor(t * 15);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: o, mixBlendMode: "overlay" }}>
      <svg width={W} height={H}>
        <filter id={`grain${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} />
        </filter>
        <rect width={W} height={H} filter={`url(#grain${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

// ── Субтитры-караоке: куски по 1–3 слова (не длиннее 18 знаков), рвутся на знаках препинания ──
type Chunk = { a: number; b: number; ws: Word[] };
export const chunks = (list: Word[] = words): Chunk[] => {
  const out: Chunk[] = [];
  let cur: Word[] = [];
  list.forEach((w, i) => {
    cur.push(w);
    const end = /[.,!?:…»]$/.test(w.text) || cur.length >= 3 || cur.map((x) => x.text).join(" ").length > 18;
    if (end || i === list.length - 1) {
      out.push({ a: cur[0].start, b: 0, ws: cur });
      cur = [];
    }
  });
  out.forEach((c, i) => (c.b = i < out.length - 1 ? out[i + 1].a : c.ws.at(-1)!.end + 0.6));
  return out;
};
const clean = (s: string) => s.replace(/[«»"…]/g, "").replace(/\.\.\./g, "");

/** list — свои слова (например, тело + слова концовки со сдвигом); hide — интервалы без субтитров */
export const KaraokeSubs: React.FC<{ t: number; y?: number; list?: Word[]; hide?: [number, number][]; color?: string; accent?: string; size?: number }> = ({
  t,
  y = 1460,
  list,
  hide = [],
  color = "#FFFFFF",
  accent = "#FFB020",
  size = 70,
}) => {
  const all = React.useMemo(() => chunks(list), [list]);
  if (hide.some(([a, b]) => t >= a && t < b)) return null;
  const c = all.find((q) => t >= q.a - 0.04 && t < q.b);
  if (!c) return null;
  const u = k(t, c.a - 0.04, 0.16, sharp);
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: y, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 22px", transform: `translateY(${lerp(18, 0, u)}px)`, opacity: u }}>
      {c.ws.map((w, i) => {
        const on = t >= w.start - 0.02;
        const now = on && (i === c.ws.length - 1 || t < c.ws[i + 1].start);
        return (
          <span
            key={i}
            style={{
              fontFamily: F.ui,
              fontWeight: 900,
              fontSize: size,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              color: now ? accent : color,
              opacity: on ? 1 : 0.35,
              transform: `scale(${now ? lerp(1.04, 1, k(t, w.start, 0.2)) : 1})`,
              textShadow: "0 4px 18px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap",
            }}
          >
            {clean(w.text)}
          </span>
        );
      })}
    </div>
  );
};
