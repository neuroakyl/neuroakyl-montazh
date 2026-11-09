import React from "react";
import { H, W, back, inOut, k, lerp, rand, sharp } from "../../lib";
import { B, P, font } from "./recept";

/**
 * Банк появления заголовков и крупных слов: 14 видов. Цвет и шрифт — из бренда (постоянные), вид — из рецепта (меняется).
 *   <Title t={t} a={at("слово")} text="ГЛАВНОЕ *СЛОВО*" y={300} />   — *звёздочки* = слово цветом бренда
 *   kind — свой вид для сцены; не указан — P.tekst из рецепта. out — когда уйти.
 */
export const TEKST = ["blur", "pop", "rise", "type", "letters", "drop", "slide", "box", "underline", "glitch", "flip", "wave", "stamp", "split"] as const;
export type TekstKind = (typeof TEKST)[number];

type Tok = { w: string; acc: boolean };
const parse = (s: string): Tok[] => s.split(/\s+/).filter(Boolean).map((w) => ({ w: w.replace(/\*/g, ""), acc: /^\*.*\*$/.test(w) || /^\*/.test(w) }));

export const Title: React.FC<{
  t: number;
  a: number;
  text: string;
  y?: number;
  size?: number;
  kind?: string;
  out?: number;
  color?: string;
  accent?: string;
  upper?: boolean;
  fontName?: string;
  width?: number;
}> = ({ t, a, text, y = H * 0.18, size = 120, kind, out = 999, color = B.light, accent = B.accent, upper = true, fontName = B.head, width = W - 140 }) => {
  if (t < a - 0.01 || t > out + 0.35) return null;
  const kd = (kind ?? P.tekst) as TekstKind;
  const toks = parse(upper ? text.toUpperCase() : text);
  const s = t - a;
  const o = k(t, out, 0.25, inOut);
  const ff = font(fontName);
  const base: React.CSSProperties = { fontFamily: ff, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.01em", whiteSpace: "nowrap", display: "inline-block" };
  const col = (tk: Tok) => (tk.acc ? accent : color);
  const shadow = "0 8px 30px rgba(0,0,0,0.55)";

  const word = (tk: Tok, i: number): React.ReactNode => {
    const d = i * 0.07;
    const u = k(s, d, 0.28, sharp);
    const st: React.CSSProperties = { ...base, color: col(tk), textShadow: shadow };
    switch (kd) {
      case "blur":
        return <span style={{ ...st, opacity: Math.min(1, u * 1.6), filter: `blur(${lerp(10, 0, u)}px)`, transform: `scale(${lerp(1.08, 1, u)})` }}>{tk.w}</span>;
      case "pop":
        return <span style={{ ...st, transform: `scale(${k(s, d, 0.3, back)})` }}>{tk.w}</span>;
      case "rise":
        return (
          <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: size * 0.08 }}>
            <span style={{ ...st, transform: `translateY(${lerp(110, 0, u)}%)` }}>{tk.w}</span>
          </span>
        );
      case "slide":
        return <span style={{ ...st, opacity: u > 0 ? 1 : 0, transform: `translateX(${lerp(i % 2 ? 260 : -260, 0, u)}px)` }}>{tk.w}</span>;
      case "flip":
        return <span style={{ ...st, transform: `perspective(800px) rotateX(${lerp(-95, 0, k(s, d, 0.35, back))}deg)`, transformOrigin: "50% 100%", opacity: s >= d ? 1 : 0 }}>{tk.w}</span>;
      case "letters":
      case "wave":
        return (
          <span style={{ ...st, textShadow: undefined }}>
            {tk.w.split("").map((ch, j) => {
              const dl = i * 0.12 + j * 0.025;
              const v = k(s, dl, 0.3, back);
              const wave = kd === "wave" ? Math.sin((s - dl) * 7 + j * 0.6) * size * 0.04 * k(s, dl + 0.3, 0.3) : 0;
              return (
                <span key={j} style={{ display: "inline-block", transform: `translateY(${lerp(size * 0.6, 0, v) + wave}px)`, opacity: Math.min(1, v * 2), textShadow: shadow }}>
                  {ch}
                </span>
              );
            })}
          </span>
        );
      default:
        return <span style={st}>{tk.w}</span>;
    }
  };

  let body: React.ReactNode;
  const line = (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.25}px`, width }}>
      {toks.map((tk, i) => (
        <React.Fragment key={i}>{word(tk, i)}</React.Fragment>
      ))}
    </div>
  );
  const plain = toks.map((tk, i) => (
    <span key={i} style={{ color: col(tk) }}>
      {tk.w}
      {i < toks.length - 1 ? " " : ""}
    </span>
  ));
  const block = (st: React.CSSProperties, children: React.ReactNode = plain) => (
    <div style={{ ...base, whiteSpace: "normal", textAlign: "center", width, textShadow: shadow, ...st }}>{children}</div>
  );

  switch (kd) {
    case "type": {
      const full = toks.map((x) => x.w).join(" ");
      const n = Math.floor(Math.max(0, s) / 0.045);
      let left = n;
      const vis = toks.map((tk, i) => {
        const part = tk.w.slice(0, Math.max(0, left));
        left -= tk.w.length + 1;
        return (
          <span key={i} style={{ color: col(tk) }}>
            {part}
            {i < toks.length - 1 && left >= 0 ? " " : ""}
          </span>
        );
      });
      body = block({}, [...vis, n < full.length + 4 && Math.floor(s * 3) % 2 === 0 ? <span key="c" style={{ color: accent }}>|</span> : null]);
      break;
    }
    case "drop": {
      const u = k(s, 0, 0.26, sharp);
      const sh = s > 0.26 && s < 0.5 ? (rand(Math.floor(s * 60)) - 0.5) * 14 * (1 - (s - 0.26) / 0.24) : 0;
      body = block({ transform: `translate(${sh}px, ${sh * 0.6}px) scale(${lerp(2.4, 1, u)})`, opacity: Math.min(1, u * 3) });
      break;
    }
    case "box": {
      const bx = k(s, 0, 0.25, sharp);
      const tx = k(s, 0.15, 0.2, sharp);
      body = (
        <div style={{ position: "relative", display: "inline-block", padding: `${size * 0.12}px ${size * 0.3}px` }}>
          <div style={{ position: "absolute", inset: 0, background: accent, transform: `scaleX(${bx})`, transformOrigin: "0 50%", borderRadius: size * 0.08 }} />
          <div style={{ ...base, position: "relative", whiteSpace: "normal", textAlign: "center", maxWidth: width, color: B.dark, opacity: tx, transform: `translateY(${lerp(20, 0, tx)}px)` }}>{toks.map((x) => x.w).join(" ")}</div>
        </div>
      );
      break;
    }
    case "underline": {
      const u = k(s, 0, 0.3, sharp);
      const ln = k(s, 0.2, 0.35, inOut);
      body = (
        <div style={{ display: "inline-block", textAlign: "center" }}>
          {block({ opacity: u, transform: `translateY(${lerp(30, 0, u)}px)` })}
          <div style={{ height: size * 0.09, background: accent, borderRadius: size, margin: `${size * 0.06}px auto 0`, width: `${ln * 70}%` }} />
        </div>
      );
      break;
    }
    case "glitch": {
      const g = s < 0.3 ? 1 - s / 0.3 : 0;
      const r = rand(Math.floor(s * 50));
      body = block({
        opacity: s >= 0 ? 1 : 0,
        transform: `translateX(${(r - 0.5) * 40 * g}px) skewX(${(r - 0.5) * 20 * g}deg)`,
        textShadow: `${12 * g}px 0 0 rgba(255,0,60,0.85), ${-12 * g}px 0 0 rgba(0,255,255,0.85), ${shadow}`,
        clipPath: g > 0.2 ? `inset(${r * 30}% 0 ${(1 - r) * 20}% 0)` : undefined,
      });
      break;
    }
    case "stamp": {
      const u = k(s, 0, 0.32, back);
      body = (
        <div style={{ display: "inline-block", border: `${size * 0.07}px solid ${accent}`, borderRadius: size * 0.14, padding: `${size * 0.06}px ${size * 0.25}px`, transform: `rotate(${lerp(-24, -6, u)}deg) scale(${lerp(1.8, 1, u)})`, opacity: Math.min(1, u * 3) }}>
          {block({ width: undefined, maxWidth: width })}
        </div>
      );
      break;
    }
    case "split": {
      const u = k(s, 0, 0.36, sharp);
      body = (
        <div style={{ position: "relative" }}>
          {block({ clipPath: "inset(0 0 50% 0)", transform: `translateX(${lerp(-W, 0, u)}px)` })}
          <div style={{ position: "absolute", inset: 0 }}>{block({ clipPath: "inset(50% 0 0 0)", transform: `translateX(${lerp(W, 0, u)}px)` })}</div>
        </div>
      );
      break;
    }
    default:
      body = line;
  }
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", opacity: 1 - o, transform: `scale(${lerp(1, 0.85, o)})` }}>
      {body}
    </div>
  );
};

/** короткая подпись к кадру мелким текстом (шрифт текста бренда) — тот же вид, что и заголовки */
export const Caption: React.FC<{ t: number; a: number; text: string; y?: number; kind?: string; out?: number }> = (p) => (
  <Title {...p} size={58} upper={false} fontName={B.text} />
);

