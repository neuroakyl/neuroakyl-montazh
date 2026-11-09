import R from "../../recept.json";
import { F } from "../../lib";

/**
 * Рецепт ролика: ПОСТОЯННЫЙ дизайн автора (brand: цвета, шрифты) + МЕНЯЮЩИЕСЯ приёмы (pick: переходы, появление текста,
 * субтитры, фон, акценты, камера). Пишет инструменты/recept.py перед каждым роликом: варианты, которые были в последних
 * роликах, не берутся — монтаж не надоедает (Боб, 09.11.2026: «первые два ролика ладно, потом один и тот же стиль надоедает»).
 * Детали kit/vary/* берут вариант из рецепта, если в сцене не указан свой.
 */
export type Brand = { accent: string; dark: string; light: string; head: string; text: string };
export type Pick = {
  perehody: string[]; // 3–4 перехода ролика, чередуются по кругу
  tekst: string; // как появляются заголовки и крупные слова
  subs: string; // субтитры
  fon: string; // фон графических сцен
  akcent: string; // чем выделяется главное (обводка, стрелка…)
  kamera: string; // как живёт кадр
  ton?: "spokoyno" | "energichno";
  pak?: { perehod?: string; perehodBlend?: "screen" | "normal"; tekstura?: string; sfxPik?: Record<string, number> }; // файлы из пака в public/pak (pak.py take)
};
export type Recept = { brand: Brand; pick: Pick; seed?: number; name?: string };

const FONTS: Record<string, string> = { head: F.head, head2: F.head2, ui: F.ui, serif: F.serif, narrow: F.narrow, script: F.script };
const raw = R as unknown as Partial<Recept>;
export const RECEPT: Recept = {
  brand: { accent: "#FFD400", dark: "#0B0B0C", light: "#FFFFFF", head: "head", text: "ui", ...(raw.brand ?? {}) },
  pick: { perehody: ["cut", "dive", "slide-l"], tekst: "blur", subs: "karaoke", fon: "gradient", akcent: "ellipse", kamera: "drift", ...(raw.pick ?? {}) },
  seed: raw.seed ?? 1,
  name: raw.name,
};
export const B = RECEPT.brand;
export const P = RECEPT.pick;
/** шрифт по имени из рецепта (head / ui / serif / narrow / script) */
export const font = (name: string) => FONTS[name] ?? name;
/** цвет с прозрачностью: hexA("#FFD400", 0.3) */
export const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
