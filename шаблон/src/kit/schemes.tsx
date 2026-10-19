// Детали «схемы»: сетка с плашками, центр + плашки вокруг, майндмэп со стрелками, таблица, заполняемая по словам.
import React from "react";
import { interpolate } from "remotion";
import { fit } from "../fonts";
import { C, F, H, W, clamp, inOut, k, lerp, pop } from "../lib";
import { Arc, ArrowDefs, At, Plaque, Write, blurIn, capStyle, headStyle } from "../ui";

/** Сетка cols×rows: рисуется линиями, плашки «по строкам» (сбоку) и «по столбцам» (сверху), группа поворачивается. */
export const GridLabels: React.FC<{
  t: number;
  cols: number;
  rows: number;
  small?: [string, number];
  title?: [string, number];
  rowsLabel?: [string, number];
  colsLabel?: [string, number];
  cy?: number;
}> = ({ t, cols, rows, small, title, rowsLabel, colsLabel, cy = 980 }) => {
  const cell = 96;
  const gw = cols * cell;
  const gh = rows * cell;
  const a0 = small?.[1] ?? title?.[1] ?? 0;
  const aT = rowsLabel?.[1] ?? 999;
  const aF = colsLabel?.[1] ?? 999;
  const rot = interpolate(t, [aT - 0.05, aT + 0.45, aF - 0.05, aF + 0.4], [0, -14, -14, 0], { ...clamp, easing: inOut });
  const zoom = interpolate(t, [a0, Math.min(aF, aT + 2) + 0.6], [1, 1.08], clamp);
  const draw = k(t, a0 - 0.05, 0.4);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `rotate(${rot}deg) scale(${zoom})`, transformOrigin: "50% 52%" }}>
      {small && (
        <At y={cy - gh / 2 - 250}>
          <div style={{ ...capStyle(30, "rgba(255,255,255,0.55)"), fontWeight: 500 }}>
            {small[0].split("").map((ch, i) => (
              <span key={i} style={{ opacity: k(t, small[1] + i * 0.05, 0.08) }}>
                {ch}
              </span>
            ))}
          </div>
        </At>
      )}
      {title && (
        <At y={cy - gh / 2 - 160}>
          <div style={{ ...headStyle(fit(title[0], F.head, 920, 124)), ...(t < title[1] ? { opacity: 0 } : blurIn(t, title[1], 0.2, 1.12)) }}>{title[0]}</div>
        </At>
      )}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: cols + 1 }, (_, i) => {
          const x = W / 2 - gw / 2 + i * cell;
          return <line key={`c${i}`} x1={x} y1={cy - gh / 2} x2={x} y2={cy - gh / 2 + gh * draw} stroke="rgba(255,255,255,0.85)" strokeWidth={2} />;
        })}
        {Array.from({ length: rows + 1 }, (_, i) => {
          const y = cy - gh / 2 + i * cell;
          return <line key={`r${i}`} x1={W / 2 - gw / 2} y1={y} x2={W / 2 - gw / 2 + gw * draw} y2={y} stroke="rgba(255,255,255,0.85)" strokeWidth={2} />;
        })}
      </svg>
      {rowsLabel && (
        <At x={W / 2 - gw / 2 - 44} y={cy}>
          <div style={{ transform: "rotate(-90deg)" }}>
            <Plaque t={t} a={rowsLabel[1]} pad="4px 14px">
              <span style={capStyle(34, C.ink)}>{rowsLabel[0]}</span>
            </Plaque>
          </div>
        </At>
      )}
      {colsLabel && (
        <At y={cy - gh / 2 - 40}>
          <Plaque t={t} a={colsLabel[1]} pad="4px 14px">
            <span style={capStyle(34, C.ink)}>{colsLabel[0]}</span>
          </Plaque>
        </At>
      )}
    </div>
  );
};

/** Центр + плашки вокруг: главная плашка вырастает из линии, вокруг по очереди — шесть тёмных плашек с тонкими связями. */
export const CenterPlaques: React.FC<{ t: number; center: [string, number]; around: string[]; from: number; step?: number }> = ({ t, center, around, from, step = 0.28 }) => {
  const slots = [[-210, -120], [0, -120], [210, -120], [-210, 120], [0, 120], [210, 120]];
  const cy = H / 2;
  return (
    <>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {around.slice(0, 6).map((_, i) => {
          const u = k(t, from + i * step, 0.3);
          const [dx, dy] = slots[i];
          return <line key={i} x1={W / 2} y1={cy} x2={W / 2 + dx * u} y2={cy + dy * u} stroke="rgba(255,255,255,0.12)" strokeWidth={2} />;
        })}
      </svg>
      <At y={cy}>
        <Plaque t={t} a={center[1]} pad="6px 22px">
          <span style={headStyle(54, C.ink)}>{center[0]}</span>
        </Plaque>
      </At>
      {around.slice(0, 6).map((s, i) => (
        <At key={i} x={W / 2 + slots[i][0]} y={cy + slots[i][1]}>
          <Plaque t={t} a={from + i * step} bg={C.plaqueRed} pad="6px 14px">
            <span style={headStyle(38)}>{s}</span>
          </Plaque>
        </At>
      ))}
    </>
  );
};

const SLOTS = [
  { x: 300, y: 790, path: "M470,935 C430,860 380,840 320,815" },
  { x: 800, y: 805, path: "M700,935 C720,890 760,860 790,830" },
  { x: 250, y: 1095, path: "M440,985 C380,1010 300,1030 265,1065" },
  { x: 440, y: 1225, path: "M560,985 C520,1060 470,1140 450,1195" },
  { x: 860, y: 935, path: "M780,960 C820,965 840,955 850,948" },
  { x: 760, y: 1110, path: "M650,985 C700,1030 740,1060 755,1080" },
];

