// Детали «тренд»: 16 приёмов из разбора 22 трендовых рилсов по кадрам 12 к/с (25.10.2026). Числа — из разбора, не придуманы.
// Все времена — секунды (обычно at("слово")). Каталог «когда брать» — приёмы.md, раздел «Детали шаблона», таблица «Тренд».
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { fit } from "../fonts";
import { C, F, H, W, clamp, k, lerp, rand } from "../lib";

const FR = 1 / 30;
// чистое замедление без отскока: easeOutCubic ≈ cubic-bezier(.2,.8,.2,1) и easeOutExpo — главный скачок в первых кадрах
export const outCubic = (u: number) => 1 - Math.pow(1 - u, 3);
export const outExpo = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
const lin = (u: number) => u;
const fade = (t: number, a: number, d: number) => interpolate(t, [a, a + d], [0, 1], clamp);

type Font = "thin" | "serif" | "script" | "black" | "narrow" | "ui";
const FONT: Record<Font, React.CSSProperties> = {
  thin: { fontFamily: F.ui, fontWeight: 200 },
  ui: { fontFamily: F.ui, fontWeight: 800 },
  serif: { fontFamily: F.serif, fontWeight: 500 },
  script: { fontFamily: F.script },
  black: { fontFamily: F.head, textTransform: "uppercase" },
  narrow: { fontFamily: F.narrow, fontWeight: 600, textTransform: "uppercase" },
};
const glowOf = (c: string, r = 10) => `0 0 ${r}px ${c}, 0 0 ${r * 2.4}px ${c}88`;

// ── 1. Слово из размытия ──────────────────────────────────────────────────────
/** Стиль одного слова: opacity 0→1, blur 8→0, scale 1,08→1 (или подъём 16 px), 0,28 с; первые 2 кадра — серое (~50 %). */
export function blurWord(t: number, a: number, o: { d?: number; rise?: boolean; color?: string; grey?: string } = {}): React.CSSProperties {
  const { d = 0.28, rise = false, color = C.white, grey = "rgba(255,255,255,0.5)" } = o;
  if (t < a) return { opacity: 0 };
  const u = k(t, a, d, outCubic);
  return {
    opacity: Math.min(1, u * 1.6),
    filter: `blur(${lerp(8, 0, u)}px)`,
    transform: rise ? `translateY(${lerp(16, 0, u)}px)` : `scale(${lerp(1.08, 1, u)})`,
    color: t - a < 2 * FR ? grey : color,
  };
}

export type TW = [text: string, t: number];
/** 1. Фраза по словам из размытия (шаг между словами — по таймингу голоса, обычно 0,15–0,25 с). out — вся группа уходит за 80 мс. */
export const BlurWords: React.FC<{ t: number; words: TW[]; out?: number; y?: number; width?: number; size?: number; font?: Font; color?: string; rise?: boolean; accent?: [index: number, color: string] }> = ({
  t, words, out = 999, y = H / 2, width = 900, size = 92, font = "ui", color = C.white, rise, accent,
}) => {
  if (t >= out + 0.08 || t < words[0][1]) return null;
  return (
    <div style={{ position: "absolute", left: (W - width) / 2, width, top: y, transform: "translateY(-50%)", display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.26, rowGap: size * 0.05, opacity: 1 - fade(t, out, 0.08) }}>
      {words.map(([s, a], i) => {
        const c = accent && accent[0] === i ? accent[1] : color;
        return (
          <span key={i} style={{ ...FONT[font], fontSize: size, lineHeight: 1.04, whiteSpace: "nowrap", display: "inline-block", ...blurWord(t, a, { rise, color: c }), textShadow: accent && accent[0] === i ? glowOf(c, 9) : undefined }}>
            {s}
          </span>
        );
      })}
    </div>
  );
};

