import React from "react";
import { Audio, Sequence, interpolate, staticFile } from "remotion";
import { BODY_END, DURATION, FPS, has } from "./lib";
import { trDef } from "./kit/vary/perehody";
import { P } from "./kit/vary/recept";
import { CTA, REEL } from "./settings";

// Звуковая партитура: эффект на каждое видимое действие, привязан к слову через at().
// Банк sfx выровнен sfxlib.py norm к −16 LUFS, голос −16 LUFS. Эффекты по пику ~20 дБ ниже голоса (SKILL.md «Речь главнее эффектов»),
// главные удары — точечно громче через свой db. Файла нет в public/sfx — звук пропускается (рендер не падает), проверь лист звуков.
export type Cue = [t: number, name: string, db?: number, dur?: number];
const SFX_BASE = -20;
export const db = (g: number) => Math.pow(10, g / 20);

/**
 * Звуки склеек из списка кадров (kit/shots.tsx resolveShots): у каждого перехода свой вид звука (kit/vary/perehody.tsx sfx):
 * движение — свуш (три разных по кругу), вспышка/глитч/«телевизор» — удар, жёсткая склейка — тихий клик.
 * Нужны public/sfx/whoosh1.wav, whoosh2.wav, whoosh3.wav, hit.wav, click.wav — подобрать в паке (pak.py find вжух / удар / клик).
 */
export const shotCues = (shots: { a: number; tr?: string }[]): Cue[] => {
  // пик звука — на склейку: start = склейка − пик (пики пишет recept.py из пака; нет — типичные значения)
  const pik = (n: string, d: number) => P.pak?.sfxPik?.[n] ?? d;
  return shots
    .filter((s) => s.a > 0)
    .map((s, i): Cue => {
      const kind = trDef(s.tr).sfx;
      if (kind === "click") return [s.a - pik("click", 0.02), "click", -14];
      if (kind === "hit") return [s.a - pik("hit", 0.02), "hit", -4, pik("hit", 0) + 1.2];
      const n = ["whoosh1", "whoosh2", "whoosh3"][i % 3];
      return [s.a - pik(n, 0.1), n, s.tr === "dive" ? -6 : -4, pik(n, 0) + 1.0];
    });
};

// Реплики ролика. Пример: [at("слово") - 0.05, "pop", -5]  — файл public/sfx/pop.wav. Пик звука — на пик движения.
export const CUES = (): Cue[] => [];

const musicVol = (f: number) =>
  db(REEL.musicDb) * interpolate(f / FPS, [0, 0.3, DURATION - 1.0, DURATION], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const Sound: React.FC<{ shots?: { a: number; tr?: string }[] }> = ({ shots = [] }) => (
  <>
    {REEL.voice && <Audio src={staticFile("voice.wav")} volume={db(2)} endAt={CTA ? Math.round(BODY_END * FPS) : undefined} />}
    {CTA?.audio && (
      <Sequence from={Math.round(BODY_END * FPS)}>
        <Audio src={staticFile(CTA.audio)} volume={db(2)} />
      </Sequence>
    )}
    {REEL.music && <Audio src={staticFile("music.wav")} volume={musicVol} />}
    {[...shotCues(shots), ...CUES()]
      .filter(([, name]) => has(`sfx/${name}.wav`))
      .map(([t, name, g = 0, dur], i) => (
        <Sequence key={i} from={Math.max(0, Math.round(t * FPS))} durationInFrames={Math.round((dur ?? 1.5) * FPS)}>
          <Audio src={staticFile(`sfx/${name}.wav`)} volume={db(SFX_BASE + g)} />
        </Sequence>
      ))}
  </>
);
