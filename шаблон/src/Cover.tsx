import React from "react";
import { AbsoluteFill, getRemotionEnvironment, Img, staticFile, useVideoConfig } from "remotion";
import BRAND from "./cover/brand.json";
import DATA from "./cover.json";
import { fit, useFonts } from "./fonts";
import { F } from "./lib";

// Обложка ролика. Стиль аккаунта (цвета, шрифт) — src/cover/brand.json, его кладёт инструменты/oblozhka.py
// из обложка-бренд.json навыка: одинаков во всей ленте. Содержание — src/cover.json: раскладка, текст, картинки.
// Правила и порядок — SKILL.md §«Обложка». Вертикаль 1080×1920 (вшивается первым кадром), горизонталь 1280×720 (YouTube).

type Item = string | { src: string; x?: number; y?: number; size?: number; rot?: number };
export type CoverData = {
  заполнить?: boolean;
  layout: "face" | "hero" | "number" | "versus" | "photo";
  text: string; // строки через |, акцент в *звёздочках*: "FACE ID|*КАНТИП?*"
  number?: string; // layout number: огромная цифра над текстом
  person?: string; // вырезанный человек (PNG без фона) — layout face
  personZoom?: number; // крупность лица: 1 — по умолчанию, 1.2 — крупнее, 0.85 — мельче
  personFace?: number[]; personSize?: number[]; // рамка лица [x,y,w,h] в долях и размер PNG — ставит oblozhka.py sdelat сам
  hero?: string; // вырезанный главный предмет — hero, number, photo
  heroZoom?: number; // крупность предмета: 1 — по умолчанию, 1.3 — крупнее (вылетает за края)
  bg?: string; // фото фона: резкое, по теме
  left?: string; right?: string; leftLabel?: string; rightLabel?: string; // layout versus
  items?: Item[]; // 0–2 крупных элемента рядом с главным: эмодзи, вырезанные предметы
};
type Brand = { accent: string; dark: string; light: string; font: string; accentStyle: string; outline?: number };

const FONTS: Record<string, { family: string; weight: number }> = {
  montserrat: { family: F.ui, weight: 900 },
  fira: { family: F.head, weight: 400 },
  oswald: { family: F.narrow, weight: 700 },
};

// контраст по WCAG: текст должен читаться в маленьком превью ленты
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, "0");
const src = (p: string) => (/^https?:/.test(p) ? p : staticFile(p));

function checkBrand(b: Brand) {
  const bad: string[] = [];
  if (contrast(b.light, b.dark) < 7) bad.push(`светлый ${b.light} и тёмный ${b.dark} — контраст ниже 7`);
  if (contrast(b.accent, b.dark) < 4.5) bad.push(`акцент ${b.accent} на тёмном — контраст ниже 4,5`);
  if (!FONTS[b.font]) bad.push(`шрифт ${b.font}: есть ${Object.keys(FONTS).join(", ")}`);
  if (bad.length) throw new Error("обложка-бренд.json: " + bad.join("; "));
}

type Seg = { s: string; accent: boolean };
const parse = (line: string): Seg[] =>
  line.split("*").map((s, i) => ({ s: s.trim(), accent: i % 2 === 1 })).filter((x) => x.s);

