// node cover.mjs ЗАДАНИЯ.json — обложки одним сбором: [{ "out": "../cover.jpg", "comp": "Cover"|"CoverWide", "props": {правки cover.json} }]
// Обычно запускается из инструменты/oblozhka.py (он же кладёт стиль аккаунта и делает проверку). Без задания — одна вертикальная в ../cover.jpg.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const jobs = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : [{ out: "../cover.jpg", comp: "Cover", props: {} }];
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
for (const j of jobs) {
  const inputProps = j.props ?? {};
  const composition = await selectComposition({ serveUrl, id: j.comp ?? "Cover", inputProps });
  fs.mkdirSync(path.dirname(path.resolve(j.out)), { recursive: true });
  try {
    await renderStill({ serveUrl, composition, inputProps, output: j.out, imageFormat: "jpeg", jpegQuality: 95, onBrowserLog: (l) => l.type === "error" && console.log("[browser]", l.text) });
  } catch (e) {
    console.error(`ОБЛОЖКА ${j.out}: ${String(e.message ?? e).split("\n")[0]}`);
    process.exit(1);
  }
  console.log(j.out);
}
