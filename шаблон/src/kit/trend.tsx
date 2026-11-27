// Детали «тренд»: 16 приёмов из разбора 22 трендовых рилсов по кадрам 12 к/с (25.10.2026). Числа — из разбора, не придуманы.
// Все времена — секунды (обычно at("слово")). Каталог «когда брать» — приёмы.md, раздел «Детали шаблона», таблица «Тренд».
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { fit, measure } from "../fonts";
import { C, F, FPS, H, W, clamp, k, lerp, rand } from "../lib";
import { P } from "./vary/recept";

const FR = 1 / FPS; // кадр ролика (было 1/30 — при 25 к/с вход слова съезжал, ролик 74 27.11)
// чистое замедление без отскока: easeOutCubic ≈ cubic-bezier(.2,.8,.2,1) и easeOutExpo — главный скачок в первых кадрах
export const outCubic = (u: number) => 1 - Math.pow(1 - u, 3);
export const outExpo = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
export const inCubic = (u: number) => u * u * u;
export const inOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lin = (u: number) => u;
const fade = (t: number, a: number, d: number) => interpolate(t, [a, a + d], [0, 1], clamp);

/**
 * Гарнитуры. Свод 13 эталонов 27.11: 10 из 13 — неогротеск (Helvetica/SF/Neue Montreal) → Inter в двух весах; курсивная антиква
 * для ключевого — Playfair 900. g* — роли Inter: g 400, gMed 600 (служебное), gBold 800, gBlack 900 (ключевое, трекинг −2 %),
 * gI — Inter Italic 300 (тонкое служебное, эталон 01), gBlackI — Inter Italic 900. inter / interI — то же, что gMed / gI.
 * serifBlack — Playfair Display Italic 900 (эталоны 04, 09, 13); uiMed — Montserrat 600 (геометричный стиль 04, 05, 07). Старые роли (black, serif, ui, narrow, thin, script) не тронуты.
 */
