import { Easing, interpolate } from "remotion";
import WORDS from "./words.json";

// Тайминги слов голоса: [{ text, start, end }] в секундах (голос — инструменты/golos.py, или MMS — words.py)
export type Word = { text: string; start: number; end: number };
export const words = WORDS as Word[];

export const FPS = 30;
export const W = 1080;
export const H = 1920;
// длина ролика: последнее слово + хвост 0,9 с
export const DURATION = Math.max(3, (words.at(-1)?.end ?? 2) + 0.9);

// Палитра ролика — меняется под стиль (это ручка, а не стиль)
export const C = {
  red: "#9E0A10",
  redEdge: "#760001",
  redDeep: "#5C0006",
  plaqueRed: "#6E0008",
  black: "#211F22",
  blackEdge: "#040305",
  pink: "#FFEDEF",
  white: "#FFFFFF",
  ink: "#111111",
  grey: "#8A8A8A",
};

export const F = {
  head: "K-Head", // узкий жирный капс — заголовки
  head2: "K-Head2", // то же, чуть легче — плашки
  ui: "K-UI", // гротеск — слова-субтитры, подписи
  script: "K-Script", // каллиграфия — приписки
};

// Ник внизу кадра. Пусто — не показываем.
export const HANDLE = "";

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яёңөүәіұқғһ-]/g, "");
/**
 * Слово голоса по тексту. Ищет по началу слова, поэтому у повторяющихся корней указывай номер:
 *   at("танда#2") — второе слово, начинающееся на «танда»;  at("=в") — ровно слово «в» (не «всего»);
 *   at("танда", 30) — первое после 30-й секунды. Номера повторов печатает инструменты/slova.py.
 * Не нашлось — рендер падает с понятной ошибкой (лучше, чем сцена не на месте).
 */
export function w(text: string, after = 0): Word {
  const [raw, nth] = text.split("#");
  const exact = raw.startsWith("=");
  const k = clean(exact ? raw.slice(1) : raw);
  const n = Number(nth || 1);
  const hits = words.filter((x) => x.start >= after - 0.01 && (exact ? clean(x.text) === k : clean(x.text).startsWith(k)));
  if (hits.length < n) throw new Error(`слово не найдено: ${text} после ${after} с`);
  return hits[n - 1];
}
export const at = (text: string, after = 0) => w(text, after).start;

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const sharp = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const back = Easing.bezier(0.34, 1.56, 0.64, 1);

export const k = (t: number, a: number, d = 0.25, e = sharp) => interpolate(t, [a, a + d], [0, 1], { ...clamp, easing: e });
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const between = (t: number, a: number, b: number) => t >= a && t < b;
export const pop = (t: number, a: number, d = 0.3) => interpolate(t, [a, a + d], [0, 1], { ...clamp, easing: back });

// детерминированный «случай» (Math.random в Remotion ломает рендер)
export const rand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

export const count = (t: number, a: number, d: number, from: number, to: number) =>
  Math.round(interpolate(t, [a, a + d], [from, to], { ...clamp, easing: Easing.bezier(0.2, 0.6, 0.3, 1) }));