// ── 2. Мелкое + огромное ─────────────────────────────────────────────────────
export type Part = { text: string; t: number; font?: Font; big?: boolean; color?: string; glow?: boolean };
/** 2. Строки из мелких служебных слов (5 % ширины) и огромного ключевого (до 80 % ширины), разные гарнитуры, лесенка вправо. */
export const BigSmall: React.FC<{ t: number; rows: Part[][]; y?: number; width?: number; small?: number; step?: number; out?: number }> = ({
  t, rows, y = 820, width = 860, small = 56, step = 46, out = 999,
}) => {
  if (t >= out + 0.08) return null;
  let yy = y;
  return (
    <div style={{ opacity: 1 - fade(t, out, 0.08) }}>
      {rows.map((row, ri) => {
        const big = row.find((p) => p.big);
        const bigFont = big?.font ?? "black";
        const bigSize = big ? fit(big.text.toUpperCase(), (FONT[bigFont].fontFamily as string) ?? F.head, width * 0.8, 300) : small;
        const h = Math.max(small, bigSize) * 0.98;
        const top = yy;
        yy += h;
        const shift = (ri - (rows.length - 1) / 2) * step;
        return (
          <div key={ri} style={{ position: "absolute", left: 0, width: W, top, height: h, display: "flex", alignItems: "baseline", justifyContent: "center", gap: small * 0.3, transform: `translateX(${shift}px)` }}>
            {row.map((p, i) => {
              const f = p.font ?? (p.big ? "black" : "serif");
              const col = p.color ?? C.white;
              return (
                <span key={i} style={{ ...FONT[f], fontSize: p.big ? bigSize : small, lineHeight: 0.95, whiteSpace: "nowrap", display: "inline-block", ...blurWord(t, p.t, { color: col, d: p.big ? 0.36 : 0.24 }), textShadow: p.glow ? glowOf(col, 11) : undefined }}>
                  {p.text}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// ── 3. Вспышка-переход ───────────────────────────────────────────────────────
/**
 * 3. Вспышка на склейке (a — момент склейки), ставить поверх всего. Звук обязателен: свуш за 0,1 с до a + удар на a.
 * flare — оранжевый блик с края 2 кадра → белый 1 кадр → спад 0,35 с, тёплый оттенок держится на новом кадре (~0,6 с);
 * white — белый 1 кадр; negative — негатив 1 кадр; rgb — RGB-волна 0,25 с; glitch — срывы полос 0,27 с (только на склейке!).
 */
export const Flash: React.FC<{ t: number; a: number; kind?: "flare" | "white" | "negative" | "rgb" | "glitch"; color?: string; from?: "left" | "right" | "top" }> = ({
  t, a, kind = "flare", color = "#FF8A2A", from = "left",
}) => {
  const d = t - a;
  if (kind === "white") return d >= 0 && d < FR ? <AbsoluteFill style={{ background: "#fff" }} /> : null;
  if (kind === "negative") return d >= 0 && d < FR ? <AbsoluteFill style={{ backdropFilter: "invert(1)" }} /> : null;
  if (kind === "rgb") {
    if (d < 0 || d > 0.25) return null;
    const u = d / 0.25;
    const band = (c: string, off: number) => (
      <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.55 * (1 - u), background: `linear-gradient(100deg, transparent ${lerp(-40, 100, u) + off}%, ${c} ${lerp(-25, 115, u) + off}%, transparent ${lerp(-10, 130, u) + off}%)` }} />
    );
    return <>{band("#FF2A4A", 0)}{band("#2AFF8A", 6)}{band("#2A7BFF", 12)}</>;
  }
  if (kind === "glitch") {
    if (d < 0 || d > 0.27) return null;
    const f = Math.floor(d / FR);
    return (
      <AbsoluteFill style={{ mixBlendMode: "difference" }}>
        {Array.from({ length: 7 }, (_, i) => {
          const r = rand(f * 13 + i);
          return r > 0.45 ? <div key={i} style={{ position: "absolute", left: 0, right: 0, top: rand(f * 7 + i * 3) * H, height: 20 + r * 90, background: i % 2 ? "#00F0FF" : "#FF00AA", transform: `translateX(${(rand(f + i) - 0.5) * 180}px)`, opacity: 0.8 }} /> : null;
        })}
      </AbsoluteFill>
    );
  }
  if (d < -2 * FR || d > 0.6) return null;
  const edge = from === "left" ? "0% 50%" : from === "right" ? "100% 50%" : "50% 0%";
  const pre = d < 0 ? lerp(0.35, 1, (d + 2 * FR) / (2 * FR)) : 0;
  const white = d < 0 ? 0 : d < FR ? 1 : 0.85 * (1 - outCubic(Math.min(1, (d - FR) / 0.35)));
  const tint = d < 0 ? 0 : 0.45 * (1 - Math.min(1, d / 0.6));
  return (
    <>
      {pre > 0 && <AbsoluteFill style={{ mixBlendMode: "screen", background: `radial-gradient(ellipse 90% 120% at ${edge}, ${color} 0%, ${color}66 35%, transparent 70%)`, opacity: pre }} />}
      {white > 0 && <AbsoluteFill style={{ background: "#fff", opacity: white }} />}
      {tint > 0 && <AbsoluteFill style={{ mixBlendMode: "screen", background: `radial-gradient(ellipse 110% 80% at ${edge}, ${color} 0%, transparent 75%)`, opacity: tint }} />}
    </>
  );
};

// ── 4. Отъезд-склейка ────────────────────────────────────────────────────────
/** Стиль: новый план стартует с from (1,2–2,2) и размытым, садится к 100 % за d (0,2–0,5 с), easeOutExpo. */
export function pullIn(t: number, a: number, from = 1.6, d = 0.38): React.CSSProperties {
  const u = k(t, a, d, outExpo);
  return { transform: `scale(${lerp(from, 1, u)})`, filter: u < 1 ? `blur(${lerp(14, 0, Math.min(1, u * 1.3))}px)` : undefined };
}
/** 4. Отъезд-склейка: обёртка плана. Тем же приёмом открывать ролик (первые 0,5 с). */
export const PullIn: React.FC<{ t: number; a: number; from?: number; d?: number; children: React.ReactNode }> = ({ t, a, from, d, children }) => (
  <AbsoluteFill style={pullIn(t, a, from, d)}>{children}</AbsoluteFill>
);

// ── 5. Текст за спикером ─────────────────────────────────────────────────────
/**
 * 5. Слои: фон → огромный текст → вырезка человека (person — <OffthreadVideo transparent src="cutout.webm"> или <Img>).
 * Текст входит с 115 % за 0,25 с, вся сцена толкается на 5 %. echo — эхо-силуэты за спиной (вариант из разбора).
 */
export const BehindText: React.FC<{ t: number; a: number; text: string; person: React.ReactNode; bg?: React.ReactNode; y?: number; width?: number; color?: string; font?: Font; echo?: boolean; glow?: boolean }> = ({
  t, a, text, person, bg, y = 640, width = 840, color = C.white, font = "black", echo, glow,
}) => {
  const u = k(t, a, 0.25, outCubic);
  const push = 1 + 0.05 * k(t, a, 0.3, outCubic);
  const size = fit(font === "black" || font === "narrow" ? text.toUpperCase() : text, (FONT[font].fontFamily as string) ?? F.head, width, 520);
  return (
    <AbsoluteFill style={{ transform: `scale(${push})` }}>
      {bg}
      {t >= a && (
        <div style={{ position: "absolute", left: 0, width: W, top: y, transform: `translateY(-50%) scale(${lerp(1.15, 1, u)})`, textAlign: "center", opacity: u, filter: `blur(${lerp(10, 0, u)}px)` }}>
          <span style={{ ...FONT[font], fontSize: size, lineHeight: 0.86, color, whiteSpace: "nowrap", textShadow: glow ? glowOf(color, 14) : undefined }}>{text}</span>
        </div>
      )}
      {echo &&
        [1.12, 1.08, 1.04].map((s, i) => (
          <AbsoluteFill key={i} style={{ transform: `scale(${lerp(1, s, u)})`, transformOrigin: "50% 100%", filter: "brightness(0) invert(1)", opacity: [0.08, 0.14, 0.22][i] * u }}>
            {person}
          </AbsoluteFill>
        ))}
      <AbsoluteFill>{person}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Заглушка-силуэт человека для проверки сцен без вырезки. */
export const Silhouette: React.FC<{ color?: string }> = ({ color = "#1A1A1F" }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
    <ellipse cx={540} cy={860} rx={150} ry={185} fill={color} />
    <path d={`M180 ${H} C190 1340 330 1150 540 1130 C750 1150 890 1340 900 ${H} Z`} fill={color} />
    <rect x={480} y={1010} width={120} height={150} fill={color} />
  </svg>
);

// ── 6. Цветной круг / поле за вырезкой ───────────────────────────────────────
/** 6. Круг растёт с 0 за 0,33 с; на каждом hit пульс +10 % и кольцо гаснет за 0,375 с. Ставить между фоном и вырезкой. */
export const ColorDisc: React.FC<{ t: number; a: number; color: string; x?: number; y?: number; r?: number; hits?: number[]; glow?: boolean }> = ({
  t, a, color, x = W / 2, y = 900, r = 360, hits = [], glow = true,
}) => {
  if (t < a) return null;
  const grow = k(t, a, 0.33, outCubic);
  const pulses = hits.filter((h) => t >= h).map((h) => 1 - Math.min(1, (t - h) / 0.375));
  const p = pulses.length ? pulses[pulses.length - 1] : 0;
  const s = grow * (1 + 0.1 * p);
  return (
    <>
      <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: color, transform: `scale(${s})`, boxShadow: glow ? `0 0 80px ${color}99` : undefined }} />
      {p > 0 && <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `6px solid ${color}`, transform: `scale(${1 + 0.35 * (1 - p)})`, opacity: p }} />}
    </>
  );
};
/** 6. Тонировка фона цветом раздела за 0,5 с (проблема — красный, решение — жёлтый, «как» — фиолетовый). */
export const Tint: React.FC<{ t: number; a: number; color: string; o?: number; b?: number }> = ({ t, a, color, o = 0.55, b = 999 }) =>
  t < a || t > b + 0.5 ? null : <AbsoluteFill style={{ background: color, mixBlendMode: "color", opacity: o * fade(t, a, 0.5) * (1 - fade(t, b, 0.5)) }} />;

// ── 7. Предмет вылетает вперёд ───────────────────────────────────────────────
/** 7. Предмет: scale from (0,35–0,75)→1 за d (0,25–0,5 с); фон размыт до 9 px и притушен до dim; белое свечение по контуру. */
export const PopForward: React.FC<{ t: number; a: number; back: React.ReactNode; children: React.ReactNode; from?: number; d?: number; dim?: number; x?: number; y?: number; b?: number }> = ({
  t, a, back, children, from = 0.5, d = 0.36, dim = 0.35, x = W / 2, y = H / 2, b = 999,
}) => {
  const u = k(t, a, d, outCubic) * (1 - k(t, b, 0.2, outCubic));
  return (
    <>
      <AbsoluteFill style={{ filter: u > 0 ? `blur(${9 * u}px) brightness(${lerp(1, dim, u)})` : undefined }}>{back}</AbsoluteFill>
      {t >= a && t < b + 0.2 && (
        <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${lerp(from, 1, u)})`, opacity: Math.min(1, u * 2), filter: "drop-shadow(0 0 2px #fff) drop-shadow(0 0 22px rgba(255,255,255,0.55))" }}>
          {children}
        </div>
      )}
    </>
  );
};

// ── 8. Въезд из-за края со смазом ────────────────────────────────────────────
type Side = "left" | "right" | "top" | "bottom";
/** Стиль: сдвиг 35 % ширины + поворот rot (10–35°)→0 за d (0,25–0,55 с), без перелёта; смаз по скорости. */
export function edgeIn(t: number, a: number, from: Side = "right", d = 0.4, rot = 20): React.CSSProperties {
  if (t < a) return { opacity: 0 };
  const u = k(t, a, d, outCubic);
  const dist = (1 - u) * W * 0.35;
  const [dx, dy] = from === "left" ? [-dist, 0] : from === "right" ? [dist, 0] : from === "top" ? [0, -dist] : [0, dist];
  const sign = from === "left" || from === "bottom" ? -1 : 1;
  return { transform: `translate(${dx}px, ${dy}px) rotate(${sign * rot * (1 - u)}deg)`, filter: u < 1 ? `blur(${(1 - u) * 9}px)` : undefined, opacity: Math.min(1, u * 3) };
}
/** Фото-карточка с белой рамкой и тенью (наклон ±5°). */
export const PhotoCard: React.FC<{ w: number; h: number; tilt?: number; children: React.ReactNode }> = ({ w, h, tilt = 0, children }) => (
  <div style={{ width: w, height: h, padding: 12, background: "#fff", boxShadow: "0 18px 40px rgba(0,0,0,0.45)", transform: `rotate(${tilt}deg)`, boxSizing: "border-box" }}>
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>{children}</div>
  </div>
);
/** 8. Каскад карточек из-за края: каждая через step (0,17–0,33 с), со своей стороны и наклоном. */
export const EdgeCascade: React.FC<{ t: number; a: number; cards: { node: React.ReactNode; x: number; y: number; from?: Side; tilt?: number }[]; step?: number; d?: number }> = ({ t, a, cards, step = 0.25, d = 0.42 }) => (
  <>
    {cards.map((c, i) => (
      <div key={i} style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-50%)" }}>
        <div style={edgeIn(t, a + i * step, c.from ?? (i % 2 ? "left" : "right"), d, 22)}>
          <div style={{ transform: `rotate(${c.tilt ?? (i % 2 ? -5 : 5)}deg)` }}>{c.node}</div>
        </div>
      </div>
    ))}
  </>
);

// ── 9. Число-барабан ─────────────────────────────────────────────────────────
const spaced = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
/** 9. Счётчик-барабан: цифры прокручиваются d (1–1,5 с) с разгоном и посадкой; число одной строкой; card — плашка 0,9→1 за 0,17 с. */
export const DrumNumber: React.FC<{ t: number; a: number; to: number; from?: number; d?: number; size?: number; prefix?: string; suffix?: string; color?: string; card?: string; x?: number; y?: number; maxW?: number }> = ({
  t, a, to, from = 0, d = 1.2, size = 240, prefix = "", suffix = "", color = C.white, card, x = W / 2, y = H / 2, maxW = 940,
}) => {
  if (t < a) return null;
  const u = interpolate(t, [a, a + d], [0, 1], clamp);
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const v = lerp(from, to, e);
  const digits = String(Math.round(to)).length;
  const sz = Math.min(size, fit(prefix + spaced(to) + suffix, F.head, maxW, size));
  const cols: React.ReactNode[] = [];
  for (let p = digits - 1; p >= 0; p--) {
    const q = v / Math.pow(10, p);
    const base = Math.floor(q) % 10;
    const frac = p === 0 ? q - Math.floor(q) : Math.max(0, ((v % Math.pow(10, p)) / Math.pow(10, p)) * 10 - 9);
    const roll = u >= 1 ? 0 : frac;
    const lead = p > 0 && v < Math.pow(10, p) - 0.5; // ведущие нули не показываем: число растёт от центра
    if (lead) continue;
    cols.push(
      <span key={p} style={{ display: "inline-block", height: sz * 0.92, overflow: "hidden", verticalAlign: "top" }}>
        <span style={{ display: "block", transform: `translateY(${-roll * sz * 0.92}px)` }}>
          <span style={{ display: "block", height: sz * 0.92 }}>{base}</span>
          <span style={{ display: "block", height: sz * 0.92 }}>{(base + 1) % 10}</span>
        </span>
      </span>,
    );
    if (p % 3 === 0 && p > 0) cols.push(<span key={`s${p}`} style={{ display: "inline-block", width: sz * 0.12 }} />);
  }
  const c = k(t, a, 0.17, outCubic);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${lerp(0.9, 1, c)})`, opacity: c, background: card, padding: card ? `${sz * 0.08}px ${sz * 0.16}px` : 0, borderRadius: sz * 0.08, fontFamily: F.head, fontSize: sz, lineHeight: 0.92, color, whiteSpace: "nowrap" }}>
      {prefix}
      {cols}
      {suffix}
    </div>
  );
};

// ── 10. Штрих рисуется ───────────────────────────────────────────────────────
const draw = (t: number, a: number, d: number) => k(t, a, d, outCubic);
/** 10. Эллипс от руки вокруг слова: рисуется 0,55 с с замедлением, конец заходит за начало (как маркером). */
export const HandEllipse: React.FC<{ t: number; a: number; x: number; y: number; w: number; h: number; color?: string; width?: number; d?: number }> = ({ t, a, x, y, w, h, color = "#FF3B3B", width = 9, d = 0.55 }) => {
  if (t < a) return null;
  const rx = w / 2, ry = h / 2;
  const path = `M ${x + rx * 0.9} ${y - ry * 0.75} C ${x + rx * 1.25} ${y - ry * 0.1}, ${x + rx * 0.9} ${y + ry * 1.05}, ${x} ${y + ry} C ${x - rx * 1.05} ${y + ry * 0.95}, ${x - rx * 1.08} ${y - ry * 0.85}, ${x - rx * 0.1} ${y - ry * 1.05} C ${x + rx * 0.55} ${y - ry * 1.12}, ${x + rx * 1.05} ${y - ry * 0.7}, ${x + rx * 1.02} ${y - ry * 0.2}`;
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <path d={path} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - draw(t, a, d)} />
    </svg>
  );
};
/** 10. Подчёркивание-маркер под словом: 0,4 с слева направо, лёгкая волна. */
export const Underline: React.FC<{ t: number; a: number; x: number; y: number; w: number; color?: string; width?: number; d?: number }> = ({ t, a, x, y, w, color = "#FFD43B", width = 12, d = 0.4 }) =>
  t < a ? null : (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <path d={`M ${x - w / 2} ${y} Q ${x - w / 6} ${y + 10}, ${x + w / 8} ${y + 2} T ${x + w / 2} ${y - 4}`} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - draw(t, a, d)} />
    </svg>
  );
/** 10. Полоска загрузки с процентом: заполняется за d (0,4–0,7 с и дольше — по смыслу фразы). */
export const LoadBar: React.FC<{ t: number; a: number; d?: number; x?: number; y?: number; w?: number; color?: string; label?: boolean }> = ({ t, a, d = 0.7, x = W / 2, y = 1240, w = 700, color = "#C6FF3D", label = true }) => {
  if (t < a) return null;
  const u = draw(t, a, d);
  const o = k(t, a - 0.05, 0.15);
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: y, width: w, opacity: o }}>
      <div style={{ height: 26, borderRadius: 13, border: "3px solid rgba(255,255,255,0.85)", padding: 4, boxSizing: "border-box" }}>
        <div style={{ height: "100%", width: `${u * 100}%`, borderRadius: 9, background: color, boxShadow: glowOf(color, 8) }} />
      </div>
      {label && <div style={{ ...FONT.narrow, fontSize: 44, color: "#fff", textAlign: "right", marginTop: 8 }}>{Math.round(u * 100)}%</div>}
    </div>
  );
};