// Геометрия: всё важное внутри зоны, которую не режут сетка профиля (3:4) и интерфейс YouTube
function geo(w: number, h: number, layout: CoverData["layout"]) {
  const wide = w > h;
  if (!wide) {
    const text = layout === "number" ? { x: 64, y: 560, w: 952, h: 300 } : { x: 64, y: 260, w: 952, h: 480 };
    return {
      wide, text, max: layout === "number" ? 150 : 230, min: 90,
      number: { x: 64, y: 250, w: 952, h: 320 },
      person: { cx: 540, bottom: h, h: 1190, faceY: 1100, faceH: 400 },
      // широкий предмет крупнее кадра по ширине: края (лопасти, крылья) пусть вылетают — главное крупно
      hero: layout === "number" ? { cx: 540, cy: 1270, w: 1100, h: 640 } : { cx: 540, cy: 1210, w: 1240, h: 860 },
      glow: { x: 540, y: layout === "face" ? 980 : 1200, r: 520 },
      slots: layout === "face" ? [{ x: 175, y: 1000, size: 270, rot: -14 }, { x: 905, y: 1130, size: 270, rot: 12 }]
        : [{ x: 880, y: 850, size: 250, rot: 12 }, { x: 200, y: 1530, size: 250, rot: -12 }],
      // «кто сильнее» в вертикали — одно над другим: так оба крупные
      halves: [{ x: 40, y: 770, w: 1000, h: 400 }, { x: 40, y: 1250, w: 1000, h: 400 }],
      vs: { x: 540, y: 1210, d: 170 }, labelSize: 70,
      scrim: "linear-gradient(180deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0) 48%)",
    };
  }
  // горизонталь: текст слева, главный справа; правый нижний угол свободен (там длительность)
  const text = layout === "number" ? { x: 56, y: 300, w: 640, h: 300 } : { x: 56, y: 70, w: 660, h: 580 };
  return {
    wide, text, max: layout === "number" ? 96 : 150, min: 64,
    number: { x: 56, y: 60, w: 640, h: 240 },
    person: { cx: 960, bottom: h, h: 690, faceY: 330, faceH: 290 },
    hero: { cx: 985, cy: 350, w: 540, h: 540 },
    glow: { x: 980, y: 360, r: 380 },
    slots: [{ x: 760, y: 170, size: 170, rot: -12 }, { x: 1180, y: 250, size: 160, rot: 12 }],
    halves: [{ x: 700, y: 60, w: 270, h: 560 }, { x: 990, y: 60, w: 270, h: 560 }],
    vs: { x: 980, y: 340, d: 120 }, labelSize: 44,
    scrim: "linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 65%)",
  };
}

