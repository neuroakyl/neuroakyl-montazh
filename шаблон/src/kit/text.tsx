// Детали «текст»: строки заголовка по словам, шаг-заставка, стопка строк, большое слово со смазом.
// Все времена — секунды (обычно at("слово")). Каталог «когда брать» — приёмы.md, раздел «Детали шаблона».
import React from "react";
import { fit } from "../fonts";
import { C, F, H, W, k, lerp, sharp, inOut } from "../lib";
import { At, Ghost, Swap, Write, blurIn, headStyle, scriptStyle } from "../ui";

export type Row = { kind: "head"; words: [text: string, t: number][] } | { kind: "script"; text: string; t: number };

/** Заголовок из строк: капс по словам (первое слово влетает слева) и строки-каллиграфия, которые «пишутся». */
export const TitleRows: React.FC<{ t: number; rows: Row[]; y?: number; width?: number; color?: string }> = ({ t, rows, y = 470, width = 900, color = C.white }) => {
  let yy = y;
  return (
    <>
      {rows.map((r, ri) => {
        const ry = yy;
        yy += r.kind === "head" ? 132 : 128;
        if (r.kind === "script")
          return (
            <At key={ri} y={ry} x={W / 2 - 40}>
              <Write t={t} a={r.t - 0.05} d={0.95}>
                <div style={{ ...scriptStyle(84, color), transform: "rotate(-4deg)" }}>{r.text}</div>
              </Write>
            </At>
          );
        const size = fit(r.words.map((x) => x[0]).join(" "), F.head, width, 150);
        return (
          <At key={ri} y={ry}>
            <div style={{ display: "flex", gap: size * 0.22 }}>
              {r.words.map(([wd, ta], i) => {
                const u = k(t, ta, 0.22);
                const st = ri === 0 && i === 0 ? { opacity: u, transform: `translateX(${lerp(-260, 0, u)}px)`, filter: `blur(${lerp(10, 0, u)}px)` } : blurIn(t, ta);
                return (
                  <span key={i} style={{ ...headStyle(size, color), ...(t < ta ? { opacity: 0 } : st) }}>
                    {wd}
                  </span>
                );
              })}
            </div>
          </At>
        );
      })}
    </>
  );
};

/** Шаг-заставка: «призрачный» номер тёмным по фону → крупные фразы по одной → короткая черта-переход. */
export const StepSlate: React.FC<{ t: number; ghost: [string, number]; items: [string, number][]; dash?: number; size?: number }> = ({ t, ghost, items, dash, size = 112 }) => (
  <>
    {t < items[0][1] && <Ghost t={t} a={ghost[1]} text={ghost[0]} />}
    <Swap t={t} until={dash ?? 99} items={items.map(([s, a]) => [a, <div style={headStyle(size)}>{s}</div>])} />
    {dash !== undefined && t >= dash && (
      <At y={H / 2}>
        <div style={{ width: 76, height: 7, background: C.white, transform: `scaleX(${k(t, dash, 0.15)})` }} />
      </At>
    )}
  </>
);

/** Стопка строк: каждая новая заходит блюр-зумом и поднимает стопку, чтобы она оставалась по центру. */
export const StackLines: React.FC<{ t: number; lines: { kind: "head" | "script"; text: string; t: number }[]; y?: number; size?: number }> = ({ t, lines, y = 880, size = 108 }) => {
  const lift = lines.slice(2).reduce((s, l) => s - 50 * k(t, l.t, 0.35, inOut), 0);
  let yy = y;
  return (
    <>
      {lines.map((l, i) => {
        const ly = yy;
        yy += l.kind === "head" ? size * 0.97 : 90;
        if (t < l.t) return null;
        if (l.kind === "script")
          return (
            <At key={i} y={ly + lift}>
              <Write t={t} a={l.t} d={0.95}>
                <div style={scriptStyle(size * 0.65)}>{l.text}</div>
              </Write>
            </At>
          );
        return (
          <At key={i} y={ly + lift}>
            <div style={blurIn(t, l.t, 0.16, 1.1)}>
              <div style={headStyle(size)}>{l.text}</div>
            </div>
          </At>
        );
      })}
    </>
  );
};

/** Большое слово со «смазом»: сильный блюр и растяжение по горизонтали → резко в фокус. Для CTA и главного слова. */
export const BigSmear: React.FC<{ t: number; a: number; text: string; until?: number; y?: number; size?: number }> = ({ t, a, text, until = 999, y = 1030, size = 190 }) => {
  if (t < a || t >= until) return null;
  const u = k(t, a, 0.22, sharp);
  return (
    <At y={y}>
      <div style={{ ...headStyle(size), opacity: Math.min(1, u * 2), filter: `blur(${lerp(26, 0, u)}px)`, transform: `scale(${lerp(1.5, 1, u)}, ${lerp(0.7, 1, u)})` }}>{text}</div>
    </At>
  );
};
