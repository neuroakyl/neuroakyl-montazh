import React from "react";
import { W, k, lerp, sharp, back, words as WORDS, type Word } from "../../lib";
import { chunks } from "../live";
import { B, P, font, hexA } from "./recept";

/**
 * Банк субтитров: 10 видов. Цвет и шрифт — из бренда, вид — из рецепта (P.subs) или свой kind.
 *   <Subs t={t} y={1330} />  — y = верх блока; две строки по 70 px кончаются ≈ y+180, низ безопасной зоны 1540 (tekst.py)          list — свои слова (тело + концовка), hide — интервалы без субтитров
 * karaoke — звучащее слово цветом; box — звучащее слово в плашке; single — одно слово крупно; underline — черта под словом;
 * outline — контур, звучащее залито; pill — кусок на тёмной капсуле; glow — неоновое свечение; lower — спокойные строчные
 * в две строки; bounce — звучащее слово подпрыгивает; marker — маркер-выделитель за словом.
 */
export const SUBS = ["build", "karaoke", "box", "single", "underline", "outline", "pill", "glow", "lower", "bounce", "marker"] as const;

const clean = (s: string) => s.replace(/[«»"…]/g, "").replace(/\.\.\./g, "");

export const Subs: React.FC<{ t: number; y?: number; list?: Word[]; hide?: [number, number][]; kind?: string; size?: number }> = ({ t, y = 1330, list, hide = [], kind, size }) => {
  const kd = kind ?? P.subs;
  const ws = list ?? WORDS;
  const all = React.useMemo(() => chunks(ws), [ws]);
  if (hide.some(([a, b]) => t >= a && t < b)) return null;

  if (kd === "single") {
    const w = ws.find((x, i) => t >= x.start - 0.02 && t < (ws[i + 1]?.start ?? x.end + 0.4));
    if (!w) return null;
    const u = k(t, w.start - 0.02, 0.14, back);
    return (
      <div style={{ position: "absolute", left: 0, right: 0, top: y - 40, textAlign: "center" }}>
        <span style={{ fontFamily: font(B.head), fontSize: Math.min(size ?? 120, Math.floor(800 / (0.6 * Math.max(1, clean(w.text).length)))), color: B.light, textTransform: "uppercase", display: "inline-block", transform: `scale(${lerp(0.6, 1, u)})`, textShadow: `0 6px 0 ${B.accent}, 0 10px 30px rgba(0,0,0,0.7)` }}>
          {clean(w.text)}
        </span>
      </div>
    );
  }

  const c = all.find((q) => t >= q.a - 0.04 && t < q.b);
  if (!c) return null;

  // build — фраза собирается по словам ровно с голосом (13 эталонов Бобби 27.11: 05, 04, 11, 12, уроки 14–15): слова нет, пока
  // его не сказали; встаёт за 2–3 кадра (1-й кадр 50 % и ниже на 1,5 % высоты), без размытия и масштаба; жирный гротеск
  // в обычном регистре; число и слово с «!» — акцент цветом бренда со свечением; группа исчезает за 1 кадр.
  if (kd === "build") {
    const fsb = size ?? 66;
    return (
      <div style={{ position: "absolute", left: 140, right: 140, top: y, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${fsb * 0.26}px` }}>
        {c.ws.map((w, i) => {
          if (t < w.start - 0.02) return null;
          const u = k(t, w.start - 0.02, 0.08, sharp);
          const key = /\d/.test(w.text) || /!$/.test(w.text);
          return (
            <span key={i} style={{ fontFamily: font(B.text), fontWeight: 800, fontSize: key ? fsb * 1.12 : fsb, lineHeight: 1.08, letterSpacing: "-0.015em",
              color: key ? B.accent : B.light, opacity: lerp(0.5, 1, u), transform: `translateY(${lerp(29, 0, u)}px)`, display: "inline-block", whiteSpace: "nowrap",
              textShadow: key ? `0 0 8px ${hexA(B.accent, 0.9)}, 0 0 24px ${hexA(B.accent, 0.45)}, 0 3px 14px rgba(0,0,0,0.7)` : "0 3px 14px rgba(0,0,0,0.75)" }}>
              {clean(w.text)}
            </span>
          );
        })}
      </div>
    );
  }
  const u = k(t, c.a - 0.04, 0.16, sharp);
  const lower = kd === "lower";
  const fs = size ?? (lower ? 52 : 70);
  const wrap: React.CSSProperties = {
    position: "absolute",
    left: 140, // справа кнопки Instagram (ремесло.md §7, tekst.py)
    right: 140,
    top: y,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: lower ? "0 14px" : "0 22px",
    transform: `translateY(${lerp(18, 0, u)}px)`,
    opacity: u,
  };
  const inner = c.ws.map((w, i) => {
    const on = t >= w.start - 0.02;
    const now = on && (i === c.ws.length - 1 || t < c.ws[i + 1].start);
    const pu = k(t, w.start, 0.18, sharp);
    const st: React.CSSProperties = {
      fontFamily: font(lower ? B.text : B.text),
      fontWeight: lower ? 600 : 900,
      fontSize: fs,
      letterSpacing: lower ? "0" : "-0.02em",
      textTransform: lower ? "none" : "uppercase",
      color: B.light,
      opacity: on ? 1 : kd === "lower" ? 0.55 : 0.35,
      textShadow: "0 4px 18px rgba(0,0,0,0.8)",
      whiteSpace: "nowrap",
      position: "relative",
      display: "inline-block",
    };
    switch (kd) {
      case "box":
        if (now) Object.assign(st, { background: B.accent, color: B.dark, textShadow: "none", padding: "0 16px", borderRadius: 14, transform: `scale(${lerp(1.12, 1, pu)})` });
        break;
      case "underline":
        return (
          <span key={i} style={st}>
            {clean(w.text)}
            {now && <span style={{ position: "absolute", left: 0, bottom: -6, height: 9, borderRadius: 9, background: B.accent, width: `${pu * 100}%` }} />}
          </span>
        );
      case "outline":
        Object.assign(st, { color: now || on ? (now ? B.accent : B.light) : "transparent", WebkitTextStroke: `3px ${now ? B.accent : B.light}`, opacity: 1 });
        break;
      case "glow":
        if (now) Object.assign(st, { color: B.light, textShadow: `0 0 12px ${B.accent}, 0 0 34px ${B.accent}, 0 0 60px ${hexA(B.accent, 0.6)}` });
        break;
      case "bounce":
        if (now) Object.assign(st, { color: B.accent, transform: `translateY(${-Math.sin(Math.min(1, (t - w.start) / 0.25) * Math.PI) * 26}px)` });
        break;
      case "marker":
        return (
          <span key={i} style={st}>
            {now || (on && i < c.ws.length) ? (
              <span style={{ position: "absolute", left: -8, right: -8, top: "18%", bottom: "8%", background: hexA(B.accent, 0.85), transform: `scaleX(${now ? pu : 1})`, transformOrigin: "0 50%", borderRadius: 6, zIndex: -1 }} />
            ) : null}
            <span style={{ position: "relative", color: on ? B.dark : B.light, textShadow: on ? "none" : st.textShadow }}>{clean(w.text)}</span>
          </span>
        );
      case "pill":
        if (now) Object.assign(st, { color: B.accent });
        break;
      case "lower":
        Object.assign(st, { textShadow: "0 2px 10px rgba(0,0,0,0.9)" });
        break;
      default: // karaoke
        if (now) Object.assign(st, { color: B.accent, transform: `scale(${lerp(1.04, 1, pu)})` });
    }
    return (
      <span key={i} style={st}>
        {lower ? w.text : clean(w.text)}
      </span>
    );
  });
  if (kd === "pill")
    return (
      <div style={{ ...wrap, left: 0, right: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 20px", background: hexA(B.dark, 0.82), borderRadius: 60, padding: "14px 40px", maxWidth: W - 120 }}>{inner}</div>
      </div>
    );
  return <div style={{ ...wrap, isolation: "isolate" }}>{inner}</div>;
};