// ── 11. Печать по буквам ─────────────────────────────────────────────────────
/** 11. Печать: per (0,025–0,08 с) на букву, каждая из размытия за 0,1 с. grow — слово растёт от центра (невышедших букв нет в строке). */
export const TypeOn: React.FC<{ t: number; a: number; text: string; per?: number; size?: number; font?: Font; color?: string; glow?: boolean; grow?: boolean; y?: number; caret?: boolean; b?: number }> = ({
  t, a, text, per = 0.05, size = 120, font = "black", color = C.white, glow, grow = true, y = H / 2, caret, b = 999,
}) => {
  if (t < a || t >= b) return null;
  const chars = [...text];
  const shown = Math.min(chars.length, Math.floor((t - a) / per) + 1);
  return (
    <div style={{ position: "absolute", left: 0, width: W, top: y, transform: "translateY(-50%)", textAlign: "center", whiteSpace: "nowrap" }}>
      {chars.map((ch, i) => {
        const ta = a + i * per;
        if (i >= shown) return grow ? null : <span key={i} style={{ ...FONT[font], fontSize: size, opacity: 0 }}>{ch}</span>;
        const u = k(t, ta, 0.1, outCubic);
        return (
          <span key={i} style={{ ...FONT[font], fontSize: size, color, display: "inline-block", whiteSpace: "pre", opacity: u, filter: `blur(${lerp(6, 0, u)}px)`, transform: `scale(${lerp(1.25, 1, u)})`, textShadow: glow ? glowOf(color, 12) : undefined }}>
            {ch}
          </span>
        );
      })}
      {caret && <span style={{ display: "inline-block", width: size * 0.06, height: size * 0.8, marginLeft: size * 0.05, background: color, opacity: Math.floor(t * 2.2) % 2 ? 0.2 : 1, verticalAlign: "middle" }} />}
    </div>
  );
};