// Текст: каждая строка подгоняется под ширину, весь блок — под высоту. Мельче минимума — ошибка: текст длинный.
const TextBlock: React.FC<{ lines: Seg[][]; box: { x: number; y: number; w: number; h: number }; max: number; min: number; b: Brand; align: "center" | "left"; onPhoto: boolean }> = ({ lines, box, max, min, b, align, onPhoto }) => {
  const f = FONTS[b.font];
  const plate = b.accentStyle === "plate";
  const pad = (s: number) => (plate ? Math.round(s * 0.16) : 0);
  const caps = (s: string) => s.toUpperCase();
  let sizes = lines.map((segs) => {
    const str = segs.map((x) => caps(x.s)).join(" ");
    const hasPlate = plate && segs.some((x) => x.accent);
    return fit(str, f.family, box.w - (hasPlate ? 0.34 * max : 0), max, f.weight);
  });
  // строки одного блока не должны отличаться больше чем в 1,7 раза — иначе короткое слово становится плакатом
  const smallest = Math.min(...sizes);
  sizes = sizes.map((s) => Math.min(s, smallest * 1.7));
  const LH = 1.02;
  const total = sizes.reduce((a, s) => a + s * LH + (plate ? pad(s) : 0), 0);
  const k = Math.min(1, box.h / total);
  sizes = sizes.map((s) => s * k);
  if (Math.min(...sizes) < min)
    throw new Error(`текст обложки не помещается крупно (${Math.round(Math.min(...sizes))} px < ${min}): сократи до 2–4 слов`);
  const shadow = onPhoto ? "0 6px 28px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.7)" : "0 4px 18px rgba(0,0,0,0.5)";
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: align === "center" ? "center" : "flex-start" }}>
      {lines.map((segs, i) => (
        <div key={i} style={{ fontFamily: f.family, fontWeight: f.weight, fontSize: sizes[i], lineHeight: LH, letterSpacing: "-0.01em", whiteSpace: "nowrap", marginBottom: plate ? pad(sizes[i]) : 0 }}>
          {segs.map((x, j) => {
            const t = caps(x.s) + (j < segs.length - 1 ? " " : "");
            if (!x.accent) return <span key={j} style={{ color: b.light, textShadow: shadow }}>{t}</span>;
            if (!plate) return <span key={j} style={{ color: b.accent, textShadow: shadow }}>{t}</span>;
            return (
              <span key={j} style={{ background: b.accent, color: b.dark, margin: `0 ${j < segs.length - 1 ? "0.22em" : 0} 0 ${j > 0 ? "0.22em" : 0}`, padding: `${pad(sizes[i]) * 0.35}px ${pad(sizes[i])}px`, borderRadius: sizes[i] * 0.1, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }}>
                {caps(x.s)}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Картинка, вписанная в рамку по центру (cx, cy)
const Fitted: React.FC<{ p: string; cx: number; cy: number; w: number; h: number; b: Brand; style?: React.CSSProperties }> = ({ p, cx, cy, w, h, b, style }) => (
  <Img src={src(p)} style={{ position: "absolute", left: cx - w / 2, top: cy - h / 2, width: w, height: h, objectFit: "contain", filter: cutFilter(b), ...style }} />
);
const cutFilter = (b: Brand) =>
  [b.outline ? `drop-shadow(0 0 ${b.outline}px ${b.light}) drop-shadow(0 0 ${b.outline / 2}px ${b.light})` : "", "drop-shadow(0 24px 48px rgba(0,0,0,0.65))"].join(" ");

// Человек: лицо ставится в одну и ту же точку и размер кадра (рамка лица из oblozhka.py), снизу — до края кадра
const Person: React.FC<{ d: CoverData; g: { cx: number; bottom: number; h: number; faceY: number; faceH: number }; h: number; b: Brand }> = ({ d, g, h, b }) => {
  const z = d.personZoom ?? 1;
  if (!d.personFace || !d.personSize)
    return <Img src={src(d.person!)} style={{ position: "absolute", height: g.h * z, left: g.cx, bottom: h - g.bottom, transform: "translateX(-50%)", filter: cutFilter(b) }} />;
  const [fx, fy, fw, fh] = d.personFace;
  const ih = (g.faceH * z) / fh;
  const iw = ih * (d.personSize[0] / d.personSize[1]);
  let top = g.faceY - (fy + fh / 2) * ih;
  if (top + ih < h) top = h - ih; // вырезка короче кадра — ставим на нижний край
  return <Img src={src(d.person!)} style={{ position: "absolute", width: iw, height: ih, left: g.cx - (fx + fw / 2) * iw, top, filter: cutFilter(b) }} />;
};

export const Cover: React.FC<Partial<CoverData>> = (props) => {
  const ready = useFonts();
  const { width: w, height: h } = useVideoConfig();
  if (!ready) return null;
  const d = { ...(DATA as CoverData), ...props } as CoverData;
  const b = BRAND as Brand;
  checkBrand(b);
  if (d.заполнить) {
    if (getRemotionEnvironment().isRendering) throw new Error("обложка не заполнена: src/cover.json (SKILL.md §«Обложка»)");
  }
  const lines = d.text.split("|").map(parse).filter((l) => l.length);
  const nWords = lines.flat().reduce((a, x) => a + x.s.split(/\s+/).length, 0);
  if (lines.length > 3 || nWords > 6) throw new Error(`текст обложки: ${lines.length} строк, ${nWords} слов — нужно до 3 строк и до 6 слов (лучше 2–4)`);
  const g = geo(w, h, d.layout);
  const items = (d.items ?? []).slice(0, 2).map((it, i) => ({ ...g.slots[i], ...(typeof it === "string" ? { src: it } : it) }));
  const photoBg = !!d.bg;
  const bgFilter = d.layout === "photo" ? "brightness(0.95) contrast(1.06) saturate(1.1)" : "brightness(0.5) contrast(1.05) saturate(0.95)";

  return (
    <AbsoluteFill style={{ background: b.dark, overflow: "hidden" }}>
      {d.bg ? <Img src={src(d.bg)} style={{ position: "absolute", width: w, height: h, objectFit: "cover", filter: bgFilter }} /> : null}
      {/* свечение акцента за главным: отделяет вырезанное от фона */}
      {d.layout !== "photo" ? (
        <AbsoluteFill style={{ background: `radial-gradient(circle ${g.glow.r}px at ${g.glow.x}px ${g.glow.y}px, ${alpha(b.accent, photoBg ? 0.38 : 0.45)} 0%, ${alpha(b.accent, 0.12)} 45%, ${alpha(b.accent, 0)} 75%)` }} />
      ) : null}
      {/* затемнение только под текстом */}
      {photoBg ? <AbsoluteFill style={{ background: g.scrim }} /> : null}
      {!photoBg ? <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)` }} /> : null}

      {d.layout === "face" && d.person ? <Person d={d} g={g.person} h={h} b={b} /> : null}
      {(d.layout === "hero" || d.layout === "number" || d.layout === "photo") && d.hero ? <Fitted p={d.hero} cx={g.hero.cx} cy={g.hero.cy} w={g.hero.w * (d.heroZoom ?? 1)} h={g.hero.h * (d.heroZoom ?? 1)} b={b} /> : null}
      {d.layout === "versus" ? (
        <>
          {[d.left, d.right].map((p, i) => (p ? <Fitted key={i} p={p} cx={g.halves[i].x + g.halves[i].w / 2} cy={g.halves[i].y + g.halves[i].h / 2} w={g.halves[i].w} h={g.halves[i].h} b={b} /> : null))}
          <div style={{ position: "absolute", left: g.vs.x - g.vs.d / 2, top: g.vs.y - g.vs.d / 2, width: g.vs.d, height: g.vs.d, borderRadius: "50%", background: b.accent, color: b.dark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS[b.font].family, fontWeight: FONTS[b.font].weight, fontSize: g.vs.d * 0.42, boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>VS</div>
          {[d.leftLabel, d.rightLabel].map((l, i) =>
            l ? <div key={i} style={{ position: "absolute", left: g.halves[i].x, width: g.halves[i].w, top: !g.wide && i === 0 ? g.halves[0].y - g.labelSize * 0.3 : g.halves[i].y + g.halves[i].h - g.labelSize * 0.9, textAlign: "center", fontFamily: FONTS[b.font].family, fontWeight: FONTS[b.font].weight, fontSize: g.labelSize, color: b.light, textTransform: "uppercase", textShadow: "0 4px 18px rgba(0,0,0,0.8)", whiteSpace: "nowrap" }}>{l}</div> : null,
          )}
        </>
      ) : null}

      {items.map((it, i) => (
        <Img key={i} src={src(it.src)} style={{ position: "absolute", left: it.x - it.size / 2, top: it.y - it.size / 2, width: it.size, height: it.size, objectFit: "contain", transform: `rotate(${it.rot}deg)`, filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.55))" }} />
      ))}

      {d.layout === "number" && d.number ? (
        <div style={{ position: "absolute", left: g.number.x, top: g.number.y, width: g.number.w, height: g.number.h, display: "flex", alignItems: "center", justifyContent: g.wide ? "flex-start" : "center" }}>
          <div style={{ fontFamily: FONTS[b.font].family, fontWeight: FONTS[b.font].weight, color: b.accent, whiteSpace: "nowrap", lineHeight: 1, letterSpacing: "-0.02em", textShadow: "0 8px 30px rgba(0,0,0,0.6)", fontSize: Math.min(g.number.h * 1.05, fit(d.number, FONTS[b.font].family, g.number.w, 460, FONTS[b.font].weight)) }}>
            {d.number}
          </div>
        </div>
      ) : null}
      <TextBlock lines={lines} box={g.text} max={g.max} min={g.min} b={b} align={g.wide ? "left" : "center"} onPhoto={photoBg} />
    </AbsoluteFill>
  );
};