/** Майндмэп: белая плашка в центре, стрелки-дуги рисуются, подписи всплывают на своих словах (до 6). */
export const MindMap: React.FC<{ t: number; center: [string, number]; arrows: number; items: [string, number][] }> = ({ t, center, arrows, items }) => {
  const last = items.length ? items[items.length - 1][1] : center[1];
  const zoom = interpolate(t, [center[1], last + 1], [1, 1.06], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})` }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs />
        {SLOTS.slice(0, Math.max(items.length, 1)).map((s, i) => (
          <Arc key={i} t={t} a={arrows + i * 0.09} d={0.45} path={s.path} len={320} />
        ))}
      </svg>
      <At y={H / 2}>
        <Plaque t={t} a={center[1]} pad="6px 18px">
          <span style={{ ...capStyle(50, C.red), fontWeight: 800 }}>{center[0]}</span>
        </Plaque>
      </At>
      {items.slice(0, 6).map(([text, a], i) => (
        <At key={i} x={SLOTS[i].x} y={SLOTS[i].y}>
          <div style={{ transform: `scale(${t < a ? 0 : lerp(0.6, 1, pop(t, a, 0.28))})`, opacity: t < a ? 0 : 1 }}>
            <div style={{ background: C.white, padding: "3px 10px" }}>
              <span style={{ ...capStyle(30, C.ink), fontWeight: 600 }}>{text}</span>
            </div>
          </div>
        </At>
      ))}
    </div>
  );
};

/** Таблица: строки и столбцы появляются на словах «по вертикали / по горизонтали», ячейки заполняются по очереди. */
export const TableFill: React.FC<{
  t: number;
  a: number;
  rowsTitle: [string, number];
  colsTitle: [string, number];
  rows: string[];
  cols: string[];
  fill: number;
  cell: (n: number) => string;
  y?: number;
}> = ({ t, a, rowsTitle, colsTitle, rows, cols, fill, cell, y = 560 }) => {
  const c0 = 150;
  const cw = Math.min(136, (W - 320 - c0) / cols.length);
  const hh = 96;
  const rh = 128;
  const tw = c0 + cw * cols.length;
  const th = hh + rh * rows.length;
  const x0 = (W - tw) / 2 + 30;
  const appear = pop(t, a, 0.35);
  const grid = "#CFCFCF";
  const aV = rowsTitle[1];
  const aH = colsTitle[1];
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${lerp(0.8, 1, appear)})`, opacity: Math.min(1, appear * 1.5), transformOrigin: "50% 45%" }}>
      <At x={x0 + tw / 2} y={y - 50}>
        <div style={{ ...headStyle(58), opacity: 0.35 + 0.65 * k(t, aH, 0.2), transform: `scale(${1 + 0.12 * Math.sin(Math.PI * k(t, aH, 0.4))})` }}>{colsTitle[0]}</div>
      </At>
      <At x={x0 - 52} y={y + th / 2}>
        <div style={{ ...headStyle(58), transform: `rotate(-90deg) scale(${1 + 0.12 * Math.sin(Math.PI * k(t, aV, 0.4))})`, opacity: 0.35 + 0.65 * k(t, aV, 0.2) }}>{rowsTitle[0]}</div>
      </At>
      <div style={{ position: "absolute", left: x0, top: y, width: tw, height: th, background: C.white }}>
        <svg width={tw} height={th} style={{ position: "absolute", inset: 0 }}>
          {cols.map((_, i) => (
            <line key={`v${i}`} x1={c0 + i * cw} y1={0} x2={c0 + i * cw} y2={th} stroke={grid} strokeWidth={2} />
          ))}
          {rows.map((_, i) => (
            <line key={`h${i}`} x1={0} y1={hh + i * rh} x2={tw} y2={hh + i * rh} stroke={grid} strokeWidth={2} />
          ))}
        </svg>
        {cols.map((c, i) => {
          const ap = aH + 0.1 + i * 0.1;
          return (
            <div key={c} style={{ position: "absolute", left: c0 + i * cw, top: 0, width: cw, height: hh, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: F.ui, fontWeight: 600, fontSize: 19, color: C.ink, lineHeight: 1.1, opacity: k(t, ap, 0.15), transform: `translateY(${lerp(10, 0, k(t, ap, 0.2))}px)` }}>
              {c}
            </div>
          );
        })}
        {rows.map((c, i) => {
          const ap = aV + 0.1 + i * 0.1;
          return (
            <div key={c} style={{ position: "absolute", left: 0, top: hh + i * rh, width: c0, height: rh, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: F.ui, fontWeight: 600, fontSize: 22, color: C.ink, opacity: k(t, ap, 0.15), transform: `translateX(${lerp(-10, 0, k(t, ap, 0.2))}px)` }}>
              {c}
            </div>
          );
        })}
        {Array.from({ length: rows.length * cols.length }, (_, i) => {
          const r = Math.floor(i / cols.length);
          const c = i % cols.length;
          const ap = fill + i * 0.065;
          return (
            <div key={i} style={{ position: "absolute", left: c0 + c * cw + 14, top: hh + r * rh + 22, width: cw - 28, opacity: k(t, ap, 0.18), transform: `scale(${lerp(0.6, 1, pop(t, ap, 0.25))})` }}>
              <div style={{ fontFamily: F.ui, fontWeight: 800, fontSize: 20, color: C.red }}>{cell(i + 1)}</div>
              {[0.92, 0.7, 0.82].map((wd, j) => (
                <div key={j} style={{ height: 6, width: `${wd * 100}%`, background: "#2a2a2a", opacity: 0.55, borderRadius: 3, marginTop: 9 }} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { Write };
