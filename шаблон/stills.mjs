// node stills.mjs ПАПКА 1.2 5.0 48.3 … — контрольные кадры (секунды) в ПАПКУ
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const [dir, ...secs] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const comp = await selectComposition({ serveUrl, id: process.env.COMP ?? "Reel" });
for (const s of secs) {
  const frame = Math.min(comp.durationInFrames - 1, Math.round(Number(s) * comp.fps));
  const out = path.join(dir, `t${String(s).padStart(5, "0")}.jpg`);
  await renderStill({ serveUrl, composition: comp, frame, output: out, imageFormat: "jpeg", jpegQuality: 88, onBrowserLog: (l) => l.type === "error" && console.log("[browser]", l.text) });
  console.log(out);
}
