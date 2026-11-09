import React from "react";
import { AbsoluteFill } from "remotion";
import { H, W, k, lerp, sharp } from "../lib";

/**
 * Ролик = список кадров с переходами. Проверено в роликах 08.11.2026 («Механика», «Тест — алтын»): кадр 1,5–3 с,
 * на 60 с — 20+ кадров, три вида переходов вперемешку (правило в SKILL.md «Понятно — мало, нужно ещё живо и объёмно»).
 *
 *   tr: "cut" — жёсткая склейка на слове;  "l" | "r" | "u" | "d" — переезд: старый кадр уезжает, новый въезжает
 *       с той стороны;  "z" — нырок-зум: старый кадр улетает в камеру, потом новый приезжает из глубины (без
 *       полупрозрачного наложения — оно и есть «дешёвый» переход).
 *   hits — секунды ударов (главные слова): весь кадр коротко толкается на 4–5 %.
 *   subY — где субтитры на этом кадре (чтобы не лезли на главное).
 *
 *   const list: Shot[] = [{ a: 0, r: S1 }, { a: cut("слово"), r: S2, tr: "z" }, ...];
 *   <Shots t={t} list={list} hits={[at("главное")]} bg="#05070D" />
 *   <Sound shots={list} />   — на каждый переезд свуш, на склейку тихий клик (sound.tsx)
 */
export type Tr = "cut" | "l" | "r" | "u" | "d" | "z";
export type Shot = { a: number; r: (t: number) => React.ReactNode; tr?: Tr; subY?: number };

const TR = 0.28; // переезд, с
const TZ = 0.24; // нырок, с
const OFF = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] } as const;

/** номер текущего кадра */
export const shotAt = (list: { a: number }[], t: number) => {
  let cur = 0;
  list.forEach((s, i) => {
    if (t >= s.a) cur = i;
  });
  return cur;
};

/** толчок кадра на ударе: 1 → 1 + amp и обратно за 0,45 с */
export const punchAt = (t: number, hits: number[], amp = 0.045) => {
  let p = 1;
  hits.forEach((h) => {
    if (t >= h && t < h + 0.45) p = Math.max(p, 1 + amp * (1 - (t - h) / 0.45));
  });
  return p;
};

/** drift — медленный наезд внутри кадра (доля в секунду, до 3 %): кадр не стоит, даже если в нём ничего не движется */
export const Shots: React.FC<{ t: number; list: Shot[]; hits?: number[]; bg?: string; amp?: number; drift?: number }> = ({ t, list, hits = [], bg = "#000", amp, drift = 0.008 }) => {
  const cur = shotAt(list, t);
  const render = (i: number, phase: "in" | "out" | "hold") => {
    const s = list[i];
    const nxt = list[i + 1];
    let tf = "";
    if (phase === "in") {
      const tr = s.tr ?? "cut";
      if (tr === "z") {
        if (t < s.a + TZ / 2) return null;
        tf = `scale(${lerp(0.72, 1, k(t, s.a + TZ / 2, TZ / 2 + 0.15, sharp))})`;
      } else if (tr !== "cut") {
        const [dx, dy] = OFF[tr];
        const u = k(t, s.a, TR, sharp);
        tf = `translate(${-dx * W * (1 - u)}px, ${-dy * H * (1 - u)}px)`;
      }
    }
    if (phase === "out" && nxt) {
      const tr = nxt.tr ?? "cut";
      if (tr === "z") {
        if (t >= nxt.a + TZ / 2) return null;
        const u = Math.min(1, (t - nxt.a) / (TZ / 2));
        tf = `scale(${lerp(1, 1.9, u * u)})`;
      } else if (tr !== "cut") {
        const [dx, dy] = OFF[tr];
        const u = k(t, nxt.a, TR, sharp);
        tf = `translate(${dx * W * u}px, ${dy * H * u}px)`;
      }
    }
    const z = 1 + Math.min(0.03, Math.max(0, t - s.a) * drift);
    return (
      <AbsoluteFill key={i} style={{ transform: tf, overflow: "hidden", background: bg }}>
        <AbsoluteFill style={{ transform: `scale(${z})` }}>{s.r(t)}</AbsoluteFill>
      </AbsoluteFill>
    );
  };
  const trNow = list[cur].tr ?? "cut";
  const inTr = cur > 0 && trNow !== "cut" && t < list[cur].a + (trNow === "z" ? TZ : TR);
  return (
    <AbsoluteFill style={{ background: bg, transform: `scale(${punchAt(t, hits, amp)})` }}>
      {inTr && trNow !== "z" && render(cur - 1, "out")}
      {render(cur, inTr ? "in" : "hold")}
      {inTr && trNow === "z" && render(cur - 1, "out")}
    </AbsoluteFill>
  );
};