export type Font = "thin" | "serif" | "script" | "black" | "narrow" | "ui" | "uiMed" | "inter" | "interI" | "g" | "gMed" | "gBold" | "gBlack" | "gI" | "gBlackI" | "serifBlack";
export const FONT: Record<Font, React.CSSProperties> = {
  thin: { fontFamily: F.ui, fontWeight: 200 },
  ui: { fontFamily: F.ui, fontWeight: 800 },
  uiMed: { fontFamily: F.ui, fontWeight: 600 }, // Montserrat SemiBold — субтитры геометричного стиля (04, 05, 07)
  serif: { fontFamily: F.serif, fontWeight: 500 },
  script: { fontFamily: F.script },
  black: { fontFamily: F.head, textTransform: "uppercase" },
  narrow: { fontFamily: F.narrow, fontWeight: 600, textTransform: "uppercase" },
  inter: { fontFamily: F.inter, fontWeight: 600, letterSpacing: "-0.01em" },
  interI: { fontFamily: F.interI, fontWeight: 300 },
  g: { fontFamily: F.inter, fontWeight: 400 },
  gMed: { fontFamily: F.inter, fontWeight: 600, letterSpacing: "-0.01em" },
  gBold: { fontFamily: F.inter, fontWeight: 800, letterSpacing: "-0.02em" },
  gBlack: { fontFamily: F.inter, fontWeight: 900, letterSpacing: "-0.025em" },
  gI: { fontFamily: F.interI, fontWeight: 300 },
  gBlackI: { fontFamily: F.interI, fontWeight: 900, letterSpacing: "-0.02em" },
  serifBlack: { fontFamily: F.serif, fontWeight: 900 },
};
// свечение тем же цветом r + 2,4r, прозрачность ≈60 / 33 % (02, 05, 10, 12: «r 8–14 + 24 px», 02: opacity ≈60 %); было 100 / 53 % — буквы мылились
const glowOf = (c: string, r = 10) => (/^#[0-9a-f]{6}$/i.test(c) ? `0 0 ${r}px ${c}99, 0 0 ${r * 2.4}px ${c}55` : `0 0 ${r}px ${c}, 0 0 ${r * 2.4}px ${c}88`);
/** мягкая тень текста эталонов (04, 07, 09, 10, 13): 0 2–4 px 6–20 px, rgba(0,0,0,.35–.6) — без неё белое слово теряется на светлой одежде */
export const SOFT = "0 3px 14px rgba(0,0,0,0.5)";
/** кегль роли f, при котором строка занимает width px: учитывает вес, капс и трекинг роли (fit из fonts.ts меряет 400 без трекинга) */
export function fitF(text: string, f: Font, width: number, max = 400): number {
  const st = FONT[f];
  const s = st.textTransform === "uppercase" ? text.toUpperCase() : text;
  const w100 = measure(s, (st.fontFamily as string) ?? F.head, 100, Number(st.fontWeight ?? 400));
  const ls = parseFloat(String(st.letterSpacing ?? "0")) || 0; // em
  return Math.min(max, width / Math.max(0.01, w100 / 100 + ls * [...s].length));
}

/** Тёплый белый эталонов вместо #FFF: 03 — #F4F2E8, 13 — #E9E5DA, урок 14 — #F6EBE2. Бренд со своим светлым цветом — его. */
export const WARM = { a: "#F4F2E8", b: "#E9E5DA", c: "#F6EBE2" };
const TXT = C.white.toUpperCase() === "#FFFFFF" ? WARM.a : C.white;
/** Заливка текста: цвет или вертикальный градиент [верх, низ] (эталоны 06, 11, 13: #FFF → #BFC4CC). Свечение при градиенте — filter. */
export function fillOf(color: string, grad?: [string, string], glow?: number): React.CSSProperties {
  if (!grad) return { color, textShadow: glow ? glowOf(color, glow) : undefined };
  return { color: "transparent", backgroundImage: `linear-gradient(180deg, ${grad[0]}, ${grad[1]})`, WebkitBackgroundClip: "text", backgroundClip: "text",
    ...(glow ? { filter: `drop-shadow(0 0 ${glow}px ${grad[0]})` } : {}) };
}
const hexRgb = (c: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const x = m[1].length === 3 ? m[1].split("").map((q) => q + q).join("") : m[1];
  const n = parseInt(x, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** тусклый вариант акцента для 1-го кадра входа (02, 05, 10, 12): лайм → оливковый, красный → тёмно-красный; белый/серый → null */
export function dimOf(c: string): string | null {
  const r = hexRgb(c);
  if (!r) return null;
  const mx = Math.max(...r), mn = Math.min(...r);
  if (mx === 0 || (mx - mn) / mx < 0.3) return null; // ненасыщенный — не акцент
  return "#" + r.map((v) => Math.round(v * 0.48).toString(16).padStart(2, "0")).join("");
}

/**
 * Тон ролика (рецепт P.ton, recept.py TEMP) → числа входа слов из свода 27.11, раздел 2 «Слово встаёт на своё место»:
 * динамичный — 2–3 кадра, ключевое 110→100 % за 0,1 с с тусклым акцентом (12); средний — 3–4 кадра, ключевое из размытия 24 px
 * с подъёмом 2 % за 0,23 с (02); спокойный — слово серым 4 кадра (grey, 04, 08), ключевое 110→100 % + blur 8 за 0,15 с (04),
 * группа уходит серым (08). per — шаг печати по буквам (TypeOn). krupnosti — уровни джамп-катов (breathe).
 */
export type Ton = "dinamichno" | "sredne" | "spokoyno";
export const tonNow = (): Ton => (P.ton === "energichno" ? "dinamichno" : (P.ton as Ton) ?? "sredne");
export const TON_SLOVO: Record<Ton, { mode: WordMode; d: number; key: { d: number; from?: number; blur: number; rise: number }; out: OutMode; per: number; krupnosti: number[] }> = {
  dinamichno: { mode: "fast", d: 0.07, key: { d: 0.1, from: 1.1, blur: 0, rise: 0 }, out: "cut", per: 0.03, krupnosti: [1, 1.15, 1.3] },
  sredne: { mode: "fast", d: 0.11, key: { d: 0.23, blur: 24, rise: 0.02 }, out: "cut", per: 0.045, krupnosti: [1, 1.15] },
  spokoyno: { mode: "grey", d: 0.17, key: { d: 0.15, from: 1.1, blur: 8, rise: 0 }, out: "grey", per: 0.055, krupnosti: [1, 1.08] },
};

/** Уход группы (свод, «Уход группы»): cut — за 1 кадр (по умолчанию, 9 эталонов); grey — за 0,2 с в серый 50 %, blur 0→8,
 *  вверх 3 % высоты (08, спокойный); blur — fade + blur 6 за 0,1 с (04). Возвращает null, когда группы уже нет. */
export type OutMode = "cut" | "grey" | "blur";
export function outStyle(t: number, out: number, mode: OutMode = "cut"): React.CSSProperties | null {
  if (t < out) return {};
  if (mode === "cut") return null;
  const d = mode === "grey" ? 0.2 : 0.1;
  if (t >= out + d) return null;
  const u = (t - out) / d;
  if (mode === "blur") return { opacity: 1 - u, filter: `blur(${6 * u}px)` };
  return { filter: `blur(${8 * outCubic(u)}px) brightness(${lerp(1, 0.55, outCubic(u))}) saturate(${1 - u})`, transform: `translateY(${-H * 0.03 * outCubic(u)}px)`, opacity: u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1 };
}

// ── 1. Слово из размытия ──────────────────────────────────────────────────────
/**
 * Стиль одного слова. Режимы (ручной отбор 27.11, 13 эталонов Бобби: слово встаёт за 2–3 кадра, без размытия и масштаба):
 *   fast (по умолчанию) — 1-й кадр 50 % и ниже на 1,5 % высоты, ко 2–3-му кадру на месте (0,08 с), без blur/scale;
 *   key — ключевое слово: размытие 24→0 px, подъём 2 % высоты, 0,23 с (эталон 02, 04);
 *   soft — старое (25.10): blur 8→0, scale 1,08→1, 0,28 с, первые 2 кадра серые — только для спокойного тона.
 */
export type WordMode = "fast" | "key" | "soft" | "grey";
/**
 * Параметры (свод 27.11, P1 #3): blur — px размытия на входе (0 по умолчанию у fast; 2–4 спокойный; 10–12 «из размытия», 01, 02, 06);
 * rise — подъём долей высоты числом (0 / 0,006 / 0,015; true/false — старое поведение soft); from — масштаб старта (key: 1,1 — эталон 12,
 * 0,65 + blur 15 — эталон 01); dim — цвет 1-го кадра; у акцента по умолчанию тусклый акцент (оливковый для лайма), не серый.
 * grey — слово встаёт серым #8A8A8A и держит его 4 кадра, blur 4→0 за 0,17 с, без сдвига (04, 08, 10, 11; спокойный тон).
 */
export function blurWord(t: number, a: number, o: { d?: number; rise?: boolean | number; color?: string; grey?: string; mode?: WordMode; blur?: number; from?: number; dim?: string } = {}): React.CSSProperties {
  const { mode = "fast", color = TXT } = o;
  if (t < a) return { opacity: 0 };
  const first = t - a < FR;
  const dim = o.dim ?? dimOf(color);
  const riseN = typeof o.rise === "number" ? o.rise : undefined;
  const sc = (u: number) => (o.from && o.from !== 1 ? ` scale(${lerp(o.from, 1, u)})` : "");
  if (mode === "fast") {
    const u = k(t, a, o.d ?? 0.08, outCubic);
    const b = o.blur ?? 0;
    return { opacity: lerp(0.5, 1, u), transform: `translateY(${lerp(H * (riseN ?? 0.015), 0, u)}px)${sc(u)}`, filter: b && u < 1 ? `blur(${lerp(b, 0, u)}px)` : undefined, color: first && dim ? dim : color };
  }
  if (mode === "key") {
    const u = k(t, a, o.d ?? 0.23, outCubic);
    const b = o.blur ?? 24;
    return { opacity: Math.min(1, lerp(0.6, 1, u) * (b > 12 ? Math.min(1, u * 1.8 + 0.2) : 1)), filter: b && u < 1 ? `blur(${lerp(b, 0, u)}px)` : undefined,
      transform: `translateY(${lerp(H * (riseN ?? 0.02), 0, u)}px)${sc(u)}`, color: first && dim ? dim : color };
  }
  if (mode === "grey") {
    const u = k(t, a, o.d ?? 0.17, outCubic);
    return { filter: u < 1 ? `blur(${lerp(o.blur ?? 4, 0, u)}px)` : undefined, color: t - a < 4 * FR ? o.grey ?? C.grey : color };
  }
  const { d = 0.28, rise = false, grey = "rgba(255,255,255,0.5)" } = o;
  const u = k(t, a, d, outCubic);
  return {
    opacity: Math.min(1, u * 1.6),
    filter: `blur(${lerp(8, 0, u)}px)`,
    transform: rise ? `translateY(${lerp(16, 0, u)}px)` : `scale(${lerp(1.08, 1, u)})`,
    color: t - a < 2 * FR ? grey : color,
  };
}
/** вход ключевого слова по тону ролика (TON_SLOVO.key): готовые опции для blurWord */
export const keyOpts = (ton: Ton = tonNow()) => ({ mode: "key" as WordMode, ...TON_SLOVO[ton].key });

export type TW = [text: string, t: number];
/** 1. Фраза по словам точно по голосу (слово встаёт за 2–3 кадра, mode fast; акцентное — key по тону). out — группа уходит (outMode: cut за
 *  1 кадр — 05, 12; grey — спокойный, 08; blur — 04). blur / rise / d — вход каждого слова (см. blurWord). grad — заливка градиентом. */
export const BlurWords: React.FC<{ t: number; words: TW[]; out?: number; y?: number; width?: number; size?: number; font?: Font; color?: string; rise?: boolean | number; accent?: [index: number, color: string]; mode?: WordMode;
  outMode?: OutMode; blur?: number; d?: number; grad?: [string, string]; ton?: Ton; accentKey?: boolean; shadow?: string }> = ({
  t, words, out = 999, y = H / 2, width = 900, size = 92, font = "gBold", color = TXT, rise, accent, mode, outMode = "cut", blur, d, grad, ton, accentKey = true, shadow,
}) => {
  const os = outStyle(t, out, outMode);
  if (!os || t < words[0][1]) return null;
  const tn = ton ?? tonNow();
  const md = mode ?? TON_SLOVO[tn].mode;
  return (
    <div style={{ position: "absolute", left: (W - width) / 2, width, top: y, transform: `translateY(-50%) ${os.transform ?? ""}`, filter: os.filter, opacity: os.opacity, display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.26, rowGap: size * 0.05 }}>
      {words.map(([s, a], i) => {
        const isAcc = !!accent && accent[0] === i;
        const isKey = isAcc && accentKey; // accentKey false — акцент только цветом, вход как у остальных (эталон 04)
        const c = isAcc ? accent[1] : color;
        const st = isKey && md !== "soft" ? blurWord(t, a, { ...keyOpts(tn), color: c }) : blurWord(t, a, { rise, color: c, mode: md, blur, d: d ?? (md === "fast" ? TON_SLOVO[tn].d : undefined) });
        return (
          <span key={i} style={{ ...FONT[font], fontSize: size, lineHeight: 1.04, whiteSpace: "nowrap", display: "inline-block", ...st, ...(grad && !isKey ? fillOf(c, grad) : {}), textShadow: isKey ? `${glowOf(c, 9)}, ${SOFT}` : shadow ?? SOFT }}>
            {s}
          </span>
        );
      })}
    </div>
  );
};

// ── 2. Мелкое + огромное ─────────────────────────────────────────────────────
export type Part = { text: string; t: number; font?: Font; big?: boolean; color?: string; glow?: boolean; grad?: [string, string]; push?: boolean };
export type RowAlign = "center" | "left" | "right" | "spread";
/**
 * 2. Мелкое служебное + огромное ключевое (свод 27.11, P1 #2; 13 из 13 эталонов). Одна гарнитура в двух весах: мелкое Inter 600,
 * ключевое Inter 900 в обычном регистре (upper — капс). Ключевое — bigW доли ширины (0,45–0,78; 0,6), мелкое меньше в ratio раз
 * (1,35–2,5; 1,8 — урок 14; small задаёт его прямо). lead — шаг строк от кегля (0,78–0,9: строки наползают на 15–25 %).
 * aligns — выравнивание каждой строки по блоку ключевого: left / right / center / spread (мелкое над огромным по левому краю,
 * под ним — по правому, эталон 12; spread — два слова по краям блока). dx — сдвиг строки в долях ширины. step — старая лесенка
 * в px (по умолчанию 0; 5–10 % ширины — только как у 01, 05). grad — градиент на слове. outMode — уход группы (cut / grey / blur).
 * Part.push — слово и следующие за ним в строке прижать к правому краю блока («If the … have to» над ключевым, эталон 12).
 * wordOpts — вход мелких слов поверх тона: {d, rise, blur} (12: 2–3 кадра, blur 2–3, без сдвига → {rise: 0, blur: 3}); keyIn — то же для
 * ключевого поверх TON_SLOVO.key (за головой у 12 — за 1 кадр: {d: 1/30, blur: 0}).
 */
export const BigSmall: React.FC<{ t: number; rows: Part[][]; y?: number; width?: number; small?: number; step?: number; out?: number; soft?: boolean;
  bigW?: number; ratio?: number; lead?: number; upper?: boolean; aligns?: RowAlign[]; dx?: number[]; outMode?: OutMode; ton?: Ton; maxBig?: number; wordOpts?: { d?: number; rise?: number; blur?: number }; keyIn?: { d?: number; from?: number; blur?: number; rise?: number } }> = ({
  t, rows, y = 820, width, small, step = 0, out = 999, soft, bigW, ratio = 1.8, lead = 0.86, upper = false, aligns = [], dx = [], outMode = "cut", ton, maxBig = 300, wordOpts, keyIn,
}) => {
  const os = outStyle(t, out, outMode); // cut — группа исчезает за 1 кадр (эталоны 05, 12)
  if (!os) return null;
  const tn = ton ?? tonNow();
  const bw = bigW ?? (width ? (width * 0.8) / W : 0.6);
  const showBig = (p: Part) => (upper ? p.text.toUpperCase() : p.text);
  const sizes = rows.map((row) => {
    const big = row.find((p) => p.big);
    return big ? fitF(showBig(big), big.font ?? "gBlack", W * bw, maxBig) : 0;
  });
  const firstBig = sizes.find((s) => s > 0);
  const sm = small ?? (firstBig ? Math.round(firstBig / ratio) : 64);
  const blockW = firstBig ? W * bw : width ?? W * 0.8;
  let yy = y;
  return (
    <div style={{ position: "absolute", inset: 0, transform: os.transform, filter: os.filter, opacity: os.opacity }}>
      {rows.map((row, ri) => {
        const bigSize = sizes[ri] || sm;
        const h = Math.max(sm, bigSize) * lead;
        const top = yy;
        yy += h;
        const al = aligns[ri] ?? "center";
        const shift = (ri - (rows.length - 1) / 2) * step + (dx[ri] ?? 0) * W;
        const jc = al === "left" ? "flex-start" : al === "right" ? "flex-end" : al === "spread" ? "space-between" : "center";
        return (
          <div key={ri} style={{ position: "absolute", left: (W - blockW) / 2 - (al === "center" ? W : 0), width: blockW + (al === "center" ? 2 * W : 0), top, height: h, display: "flex", alignItems: "baseline", justifyContent: jc, transform: `translateX(${shift}px)` }}>
            {row.map((p, i) => {
              const f = p.font ?? (p.big ? "gBlack" : "gMed");
              const col = p.color ?? TXT;
              const wo = soft ? { mode: "soft" as WordMode } : p.big ? { ...keyOpts(tn), ...keyIn } : { mode: TON_SLOVO[tn].mode, d: TON_SLOVO[tn].d, ...wordOpts };
              return (
                <span key={i} style={{ // зазор: между двумя крупными — 0,18 крупного (было 0,3 мелкого → «6саат», ролик 74); push в center-строке
                  // не работает (строка растянута на ±W — слово уходило за кадр), только в left/right/spread
                  marginLeft: p.push && al !== "center" ? "auto" : i === 0 ? 0 : p.big && row[i - 1].big ? bigSize * 0.18 : sm * 0.3, ...FONT[f], ...(p.big && upper ? { textTransform: "uppercase" as const } : {}), fontSize: p.big ? bigSize : sm, lineHeight: 0.95, whiteSpace: "nowrap", display: "inline-block",
                  ...blurWord(t, p.t, { ...wo, color: col }), ...(p.grad ? fillOf(col, p.grad, p.glow ? 11 : 0) : { textShadow: p.glow ? `${glowOf(col, 11)}, ${SOFT}` : SOFT }) }}>
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
export const Flash: React.FC<{ t: number; a: number; kind?: "flare" | "cold" | "white" | "negative" | "rgb" | "glitch"; color?: string; from?: "left" | "right" | "top" }> = ({
  t, a, kind = "flare", color = "#FF8A2A", from = "left",
}) => {
  const d = t - a;
  // белая вспышка не 100 %: 80 → 35 → 0 % за два кадра (ролик 68, 24.11.2026)
  if (kind === "white") return d >= 0 && d < 2 * FR ? <AbsoluteFill style={{ background: "#fff", opacity: d < FR ? 0.8 : 0.35 }} /> : null;
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
  // cold — холодный блик (эталон 11): белый 70 % 1–2 кадра, спад 0,12 с, весь ~0,18 с, без тёплого хвоста
  if (kind === "cold") {
    if (d < 0 || d > 0.2) return null;
    const w = d < 2 * FR ? 0.7 : 0.7 * (1 - outCubic(Math.min(1, (d - 2 * FR) / 0.12)));
    return <AbsoluteFill style={{ background: "#F4F8FF", opacity: w }} />;
  }
  if (d < -2 * FR || d > 0.45) return null;
  const edge = from === "left" ? "0% 50%" : from === "right" ? "100% 50%" : "50% 0%";
  const pre = d < 0 ? lerp(0.35, 1, (d + 2 * FR) / (2 * FR)) : 0;
  // эталоны 27.11 (02, 04, 10): белый ≈60 % 1 кадр, спад 0,1–0,15 с, тёплый оттенок ~0,3 с (было 100 % и 0,35 с — тяжело)
  const white = d < 0 ? 0 : d < FR ? 0.6 : 0.5 * (1 - outCubic(Math.min(1, (d - FR) / 0.13)));
  const tint = d < 0 ? 0 : 0.35 * (1 - Math.min(1, d / 0.32));
  return (
    <>
      {pre > 0 && <AbsoluteFill style={{ mixBlendMode: "screen", background: `radial-gradient(ellipse 90% 120% at ${edge}, ${color} 0%, ${color}66 35%, transparent 70%)`, opacity: pre }} />}
      {white > 0 && <AbsoluteFill style={{ background: "#fff", opacity: white }} />}
      {tint > 0 && <AbsoluteFill style={{ mixBlendMode: "screen", background: `radial-gradient(ellipse 110% 80% at ${edge}, ${color} 0%, transparent 75%)`, opacity: tint }} />}
    </>
  );
};

// ── 4. Отъезд-склейка ────────────────────────────────────────────────────────
/** Стиль: новый план стартует с from и садится к 100 % за d, easeOutExpo. Эталоны 27.11: 125–130 % за 0,1–0,17 с (02), 150 % за 0,55 с
 *  без размытия (12) — по умолчанию 1,28 за 0,18 с, лёгкий смаз 6 px первые кадры. Было 1,6 / 0,38 / 14 px — тяжело. */
export type Ease = "expo" | "cubic" | "inOut" | ((u: number) => number);
const easeFn = (e: Ease = "expo") => (typeof e === "function" ? e : e === "cubic" ? outCubic : e === "inOut" ? inOutCubic : outExpo);
/** Готовые влёты (свод, P2 #9): calm — 1,12 → 1 за 0,75 с, outCubic, без смаза (08, спокойный); open — открытие 1,73 → 1 за 0,62 с,
 *  easeInOutCubic, смаз колоколом 0→12→0 (03); long — 1,5 → 1 за 0,55 с без смаза (12); fast — 1,28 / 0,18 / 6 (по умолчанию, 02). */
export const PULL = {
  fast: { from: 1.28, d: 0.18, blur: 6, ease: "expo" as Ease, bell: false },
  calm: { from: 1.12, d: 0.75, blur: 0, ease: "cubic" as Ease, bell: false },
  open: { from: 1.73, d: 0.62, blur: 12, ease: "inOut" as Ease, bell: true },
  long: { from: 1.5, d: 0.55, blur: 0, ease: "expo" as Ease, bell: false },
};
export function pullIn(t: number, a: number, from = 1.28, d = 0.18, blur = 6, ease: Ease = "expo", bell = false): React.CSSProperties {
  const u = k(t, a, d, easeFn(ease));
  const lin01 = Math.min(1, Math.max(0, (t - a) / d));
  const bl = bell ? blur * Math.sin(Math.PI * lin01) : lerp(blur, 0, Math.min(1, u * 1.5));
  return { transform: `scale(${lerp(from, 1, u)})`, filter: u < 1 && bl > 0.05 ? `blur(${bl}px)` : undefined };
}
/** 4. Отъезд-склейка: обёртка плана. Тем же приёмом открывать ролик (первые 0,5 с). preset — calm / open / long; свои from, d, blur, ease сильнее. */
export const PullIn: React.FC<{ t: number; a: number; from?: number; d?: number; blur?: number; ease?: Ease; preset?: keyof typeof PULL; origin?: string; children: React.ReactNode }> = ({ t, a, from, d, blur, ease, preset = "fast", origin, children }) => {
  const p = PULL[preset];
  return <AbsoluteFill style={{ ...pullIn(t, a, from ?? p.from, d ?? p.d, blur ?? p.blur, ease ?? p.ease, p.bell), transformOrigin: origin }}>{children}</AbsoluteFill>;
};

// ── 4б. Толчок в склейку (свод 27.11, P1 #8: 02, 06, 09, урок 14 — основная замена вспышки) ───────────────
/**
 * Последние d (0,10–0,17) с плана до склейки a: scale 1 → to (1,20–1,25; 1,22) с разгоном, смаз 0 → blur px. Кривая — u^pow:
 * эталон 06 по кадрам 100 → 103 → 108 → 115 → 125 % = u^1,5 (по умолчанию); pow 3 — easeInCubic из свода, жёстче.
 * Текст класть внутрь — он едет вместе с планом. С a план не рисуется: голая склейка. next — новый план, он садится через
 * PullIn nextFrom / nextD (1,25 / 0,13). Звук — вжух с пиком на a. Эталон 06: 100 → 103 → 108 → 115 → 125 % за 5 кадров.
 */
export const PushCut: React.FC<{ t: number; a: number; d?: number; to?: number; blur?: number; pow?: number; origin?: string; next?: React.ReactNode; nextFrom?: number; nextD?: number; children: React.ReactNode }> = ({
  t, a, d = 0.17, to = 1.22, blur = 10, pow = 1.5, origin = "50% 45%", next, nextFrom = 1.25, nextD = 0.13, children,
}) => {
  if (t >= a) return next ? <PullIn t={t} a={a} from={nextFrom} d={nextD} origin={origin}>{next}</PullIn> : null;
  const u = Math.pow(Math.min(1, Math.max(0, (t - (a - d)) / d)), pow);
  return <AbsoluteFill style={{ transform: `scale(${lerp(1, to, u)})`, transformOrigin: origin, filter: u > 0.01 ? `blur(${blur * u}px)` : undefined }}>{children}</AbsoluteFill>;
};

// ── 5. Текст за спикером ─────────────────────────────────────────────────────
/**
 * 5. Слои: фон → текст → вырезка человека (person — <OffthreadVideo transparent src="cutout.webm"> или <Img>). Свод 27.11, P1 #7:
 * вход за 1 кадр без масштаба (from 1, d 1/30 — эталоны 03, 09, 12); вариант 04 — from 1,1 + blur 8 за 0,15 с. Камера не толкается.
 * words — слова по голосу, каждое встаёт за 1 кадр (03); layer — любой свой слой на место текста (например BigSmall: мелкое и
 * огромное за головой, эталон 12). out — уход: fade + blur 6 за 0,1 с (04). follow — общий transform плана (Breathe / PullIn),
 * чтобы текст ехал с камерой (08, 09). Голова закрывает 1–2 буквы: y 5–35 % высоты, ширина 47–96 %. echo — эхо-силуэты (старое).
 */
export const BehindText: React.FC<{ t: number; a: number; text?: string; person: React.ReactNode; bg?: React.ReactNode; y?: number; width?: number; color?: string; font?: Font; echo?: boolean; glow?: boolean; push?: number;
  from?: number; d?: number; blur?: number; words?: TW[]; layer?: React.ReactNode; out?: number; follow?: React.CSSProperties; grad?: [string, string]; upper?: boolean }> = ({
  t, a, text = "", person, bg, y = 640, width = 840, color = TXT, font = "gBlack", echo, glow, push: pushK = 0, from = 1, d = FR, blur, words, layer, out = 999, follow, grad, upper,
}) => {
  const u = k(t, a, d, outCubic);
  const push = 1 + pushK * k(t, a, 0.3, outCubic);
  const bl = blur ?? (from !== 1 ? 8 : 0);
  const os = outStyle(t, out, "blur");
  const shown = words ? words.map((x) => x[0]).join(" ") : text;
  const caps = upper || FONT[font].textTransform === "uppercase";
  const size = fitF(caps ? shown.toUpperCase() : shown, font, width, 520);
  const span = (s: string, key?: number, st: React.CSSProperties = {}) => (
    <span key={key} style={{ ...FONT[font], ...(caps ? { textTransform: "uppercase" as const } : {}), fontSize: size, lineHeight: 0.86, whiteSpace: "pre", display: "inline-block", ...fillOf(color, grad, glow ? 14 : 0), ...st }}>{s}</span>
  );
  return (
    <AbsoluteFill style={{ ...follow, transform: `${follow?.transform ?? ""} scale(${push})` }}>
      {bg}
      {layer}
      {t >= a && os && (
        <div style={{ position: "absolute", left: 0, width: W, top: y, transform: `translateY(-50%) scale(${lerp(from, 1, u)})`, textAlign: "center", opacity: Math.min(1, u * 2) * Number(os.opacity ?? 1), filter: os.filter ?? (u < 1 && bl ? `blur(${lerp(bl, 0, u)}px)` : undefined) }}>
          {words ? words.map(([s, wa], i) => span(i < words.length - 1 ? s + " " : s, i, { opacity: t >= wa ? 1 : 0 })) : span(text)}
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
/**
 * 6. Тонировка фона цветом раздела (проблема — красный, решение — жёлтый). Свод 27.11, P2 #12: d — время входа и ухода (0,5; 0 — смена
 * за 1 кадр на ударном слове, 11, или жёстко на склейке, 10); blend hue — сохраняет свет и тени стены (по умолчанию color);
 * radial {x, y} — тонировка расходится кругом от головы 0 → o (0,7) за d 0,25 (01); person — вырезка: тонируется только фон под ней
 * (слои фон → Tint → вырезка; кожа и одежда не перекрашиваются).
 */
export const Tint: React.FC<{ t: number; a: number; color: string; o?: number; b?: number; d?: number; blend?: "color" | "hue"; radial?: { x: number; y: number }; person?: React.ReactNode }> = ({
  t, a, color, o = 0.55, b = 999, d = 0.5, blend = "color", radial, person,
}) => {
  const fd = (x: number) => (d <= 0 ? (t >= x ? 1 : 0) : fade(t, x, d));
  const on = !(t < a || t > b + d);
  let mask: string | undefined;
  if (radial && on) {
    const r = lerp(0, H * 1.25, outCubic(Math.min(1, (t - a) / Math.max(FR, d))));
    mask = `radial-gradient(circle ${Math.max(1, r)}px at ${radial.x}px ${radial.y}px, #000 70%, transparent 100%)`;
  }
  const layer = on ? <AbsoluteFill style={{ background: color, mixBlendMode: blend, opacity: o * (radial ? 1 : fd(a)) * (1 - fd(b)), WebkitMaskImage: mask, maskImage: mask }} /> : null;
  if (!person) return layer;
  return (
    <>
      {layer}
      <AbsoluteFill>{person}</AbsoluteFill>
    </>
  );
};

// ── 6б. Нижнее затемнение под текст (свод, P2 #13: 01, 06, 11, 12, урок 14) ───
/** Постоянный градиент снизу под текстом, поверх видео: прозрачно до from (0,55–0,70 высоты) → color у низа (плотность 0,5–0,88). */
export const BottomShade: React.FC<{ from?: number; color?: string }> = ({ from = 0.62, color = "rgba(10,5,4,.75)" }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent ${from * 100}%, ${color} 100%)`, pointerEvents: "none" }} />
);

// ── 7. Предмет вылетает вперёд ───────────────────────────────────────────────
/** кадры масштаба «поп» эталона 13 (перелёт до 150 %), по одному на кадр 30 к/с */
const POP13 = [0.1, 0.45, 1.25, 1.5, 1.5, 1.35, 1.15, 1.04, 1];
/**
 * 7. Предмет-пример (вырезка, 3D-эмодзи). Свод 27.11, P1 #6: фон не трогать (dim 1, blur 0 — 05, 06, 10, 13). enter:
 *   pop (по умолчанию) — 0 → 1,2 → 1 за 0,17 с (10); pop13 — перелёт до 150 % по кадрам (13); settle — досадка: 1 кадр 104 % → 100 %
 *   + подъём 1,7 % высоты за 0,17 с (05, спокойный); scale — старое: from → 1 за d (ставится само, если задан from или d);
 *   top — въезд сверху с −30 % высоты за 0,42 с со смазом (03, карточка интерфейса).
 * glow — свечение своим цветом (20 px) вместо белого. Уход в b — за 1 кадр. under — слои фон → предмет → вырезка (person), фон и
 * вырезка размываются до underBlur (19 px, эталон 03); голова перекрывает низ карточки.
 */
export const PopForward: React.FC<{ t: number; a: number; back: React.ReactNode; children: React.ReactNode; from?: number; d?: number; dim?: number; x?: number; y?: number; b?: number;
  blur?: number; enter?: "pop" | "pop13" | "settle" | "scale" | "top"; glow?: string; under?: boolean; person?: React.ReactNode; underBlur?: number }> = ({
  t, a, back, children, from, d, dim = 1, x = W / 2, y = H / 2, b = 999, blur = 0, enter, glow, under, person, underBlur = 19,
}) => {
  const en = enter ?? (from !== undefined || d !== undefined ? "scale" : under ? "top" : "pop");
  const s = t - a;
  let scale = 1, dy = 0, op = 1, smear = 0;
  if (en === "scale") {
    const u = k(t, a, d ?? 0.36, outCubic);
    scale = lerp(from ?? 0.5, 1, u);
    op = Math.min(1, u * 2);
  } else if (en === "pop") {
    const dd = d ?? 0.17;
    scale = s < dd * 0.55 ? lerp(0, 1.2, outCubic(s / (dd * 0.55))) : lerp(1.2, 1, outCubic(Math.min(1, (s - dd * 0.55) / (dd * 0.45))));
  } else if (en === "pop13") {
    scale = POP13[Math.min(POP13.length - 1, Math.max(0, Math.floor(s / FR)))];
  } else if (en === "settle") {
    const u = k(t, a + FR, d ?? 0.17, outCubic);
    scale = s < FR ? 1.04 : lerp(1.04, 1, Math.min(1, u * 3));
    dy = lerp(H * 0.017, 0, u);
  } else {
    const u = k(t, a, d ?? 0.42, outCubic);
    dy = lerp(-H * 0.3, 0, u);
    smear = u < 0.5 ? 12 * (1 - u * 2) : 0;
  }
  const u = k(t, a, en === "top" ? d ?? 0.42 : 0.17, outCubic) * (t >= b ? 0 : 1);
  const backBlur = under ? underBlur * u : blur * u;
  const backDim = lerp(1, dim, u);
  const backF = u > 0 && (backBlur > 0.05 || backDim < 1) ? `blur(${backBlur}px) brightness(${backDim})` : undefined;
  const shadow = glow ? `drop-shadow(0 0 20px ${glow})` : "drop-shadow(0 8px 22px rgba(0,0,0,0.4))";
  return (
    <>
      <AbsoluteFill style={{ filter: backF }}>{back}</AbsoluteFill>
      {t >= a && t < b && (
        <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) translateY(${dy}px) scale(${scale})`, opacity: op, filter: `${shadow}${smear ? ` blur(${smear}px)` : ""}` }}>
          {children}
        </div>
      )}
      {under && person && <AbsoluteFill style={{ filter: backF }}>{person}</AbsoluteFill>}
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
/**
 * 11. Печать по буквам. Свод 27.11, P1 #5 (05, 06, 07, 08, 10, 11, 13): mode plain (по умолчанию) — буква на месте без blur и масштаба,
 * opacity 0,35 → 0,7 → 1 за 3 кадра; dim — цвет первых 2 кадров буквы (серый, 06, 10), потом color. mode pop — старое: из blur 6 и
 * 125 % за 0,1 с. per — шаг: 0,03 динамичный, 0,05–0,06 спокойный (не задан — по тону). align left — строка растёт вправо от x
 * (center — от центра, grow). lines — несколько строк {text, t, font, color, size}, каждая печатается со своего t (стиль 13).
 */
export const TypeOn: React.FC<{ t: number; a: number; text?: string; per?: number; size?: number; font?: Font; color?: string; glow?: boolean; grow?: boolean; y?: number; caret?: boolean; b?: number;
  mode?: "plain" | "pop"; dim?: string; align?: "center" | "left"; x?: number; lines?: { text: string; t: number; font?: Font; color?: string; size?: number }[]; lineGap?: number }> = ({
  t, a, text = "", per, size = 120, font, color = TXT, glow, grow = true, y = H / 2, caret, b = 999, mode = "plain", dim, align = "center", x = W * 0.08, lines, lineGap = 1.02,
}) => {
  if (t < a || t >= b) return null;
  const pr = per ?? TON_SLOVO[tonNow()].per;
  const fnt: Font = font ?? (mode === "plain" ? "gBold" : "black");
  const row = (txt: string, ta0: number, f: Font, col: string, sz: number, key?: number) => {
    const chars = [...txt];
    const shown = t < ta0 ? 0 : Math.min(chars.length, Math.floor((t - ta0) / pr) + 1);
    return (
      <div key={key} style={{ whiteSpace: "nowrap", lineHeight: lineGap, height: sz * lineGap }}>
        {chars.map((ch, i) => {
          const ta = ta0 + i * pr;
          if (i >= shown) return grow ? null : <span key={i} style={{ ...FONT[f], fontSize: sz, opacity: 0, whiteSpace: "pre" }}>{ch}</span>;
          if (mode === "plain") {
            const fr = Math.floor((t - ta) / FR);
            const op = fr <= 0 ? 0.35 : fr === 1 ? 0.7 : 1;
            const c = dim && fr < 2 ? dim : col;
            return <span key={i} style={{ ...FONT[f], fontSize: sz, color: c, whiteSpace: "pre", opacity: op, textShadow: glow ? glowOf(col, 12) : undefined }}>{ch}</span>;
          }
          const u = k(t, ta, 0.1, outCubic);
          return (
            <span key={i} style={{ ...FONT[f], fontSize: sz, color: col, display: "inline-block", whiteSpace: "pre", opacity: u, filter: `blur(${lerp(6, 0, u)}px)`, transform: `scale(${lerp(1.25, 1, u)})`, textShadow: glow ? glowOf(col, 12) : undefined }}>
              {ch}
            </span>
          );
        })}
        {caret && key === undefined && <span style={{ display: "inline-block", width: sz * 0.06, height: sz * 0.8, marginLeft: sz * 0.05, background: col, opacity: Math.floor(t * 2.2) % 2 ? 0.2 : 1, verticalAlign: "middle" }} />}
      </div>
    );
  };
  const box: React.CSSProperties = align === "left" ? { left: x, textAlign: "left" } : { left: 0, width: W, textAlign: "center" };
  return (
    <div style={{ position: "absolute", top: y, transform: "translateY(-50%)", ...box }}>
      {lines ? lines.map((l, i) => row(l.text, l.t, l.font ?? fnt, l.color ?? color, l.size ?? size, i)) : row(text, a, fnt, color, size)}
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
/**
 * 14. Зум по интерфейсу к точке (fx, fy). Свод 27.11, P2 #15 (03, 11): z 1,25–1,5 за d 0,17–0,33, easeInOut, без затемнения и пятна,
 * смаз ≈10 px в середине движения (smear); d 0 — скачок за 1 кадр (11). Старый вид — r > 0: вокруг пятна r размыто 8 px и притушено
 * до dim (0,3). b — отъезд назад.
 */
export const ZoomUI: React.FC<{ t: number; a: number; fx: number; fy: number; z?: number; d?: number; r?: number; b?: number; dim?: number; smear?: number; children: React.ReactNode }> = ({
  t, a, fx, fy, z = 1.25, d = 0.17, r = 0, b = 999, dim, smear = 10, children,
}) => {
  const step = (x: number) => (d <= 0 ? (t >= x ? 1 : 0) : k(t, x, d, inOutCubic));
  const u = step(a) * (1 - step(b));
  const moving = d > 0 && ((t > a && t < a + d) || (t > b && t < b + d));
  const ph = moving ? Math.sin(Math.PI * Math.min(1, ((t > b ? t - b : t - a) / d))) : 0;
  const tr: React.CSSProperties = { transformOrigin: `${fx}px ${fy}px`, transform: `scale(${lerp(1, z, u)})` };
  const dm = dim ?? (r > 0 ? 0.3 : 1);
  if (r <= 0) return <AbsoluteFill style={{ ...tr, filter: ph * smear > 0.3 ? `blur(${ph * smear}px)` : undefined }}>{children}</AbsoluteFill>;
  const mask = `radial-gradient(circle ${r}px at ${fx}px ${fy}px, #000 72%, transparent 100%)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ ...tr, filter: u > 0 ? `blur(${8 * u}px) brightness(${lerp(1, dm, u)})` : undefined }}>{children}</AbsoluteFill>
      {u > 0 && <AbsoluteFill style={{ ...tr, WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>}
    </AbsoluteFill>
  );
};

// ── 15. Камера дышит ─────────────────────────────────────────────────────────
/**
 * 15. Масштаб плана. Свод 27.11, P1 #4 и P2 #10:
 *  rate — медленный наезд в секунду от a, по умолчанию 0: на спикере дрейфа нет у 7 эталонов из 13 (1–3 %/с — только Б-ролл и финал).
 *  cuts — джамп-каты на смене фразы, без анимации. Отметка числом — старое переключение 1 ↔ tight; [t, крупность] — уровень:
 *    динамичный 1 / 1,15 / 1,3 (01: 100/118/130), средний 1 / 1,15, спокойный 1 / 1,08 (TON_SLOVO.krupnosti, jumpCuts).
 *  Потолок крупности аватара HeyGen (проверка кадрами 27.11, 74-той f1 / s1): общий фронт — 1,15 держать сколько угодно, 1,3 — коротко
 *    (до 2 с, кожа и борода мягчеют); близкий бок — не выше 1,15. tight по умолчанию 1,15.
 *  cutBlur — смаз px на 2 кадра при скачке (11, урок 15), по умолчанию 0.
 *  hits — панч на ударном слове. Число — старое: +jump за 2 кадра и держится. Объект {t, jump 0,12, in 1 кадр, blur 15 на blurFr 5 кадров,
 *    out: hold (держится hold 0,4 с, сброс скачком — 12) | decay (возврат за decay 2,3 с — 13)}.
 */
export type Hit = number | { t: number; jump?: number; in?: number; blur?: number; blurFr?: number; out?: "hold" | "decay" | "keep"; hold?: number; decay?: number };
export type Cut = number | [t: number, scale: number];
type BreatheOpts = { rate?: number; hits?: Hit[]; jump?: number; cuts?: Cut[]; tight?: number; cutBlur?: number };
const hitObj = (h: Hit, jump: number) => (typeof h === "number" ? { t: h, jump, in: 2, blur: 0, blurFr: 0, out: "keep" as const, hold: 0, decay: 0 } : { jump: 0.12, in: 1, blur: 15, blurFr: 5, out: "hold" as const, hold: 0.4, decay: 2.3, ...h });
export function breathe(t: number, a: number, o: BreatheOpts = {}): number {
  const { rate = 0, hits = [], jump = 0.11, cuts = [], tight = 1.15 } = o;
  const drift = 1 + rate * Math.max(0, t - a);
  const hit = hits.reduce<number>((s, h0) => {
    const h = hitObj(h0, jump);
    if (t < h.t) return s;
    let v = h.jump * k(t, h.t, h.in * FR, outCubic);
    if (h.out === "hold" && t >= h.t + h.hold) v = 0;
    if (h.out === "decay") v *= 1 - k(t, h.t + h.in * FR, h.decay, outCubic);
    return s * (1 + v);
  }, 1);
  let level = 1;
  [...cuts].sort((x, y) => (typeof x === "number" ? x : x[0]) - (typeof y === "number" ? y : y[0])).forEach((c) => {
    const ct = typeof c === "number" ? c : c[0];
    if (t >= ct) level = typeof c === "number" ? (level === 1 ? tight : 1) : c[1];
  });
  return drift * hit * level;
}
/** смаз плана в px: скачок крупности (cutBlur на 2 кадра) и панч-объекты (blur на blurFr кадров) */
export function breatheBlur(t: number, o: BreatheOpts = {}): number {
  let b = 0;
  (o.cuts ?? []).forEach((c) => {
    const ct = typeof c === "number" ? c : c[0];
    if (o.cutBlur && t >= ct && t < ct + 2 * FR) b = Math.max(b, o.cutBlur);
  });
  (o.hits ?? []).forEach((h0) => {
    const h = hitObj(h0, o.jump ?? 0.11);
    if (h.blur && t >= h.t && t < h.t + h.blurFr * FR) b = Math.max(b, h.blur);
  });
  return b;
}
/** джамп-каты по уровням крупности: times — стыки фраз (шаг 1,5–5 с); levels — по тону (TON_SLOVO[ton].krupnosti).
 *  База чередуется с крупными, верхний уровень реже: 1,15 → 1 → 1,15 → 1 → 1,3 → 1 … */
export function jumpCuts(times: number[], levels: number[] = TON_SLOVO[tonNow()].krupnosti): [number, number][] {
  const up = levels.slice(1);
  let n = 0;
  return times.map((tm, i) => {
    if (i % 2 === 1 || !up.length) return [tm, levels[0]];
    const lv = up.length > 1 && n % 3 === 2 ? up[up.length - 1] : up[0];
    n++;
    return [tm, lv];
  });
}
export const Breathe: React.FC<{ t: number; a: number; rate?: number; hits?: Hit[]; cuts?: Cut[]; jump?: number; tight?: number; cutBlur?: number; origin?: string; children: React.ReactNode }> = ({ t, a, origin = "50% 42%", children, ...o }) => {
  const bl = breatheBlur(t, o);
  return <AbsoluteFill style={{ transform: `scale(${breathe(t, a, o)})`, transformOrigin: origin, filter: bl ? `blur(${bl}px)` : undefined }}>{children}</AbsoluteFill>;
};

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

// ── 17. Буквы в случайном порядке (ручной отбор 27.11: оба YouTube-урока «premium talking head», эталоны Бобби) ──
/**
 * 17. Ключевое слово собирается из букв в случайном порядке за d (≈0,3 с): буква вспыхивает 2 кадра цветом flash (белый или акцент)
 * со смазом 4 px, потом встаёт в свой цвет. out — так же рассыпается за 0,22 с (для подмены фразы на том же месте: следующая
 * ScrambleIn с a = out + 0,05). Без тряски, RGB-сдвигов и неона — это не «глитч», а чистое проявление.
 * align: center | left (левый край — x); y — середина строки.
 */
export const ScrambleIn: React.FC<{ t: number; a: number; text: string; d?: number; out?: number; size?: number; font?: Font; color?: string; flash?: string;
  x?: number; y?: number; align?: "center" | "left"; seed?: number; maxW?: number }> = ({
  t, a, text, d = 0.3, out = 999, size, font = "black", color = C.white, flash = "#FFFFFF", x = 80, y = H * 0.6, align = "center", seed = 1, maxW = W * 0.86,
}) => {
  if (t < a || t >= out + 0.22) return null;
  const st = FONT[font];
  const shown = st.textTransform === "uppercase" ? text.toUpperCase() : text;
  const sz = size ?? fit(shown, (st.fontFamily as string) ?? F.head, maxW, 260);
  const chars = [...shown];
  const lit = chars.map((_, i) => rand(i * 13 + seed * 7));
  return (
    <div style={{ position: "absolute", top: y, transform: "translateY(-50%)", whiteSpace: "nowrap",
      ...(align === "center" ? { left: 0, width: W, textAlign: "center" as const } : { left: x }) }}>
      {chars.map((ch, i) => {
        const s = a + lit[i] * d * 0.8; // последняя буква встаёт к a + d
        const e = out + lit[(i * 7 + 3) % chars.length] * 0.18; // уход тоже вразнобой
        const vis = t >= s && t < e;
        const hot = vis && t - s < 2 * FR;
        return (
          <span key={i} style={{ ...st, fontSize: sz, lineHeight: 1, display: "inline-block", whiteSpace: "pre",
            opacity: vis ? 1 : 0, color: hot ? flash : color, filter: hot ? "blur(4px)" : "none" }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};
