// node render.mjs ВЫХОД.mp4 [от_с до_с] — рендер ролика (или отрезка); COMP=Karta — другая композиция (витрина)
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const [out, from, to] = process.argv.slice(2);
// Обложка — по умолчанию у каждого ролика: полный рендер без неё не идёт (отрезок для проверки — можно)
if (!from && !process.env.COMP && !fs.existsSync(path.resolve("../cover.jpg"))) {
  console.error("нет обложки ../cover.jpg: сначала python3 -I <навык>/инструменты/oblozhka.py sdelat (SKILL.md §«Обложка»)");
  process.exit(1);
}
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const comp = await selectComposition({ serveUrl, id: process.env.COMP ?? "Reel" });
const range = from ? [Math.round(Number(from) * comp.fps), Math.min(comp.durationInFrames - 1, Math.round(Number(to) * comp.fps))] : undefined;
let last = 0;
await renderMedia({
  serveUrl, composition: comp, codec: "h264", outputLocation: out, frameRange: range, crf: 17, concurrency: 3,
  imageFormat: "jpeg", jpegQuality: 92, chromiumOptions: { gl: "angle" }, audioBitrate: "320k",
  onProgress: ({ progress }) => { const p = Math.floor(progress * 20); if (p !== last) { last = p; console.log(`${p * 5}%`); } },
});
console.log("готово", out);
