import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { F } from "./lib";

// Все шрифты с Ң ң Ө ө Ү ү (fontTools, 17.10.2026), лицензия OFL.
// GreatVibesKG — Great Vibes, ө/ң дорисованы скриптом (patch_gv.py в README ролика).
const FACES: [string, string, string?][] = [
  [F.head, "FiraSansExtraCondensed-Black.ttf"],
  [F.head2, "FiraSansExtraCondensed-ExtraBold.ttf"],
  [F.ui, "Montserrat-Variable.ttf", "100 900"],
  [F.script, "GreatVibesKG.ttf"],
];

export function useFonts() {
  const [h] = useState(() => delayRender("fonts"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all(
      FACES.map(([fam, file, weight]) => new FontFace(fam, `url(${staticFile(`fonts/${file}`)})`, { weight: weight ?? "400" }).load()),
    )
      .then((ls) => ls.forEach((l) => document.fonts.add(l)))
      .finally(() => {
        setReady(true);
        continueRender(h);
      });
  }, [h]);
  return ready;
}

let ctx: CanvasRenderingContext2D | null = null;
// ширина строки в px (шрифты уже загружены — вызывать только после useFonts)
export function measure(text: string, family: string, size: number, weight = 400) {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  ctx!.font = `${weight} ${size}px "${family}"`;
  return ctx!.measureText(text).width;
}
// кегль, при котором строка занимает width px
export function fit(text: string, family: string, width: number, max = 400, weight = 400) {
  return Math.min(max, (100 * width) / Math.max(1, measure(text, family, 100, weight)));
}
