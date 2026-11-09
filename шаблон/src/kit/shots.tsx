import React from "react";
import { AbsoluteFill } from "remotion";
import { has } from "../lib";
import { P } from "./vary/recept";
import { PEREHODY, PakOver, trDef } from "./vary/perehody";

/**
 * Ролик = список кадров с переходами. Кадр 1,5–3 с, на 60 с — 20+ кадров (SKILL.md «живо и объёмно»).
 *
 *   tr — переход В этот кадр, любой из банка kit/vary/perehody.tsx (21 вид: cut, slide-l/r/u/d, dive, pull, whip, flash,
 *        glitch, iris, wipe, shutter, spin, squash, pixel, doors, blur, stretch, card, pak). Старые имена l r u d z тоже работают.
 *        Не указан — берётся из рецепта ролика по кругу (recept.json → pick.perehody): так каждый ролик со своим набором.
 *   hits — секунды ударов (главные слова): весь кадр коротко толкается на 4–5 %.
 *   subY — где субтитры на этом кадре.
 *
 *   <Shots t={t} list={list} hits={[at("главное")]} />    <Sound shots={resolveShots(list)} />
 */
export type Tr = string;
export type Shot = { a: number; r: (t: number) => React.ReactNode; tr?: Tr; subY?: number };

/** переход каждого кадра с учётом рецепта (для звука и проверки) */
export const resolveShots = <S extends { a: number; tr?: string }>(list: S[]): (S & { tr: string })[] =>
  list.map((s, i) => {
    let tr = s.tr ?? (i === 0 ? "cut" : P.perehody[(i - 1) % Math.max(1, P.perehody.length)] ?? "cut");
    if (tr === "pak" && !(P.pak?.perehod && has(P.pak.perehod))) tr = "flash";
    return { ...s, tr };
  });

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

/** drift — медленный наезд внутри кадра (доля в секунду, до 3 %): кадр не стоит */
export const Shots: React.FC<{ t: number; list: Shot[]; hits?: number[]; bg?: string; amp?: number; drift?: number }> = ({ t, list, hits = [], bg = "#000", amp, drift = 0.008 }) => {
  const all = resolveShots(list);
  const cur = shotAt(all, t);
  const frame = (i: number, st: React.CSSProperties = {}, key = String(i)) => {
    const s = all[i];
    const z = 1 + Math.min(0.03, Math.max(0, t - s.a) * drift);
    return (
      <AbsoluteFill key={key} style={{ overflow: "hidden", background: bg, ...st }}>
        <AbsoluteFill style={{ transform: `scale(${z})` }}>{s.r(t)}</AbsoluteFill>
      </AbsoluteFill>
    );
  };
  const def = trDef(all[cur].tr);
  const s = t - all[cur].a;
  const inTr = cur > 0 && s < def.d;
  let layers: React.ReactNode[] = [frame(cur)];
  if (inTr) {
    const o = def.old ? def.old(s) : {};
    const n = def.neu ? def.neu(s) : {};
    const n2 = def.neu2 ? def.neu2(s) : undefined;
    const oldL = o === null ? null : frame(cur - 1, o, "old");
    const neuL = n === null ? null : frame(cur, n, "neu");
    const neuL2 = n2 ? frame(cur, n2, "neu2") : null;
    layers = def.oldOnTop ? [neuL, neuL2, oldL] : [oldL, neuL, neuL2];
    if (def.over) layers.push(<React.Fragment key="over">{def.over(s)}</React.Fragment>);
  }
  // переходы из пака: файл играет поверх шва, звучит и виден чуть до и после склейки
  const pakOver = all.map((x, i) => (i > 0 && x.tr === "pak" && P.pak?.perehod ? <PakOver key={`pak${i}`} a={x.a} file={P.pak.perehod} blend={P.pak.perehodBlend ?? "screen"} /> : null));
  return (
    <AbsoluteFill style={{ background: bg, transform: `scale(${punchAt(t, hits, amp)})` }}>
      {layers}
      {pakOver}
    </AbsoluteFill>
  );
};

export { PEREHODY };
