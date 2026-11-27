// Лицо аватара: две камеры, смена крупности по темпу рецепта, стык без застывания (Бобби 26.11.2026, ролик 74).
//
// Две беды, которые эта деталь закрывает кодом, а не правилом:
// 1) «Лицо застывает на стыке»: сырой клип HeyGen короче куска голоса на 0,04–0,16 с. Раньше хвост дотягивали стоп-кадром
//    (ffmpeg tpad clone), а переход ещё 0,3 с держал старый план → до ~0,45 с мёртвого лица. Теперь: клип не дотягивается
//    (инструменты/kuski.py пишет в litso.json `live` — длину живого клипа), а `vyhod()` даёт момент, когда начинать переход
//    из лица, чтобы последний показанный кадр был живым. proverka.py ловит остаток freezedetect-ом.
// 2) «Мало динамики»: внутри куска крупность меняется каждые temp.krupnost_s секунд (рецепт: динамичный 2,2 / средний 3 / спокойный 4)
//    жёсткой сменой на начале слова — как монтажёр режет одну камеру на «общий/крупный». Между сменами — медленный наезд или
//    отъезд (кадр живёт). На словах-акцентах (замер звука, не разметка слов) — толчок с торможением, сила = temp.punch.
//    Фронт не крупнее ×1,12 (1080p Look 16 мылит), бок до temp.zoom_max.
//
// Использование (Reel.tsx):
//   import { KUSKI, vyhod, LitsoVid } from "./kit/litso";
//   план Б-ролла после лица начинается в vyhod(kusok, TRD) — не позже; лицо: <LitsoVid k={kusok} t={t} a={…} b={…} akcenty={[…]} />
import React from "react";
import { OffthreadVideo, Sequence, staticFile } from "remotion";
import { FPS, k as ease, lerp, sharp, words, type Word } from "../lib";
import { P } from "./vary/recept";
import LITSO from "../litso.json";

export type Kusok = { id: string; camera: "front" | "side"; file: string; start: number; end: number; live?: number; words?: string; fokus?: [number, number] };
export const KUSKI = LITSO as unknown as Kusok[];

type Temp = { krupnost_s: number; zoom_max: number; punch: number; tryaska?: boolean };
const TEMP_DEF: Record<string, Temp> = {
  dinamichno: { krupnost_s: 2.2, zoom_max: 1.24, punch: 1, tryaska: true },
  energichno: { krupnost_s: 2.2, zoom_max: 1.24, punch: 1, tryaska: true },
  sredne: { krupnost_s: 3, zoom_max: 1.18, punch: 0.6 },
  spokoyno: { krupnost_s: 4, zoom_max: 1.12, punch: 0 },
};
export const TEMP: Temp = { ...TEMP_DEF[(P as { ton?: string }).ton ?? "sredne"], ...((P as { temp?: Partial<Temp> }).temp ?? {}) };

const FR = (s: number) => Math.round(s * FPS);
/** последний живой момент куска в треке */
export const zhivoyDo = (k: Kusok) => k.start + (k.live ?? k.end - k.start);
/** когда начинать переход ИЗ лица длиной trd: показанный кадр всегда живой (переход держит старый план trd секунд) */
export const vyhod = (k: Kusok, trd = 0) => Math.min(k.end, zhivoyDo(k) - 1 / FPS) - trd;

const MAX_FRONT = 1.12;
const potolok = (k: Kusok) => (k.camera === "front" ? Math.min(MAX_FRONT, TEMP.zoom_max) : TEMP.zoom_max);

/** точки смены крупности: каждые ~krupnost_s, на начале ближайшего слова, не ближе 1,2 с к краям куска */
export function smeny(k: Kusok, a: number, b: number, ws: Word[] = words): number[] {
  const out: number[] = [];
  const step = TEMP.krupnost_s;
  let t = a + step;
  while (t < b - 1.2) {
    const cand = ws.filter((w) => w.start > a + 1.0 && w.start < b - 1.2 && Math.abs(w.start - t) < step * 0.45);
    const best = cand.sort((x, y) => Math.abs(x.start - t) - Math.abs(y.start - t))[0];
    const s = best ? best.start : t;
    if (!out.length || s - out[out.length - 1] > step * 0.6) out.push(s);
    t = s + step;
  }
  return out;
}

/** крупность в момент t: чередуем общий/крупный, внутри плана медленный наезд (чётные) или отъезд (нечётные) */
export function krupnost(k: Kusok, t: number, a: number, b: number, akcenty: number[] = []): number {
  const sm = smeny(k, a, b);
  const top = potolok(k);
  const levels = k.camera === "front" ? [1.0, top] : [1.04, top];
  let i = 0;
  while (i < sm.length && t >= sm[i]) i++;
  const p0 = i === 0 ? a : sm[i - 1];
  const p1 = i < sm.length ? sm[i] : b;
  const u = Math.min(1, Math.max(0, (t - p0) / Math.max(0.1, p1 - p0)));
  const base = levels[i % 2];
  const live = 0.035 * (TEMP.punch > 0 ? 1 : 0.6); // жизнь внутри плана
  let s = i % 2 === 0 ? base + live * u : base - live * (1 - u) * 0.6;
  s = Math.min(top + 0.02, s);
  for (const h of akcenty) {
    if (t >= h - 0.02 && t < h + 0.6 && TEMP.punch > 0) {
      const v = ease(t, h - 0.02, 0.12, sharp) * (1 - ease(t, h + 0.18, 0.42));
      s += 0.05 * TEMP.punch * v;
    }
  }
  return s;
}

/** лицо одного куска на отрезке [a, b] трека (b не позже живого конца — иначе стоп-кадр; kuski.py клип не дотягивает) */
export const LitsoVid: React.FC<{ k: Kusok; t: number; a: number; b: number; akcenty?: number[]; fokus?: [number, number] }> = ({ k, t, a, b, akcenty = [], fokus }) => {
  const end = Math.min(b, zhivoyDo(k));
  if (t < a || t >= end) return null;
  const s = krupnost(k, t, a, end, akcenty);
  const [fx, fy] = fokus ?? k.fokus ?? (k.camera === "side" ? [58, 33] : [50, 34]);
  const u = (t - a) / Math.max(0.1, end - a);
  const pan = k.camera === "side" ? lerp(10, -10, u) : 0;
  return (
    <Sequence from={FR(a)} durationInFrames={Math.max(1, FR(end) - FR(a))} layout="none">
      <OffthreadVideo src={staticFile(k.file)} muted trimBefore={Math.max(0, FR(a - k.start))}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `translateX(${pan}px) scale(${s})`, transformOrigin: `${fx}% ${fy}%` }} />
    </Sequence>
  );
};