// ── 12. 3D-переворот ─────────────────────────────────────────────────────────
/** 12. Переворот карточки: половина оборота за d (0,25–0,33 с), подмена на ребре, сильная перспектива. */
export const Flip: React.FC<{ t: number; a: number; front: React.ReactNode; back: React.ReactNode; d?: number; axis?: "x" | "y"; perspective?: number }> = ({ t, a, front, back, d = 0.3, axis = "y", perspective = 900 }) => {
  const ang = 180 * k(t, a, d, (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2));
  const rot = axis === "y" ? "rotateY" : "rotateX";
  return (
    <div style={{ perspective }}>
      <div style={{ transform: `${rot}(${ang < 90 ? ang : ang - 180}deg)` }}>{ang < 90 ? front : back}</div>
    </div>
  );
};
/** 12. Монета-переход: символ крутится, растёт и закрывает экран за d, на середине склейка (a + d/2). */
export const CoinWipe: React.FC<{ t: number; a: number; face: React.ReactNode; color?: string; d?: number }> = ({ t, a, face, color = "#FFC83D", d = 0.5 }) => {
  if (t < a || t > a + d) return null;
  const u = (t - a) / d;
  const s = u < 0.5 ? lerp(0.2, 9, outCubic(u * 2) ** 2) : lerp(9, 14, (u - 0.5) * 2);
  const o = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 800, opacity: o }}>
      <div style={{ width: 260, height: 260, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${s}) rotateY(${u * 720}deg)`, boxShadow: `inset 0 0 0 14px rgba(0,0,0,0.12)` }}>{face}</div>
    </AbsoluteFill>
  );
};

// ── 13. Каскад элементов и мозаика ───────────────────────────────────────────
/** 13. Каскад: элементы по одному через step (0,08–0,2 с), каждый растёт с 0 за 3 кадра. */
export const Cascade: React.FC<{ t: number; a: number; items: { node: React.ReactNode; x: number; y: number }[]; step?: number; d?: number; out?: number }> = ({ t, a, items, step = 0.12, d = 0.1, out = 999 }) => (
  <>
    {items.map((it, i) => {
      const ta = a + i * step;
      if (t < ta || t >= out + 0.12) return null;
      const u = k(t, ta, d, outCubic) * (1 - k(t, out + (items.length - 1 - i) * 0.02, 0.1, lin));
      return (
        <div key={i} style={{ position: "absolute", left: it.x, top: it.y, transform: `translate(-50%,-50%) scale(${u})` }}>
          {it.node}
        </div>
      );
    })}
  </>
);
/** 13. Мозаика-переход: плитки cols×rows (6×9) закрывают экран вразнобой за d (~0,58 с); hold — когда раскрываются обратно. */
export const Mosaic: React.FC<{ t: number; a: number; cols?: number; rows?: number; d?: number; hold?: number; color?: string | ((i: number) => string); seed?: number }> = ({
  t, a, cols = 6, rows = 9, d = 0.58, hold, color = "#111", seed = 3,
}) => {
  if (t < a) return null;
  const end = hold ?? 999;
  if (t > end + d) return null;
  const cw = W / cols, ch = H / rows;
  return (
    <AbsoluteFill>
      {Array.from({ length: cols * rows }, (_, i) => {
        const r = rand(i * 17 + seed) * (d - 0.1);
        const u = k(t, a + r, 0.09, outCubic) * (1 - k(t, end + r, 0.09, outCubic));
        if (u <= 0) return null;
        const c = typeof color === "function" ? color(i) : color;
        return <div key={i} style={{ position: "absolute", left: (i % cols) * cw, top: Math.floor(i / cols) * ch, width: cw + 1, height: ch + 1, background: c, transform: `scale(${u})` }} />;
      })}
    </AbsoluteFill>
  );
};

// ── 14. Зум по интерфейсу ────────────────────────────────────────────────────
/** 14. Запись экрана: ×z (2–2,5) за d (~0,3 с) к точке (fx, fy); вокруг пятна r — размыто 8 px и притушено до 30 %. b — отъезд назад. */
export const ZoomUI: React.FC<{ t: number; a: number; fx: number; fy: number; z?: number; d?: number; r?: number; b?: number; children: React.ReactNode }> = ({
  t, a, fx, fy, z = 2.2, d = 0.3, r = 300, b = 999, children,
}) => {
  const u = k(t, a, d, outCubic) * (1 - k(t, b, d, outCubic));
  const tr: React.CSSProperties = { transformOrigin: `${fx}px ${fy}px`, transform: `scale(${lerp(1, z, u)})` };
  const mask = `radial-gradient(circle ${r}px at ${fx}px ${fy}px, #000 72%, transparent 100%)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ ...tr, filter: u > 0 ? `blur(${8 * u}px) brightness(${lerp(1, 0.3, u)})` : undefined }}>{children}</AbsoluteFill>
      {u > 0 && <AbsoluteFill style={{ ...tr, WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>}
    </AbsoluteFill>
  );
};

// ── 15. Камера дышит ─────────────────────────────────────────────────────────
/**
 * 15. Масштаб плана: медленный наезд rate (0,02–0,05 в секунду) от a; на каждом hit прыжок +jump (0,10–0,12) за 2 кадра и держится;
 * cuts — джамп-каты 100 ↔ 115 % (каждая отметка переключает крупность). Полным спикерам и слабому аватару — до ×1,1, см. SKILL.md.
 */
export function breathe(t: number, a: number, o: { rate?: number; hits?: number[]; jump?: number; cuts?: number[]; tight?: number } = {}): number {
  const { rate = 0.03, hits = [], jump = 0.11, cuts = [], tight = 1.15 } = o;
  const drift = 1 + rate * Math.max(0, t - a);
  const hit = hits.reduce((s, h) => s * (1 + jump * k(t, h, 2 * FR, outCubic)), 1);
  const cut = cuts.filter((c) => t >= c).length % 2 ? tight : 1;
  return drift * hit * cut;
}
export const Breathe: React.FC<{ t: number; a: number; rate?: number; hits?: number[]; cuts?: number[]; jump?: number; origin?: string; children: React.ReactNode }> = ({ t, a, origin = "50% 42%", children, ...o }) => (
  <AbsoluteFill style={{ transform: `scale(${breathe(t, a, o)})`, transformOrigin: origin }}>{children}</AbsoluteFill>
);

// ── 16. Неон-слово ───────────────────────────────────────────────────────────
/** 16. Неон: узкий гротеск с цветным контуром и свечением; буквы зажигаются вразнобой и мерцают ~0,45 с; уголки [ ] рисуются вокруг. */
export const NeonWord: React.FC<{ t: number; a: number; text: string; color?: string; size?: number; y?: number; brackets?: boolean; seed?: number; b?: number }> = ({
  t, a, text, color = "#FFE14D", size = 170, y = H / 2, brackets = true, seed = 1, b = 999,
}) => {
  if (t < a || t >= b) return null;
  const f = Math.floor(t / FR);
  const chars = [...text.toUpperCase()];
  const sz = Math.min(size, fit(text.toUpperCase(), F.narrow, 900, size, 600));
  const lit = (i: number) => {
    const s = a + rand(i * 7 + seed) * 0.3;
    if (t < s) return 0.12;
    if (t > s + 0.45) return 1;
    return rand(f * 31 + i * 5 + seed) > 0.45 ? 1 : 0.25;
  };
  const br = k(t, a, 0.3, outCubic);
  const L = 56;
  const corner = (x: string, y2: string, bt: string, bl: string): React.CSSProperties => ({ position: "absolute", width: L * br, height: L * br, [x]: -36, [y2]: -30, [bt]: `5px solid ${color}`, [bl]: `5px solid ${color}`, filter: `drop-shadow(0 0 8px ${color})` });
  return (
    <div style={{ position: "absolute", left: W / 2, top: y, transform: "translate(-50%,-50%)", whiteSpace: "nowrap" }}>
      {chars.map((ch, i) => {
        const l = lit(i);
        return (
          <span key={i} style={{ fontFamily: F.narrow, fontWeight: 600, fontSize: sz, lineHeight: 1, color: l > 0.9 ? "#FFFDF2" : "transparent", WebkitTextStroke: `${Math.max(2, sz * 0.022)}px ${color}`, opacity: Math.max(0.15, l), textShadow: l > 0.9 ? glowOf(color, 12) : "none", whiteSpace: "pre" }}>
            {ch}
          </span>
        );
      })}
      {brackets && (
        <>
          <div style={corner("left", "top", "borderTop", "borderLeft")} />
          <div style={corner("right", "top", "borderTop", "borderRight")} />
          <div style={corner("left", "bottom", "borderBottom", "borderLeft")} />
          <div style={corner("right", "bottom", "borderBottom", "borderRight")} />
        </>
      )}
    </div>
  );
};
