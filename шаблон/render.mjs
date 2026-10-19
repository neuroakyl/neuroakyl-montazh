// node render.mjs ВЫХОД.mp4 [от_с до_с] — рендер ролика (или отрезка)
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [out, from, to] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const comp = await selectComposition({ serveUrl, id: "Reel" });
const range = from ? [Math.round(Number(from) * comp.fps), Math.min(comp.durationInFrames - 1, Math.round(Number(to) * comp.fps))] : undefined;
let last = 0;
await renderMedia({
  serveUrl, composition: comp, codec: "h264", outputLocation: out, frameRange: range, crf: 17, concurrency: 3,
  imageFormat: "jpeg", jpegQuality: 92, audioBitrate: "320k",
  onProgress: ({ progress }) => { const p = Math.floor(progress * 20); if (p !== last) { last = p; console.log(`${p * 5}%`); } },
});
console.log("готово", out);
