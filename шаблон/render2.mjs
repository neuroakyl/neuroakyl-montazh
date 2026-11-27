// node render2.mjs .. [insta,link] — обе версии ролика за ОДИН рендер тела (аудит 24.11.2026).
// Тело у insta и link одно, разница только в концовке: тело рендерим один раз, хвост (последние TAIL с) — на каждую
// версию, склейка ffmpeg без перекодирования. Звук — целиком на каждую версию (рендер звука быстрый).
// Выход: ../out-insta.mp4/.wav, ../out-link.mp4/.wav (дальше deliver.py, как раньше).
// Страховка: перед склейкой сверяются кадры тела у обеих версий; разошлись — честный полный рендер каждой версии.
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [prefix, list = "insta,link"] = process.argv.slice(2);
if (!prefix) { console.error("node render2.mjs .. [insta,link]"); process.exit(1); }
const VERSII = list.split(",");
const TAIL = Number(process.env.TAIL ?? 14); // с: хвост с запасом — концовка «Б» ≈ 11 с
const VYBOR = path.resolve("src/vybor.json");
const orig = fs.readFileSync(VYBOR, "utf-8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render2-"));
const OPT = { codec: "h264", crf: 17, concurrency: 3, timeoutInMilliseconds: 180000, imageFormat: "jpeg", jpegQuality: 92, chromiumOptions: { gl: "angle" }, muted: true };
const t0 = Date.now();
const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} с  ${s}`);
const progress = (name) => { let last = -1; return ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; log(`${name} ${p * 10}%`); } }; };

if (!fs.existsSync(path.resolve("../cover.jpg"))) {
  console.error("нет обложки ../cover.jpg: сначала oblozhka.py sdelat (SKILL.md §«Обложка»)"); process.exit(1);
}

try {
  // 1. сборка на каждую версию (версия берётся из src/vybor.json на этапе сборки)
  const B = {};
  for (const v of VERSII) {
    fs.writeFileSync(VYBOR, JSON.stringify({ cta: v, music: true, stem: "all" }) + "\n");
    const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public"),
      outDir: path.join(tmp, `bundle-${v}`) });
    const comp = await selectComposition({ serveUrl, id: "Reel" });
    B[v] = { serveUrl, comp };
    log(`собрано ${v}: ${comp.durationInFrames} кадров`);
  }
  const fps = B[VERSII[0]].comp.fps;
  const S = Math.min(...VERSII.map((v) => B[v].comp.durationInFrames)) - Math.round(TAIL * fps); // первый кадр хвоста

  // 2. страховка: тело одинаковое? (3 кадра: начало, середина, последний кадр тела)
  let same = S > fps && VERSII.length > 1;
  for (const f of same ? [0, Math.floor(S / 2), S - 1] : []) {
    const shots = [];
    for (const v of VERSII) {
      const { buffer } = await renderStill({ serveUrl: B[v].serveUrl, composition: B[v].comp, frame: f, imageFormat: "png",
        chromiumOptions: OPT.chromiumOptions });
      shots.push(buffer);
    }
    if (!shots.every((b) => b.equals(shots[0]))) { same = false; log(`кадр ${f} у версий разный → полный рендер каждой`); }
  }

  // 3. видео
  if (same) {
    const body = path.join(tmp, "body.mp4");
    await renderMedia({ ...OPT, serveUrl: B[VERSII[0]].serveUrl, composition: B[VERSII[0]].comp, outputLocation: body,
      frameRange: [0, S - 1], onProgress: progress("тело") });
    for (const v of VERSII) {
      const { serveUrl, comp } = B[v];
      const tail = path.join(tmp, `tail-${v}.mp4`);
      await renderMedia({ ...OPT, serveUrl, composition: comp, outputLocation: tail,
        frameRange: [S, comp.durationInFrames - 1], onProgress: progress(`хвост ${v}`) });
      const lst = path.join(tmp, `list-${v}.txt`);
      fs.writeFileSync(lst, `file '${body}'\nfile '${tail}'\n`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", `${prefix}/out-${v}.mp4`]);
    }
  } else {
    for (const v of VERSII) {
      const { serveUrl, comp } = B[v];
      await renderMedia({ ...OPT, serveUrl, composition: comp, outputLocation: `${prefix}/out-${v}.mp4`, onProgress: progress(v) });
    }
  }

  // 4. звук — ЦЕЛИКОМ на каждую версию. Склейку звука пробовали 24.11 на 68: хвост, отрендеренный отдельно, на 16 сэмплов
  //    сдвинут и по сигналу не совпадает с цельным (разница до уровня самого сигнала) — звук не режем.
  //    Параллельно обе версии — не быстрее (проверено 24.11: 419 с и так и так), поэтому по очереди: меньше памяти.
  for (const v of VERSII) await renderMedia({ serveUrl: B[v].serveUrl, composition: B[v].comp, codec: "wav", timeoutInMilliseconds: 180000, outputLocation: `${prefix}/out-${v}.wav` });
  log("звук готов");
  for (const v of VERSII) {
    const { comp } = B[v];
    const sek = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
      `${prefix}/out-${v}.wav`]).toString());
    if (Math.abs(sek - comp.durationInFrames / fps) > 0.05) throw new Error(`${v}: звук ${sek} с, а ролик ${comp.durationInFrames / fps} с`);
    const n = parseInt(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries",
      "stream=nb_read_packets", "-of", "csv=p=0", `${prefix}/out-${v}.mp4`]).toString().trim());
    if (n !== comp.durationInFrames) throw new Error(`${v}: в видео ${n} кадров, а в композиции ${comp.durationInFrames}`);
    log(`готово ${v}: ${n} кадров ${same ? "(тело одно)" : "(полный рендер)"}`);
  }
} finally {
  fs.writeFileSync(VYBOR, orig);
  fs.rmSync(tmp, { recursive: true, force: true });
}
