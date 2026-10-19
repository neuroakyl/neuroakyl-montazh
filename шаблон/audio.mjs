// node audio.mjs ВЫХОД.wav — только звуковая дорожка ролика (быстро, без картинки)
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const comp = await selectComposition({ serveUrl, id: "Reel" });
await renderMedia({ serveUrl, composition: comp, codec: "wav", outputLocation: process.argv[2] });
console.log("готово", process.argv[2]);
