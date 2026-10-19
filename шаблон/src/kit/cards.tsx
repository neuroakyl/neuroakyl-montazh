// Детали «карточки и календарь»: сетка карточек с выбором нескольких, календарь из хаоса, значок календаря.
import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, F, W, clamp, inOut, k, lerp, pop, rand, sharp } from "../lib";
import { At, blurIn, headStyle } from "../ui";

/**
 * Сетка карточек 9:16 (5 в ряд) каскадом; в момент pickAt лишние гаснут, выбранные съезжаются в один ряд.
 * Картинки — public/img/<prefix><n>.jpg (n с 1). Подписи «n. Название» под карточками.
 */
export const CardGrid: React.FC<{ t: number; a: number; names: string[]; title?: string; pick?: number[]; pickAt?: number; prefix?: string }> = ({
  t,
  a,
  names,
  title,
  pick = [],
  pickAt,
  prefix = "f",
}) => {
  const tw = 150;
  const th = 266;
  const gx = 22;
  const gy = 62;
  const x0 = W / 2 - (5 * tw + 4 * gx) / 2;
  const y0 = 450;
  const u = pickAt === undefined ? 0 : k(t, pickAt, 0.55, inOut);
  const pw = Math.min(172, (W - 160) / Math.max(1, pick.length) - 18);
  const px0 = W / 2 - (pick.length * pw + (pick.length - 1) * 18) / 2;
  return (
    <>
      {title && (
        <At y={330}>
          <div style={{ ...headStyle(104), ...blurIn(t, a), opacity: 1 - u }}>{title}</div>
        </At>
      )}
      {names.map((name, i) => {
        const ap = a + 0.05 + i * 0.035;
        const s = t < ap ? 0 : lerp(0.7, 1, pop(t, ap, 0.3));
        const pi = pick.indexOf(i);
        let x = x0 + (i % 5) * (tw + gx);
        let y = y0 + Math.floor(i / 5) * (th + gy);
        let w = tw;
        let op = 1;
        if (pickAt !== undefined) {
          if (pi >= 0) {
            x = lerp(x, px0 + pi * (pw + 18), u);
            y = lerp(y, 700, u);
            w = lerp(tw, pw, u);
          } else op = 1 - u;
        }
        const z = 1.04 + 0.04 * Math.sin((t + i) * 0.9);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: w, opacity: op, transform: `scale(${s})` }}>
            <div style={{ width: w, height: w * (th / tw), overflow: "hidden", borderRadius: 6, background: "#222" }}>
              <Img src={staticFile(`img/${prefix}${i + 1}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})` }} />
            </div>
            <div style={{ fontFamily: F.ui, fontWeight: 500, fontSize: w * 0.125, color: C.white, marginTop: 6, lineHeight: 1.05, whiteSpace: "nowrap" }}>
              {i + 1}. {name}
            </div>
          </div>
        );
      })}
    </>
  );
};

/** Календарь из хаоса: дни недели в рамке и числа 1–31 разлетаются по кадру и собираются в сетку (от start, ~2 с). */
export const CalendarChaos: React.FC<{ t: number; start?: number; days: string[]; top?: number }> = ({ t, start = 0, days, top = 1000 }) => {
  const colW = 124;
  const rowH = 86;
  const x0 = W / 2 - colW * 3;
  const els: { label: string; x: number; y: number; head: boolean }[] = [];
  days.slice(0, 7).forEach((d, i) => els.push({ label: d, x: x0 + i * colW, y: top, head: true }));
  for (let n = 1; n <= 31; n++) els.push({ label: String(n), x: x0 + ((n - 1) % 7) * colW, y: top + 98 + Math.floor((n - 1) / 7) * rowH, head: false });
  const bar = k(t, start + 0.75, 0.3);
  return (
    <>
      <div style={{ position: "absolute", left: x0 - 62, top: top - 38, width: colW * 7, height: 76, border: "2.5px solid rgba(255,255,255,0.9)", borderRadius: 24, opacity: bar, transform: `scaleX(${lerp(0.85, 1, bar)})` }} />
      {els.map((e, i) => {
        const a = start + 0.55 + rand(i + 3) * 1.2;
        const u = interpolate(t, [a, a + 0.75], [0, 1], { ...clamp, easing: sharp });
        if (t < a - 0.35) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: lerp(W * (0.1 + rand(i * 7 + 1) * 0.8), e.x, u),
              top: lerp(top - 120 + rand(i * 11 + 5) * 760, e.y, u),
              transform: `translate(-50%, -50%) rotate(${lerp((rand(i * 13 + 2) - 0.5) * 70, 0, u)}deg)`,
              opacity: interpolate(t, [a - 0.35, a - 0.2], [0, 1], clamp),
              fontFamily: F.ui,
              fontWeight: e.head ? 700 : 500,
              fontSize: e.head ? 34 : 36,
              color: C.white,
            }}
          >
            {e.label}
          </div>
        );
      })}
    </>
  );
};

/** Значок календаря (линейный, белый) — к словам «месяц», «каждый день», «по дням». */
export const CalendarIcon: React.FC<{ size: number; color?: string }> = ({ size, color = "white" }) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <rect x="5" y="9" width="38" height="34" rx="7" fill="none" stroke={color} strokeWidth="4" />
    <line x1="5" y1="19" x2="43" y2="19" stroke={color} strokeWidth="4" />
    <line x1="15" y1="4" x2="15" y2="13" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <line x1="33" y1="4" x2="33" y2="13" stroke={color} strokeWidth="4" strokeLinecap="round" />
    {[0, 1, 2].map((i) => (
      <rect key={i} x={13 + i * 9} y="27" width="5" height="5" rx="1" fill={color} />
    ))}
    {[0, 1].map((i) => (
      <rect key={`b${i}`} x={13 + i * 9} y="34" width="5" height="4" rx="1" fill={color} />
    ))}
  </svg>
);
