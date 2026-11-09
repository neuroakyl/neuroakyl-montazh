import React from "react";
import { Audio, Sequence, interpolate, staticFile } from "remotion";
import { BODY_END, DURATION, FPS, has } from "./lib";
import { CTA, REEL } from "./settings";

// Звуковая партитура: эффект на каждое видимое действие, привязан к слову через at().
// Банк sfx выровнен sfxlib.py norm к −16 LUFS, голос −16 LUFS. Эффекты по пику ~20 дБ ниже голоса (SKILL.md «Речь главнее эффектов»),
// главные удары — точечно громче через свой db. Файла нет в public/sfx — звук пропускается (рендер не падает), проверь лист звуков.
export type Cue = [t: number, name: string, db?: number, dur?: number];
const SFX_BASE = -20;
export const db = (g: number) => Math.pow(10, g / 20);

/**
 * Звуки склеек из списка кадров (kit/shots.tsx): переезд и нырок — свуш (−0,1 с, три разных по кругу), жёсткая склейка — тихий клик.
 * Нужны public/sfx/whoosh1.wav, whoosh2.wav, whoosh3.wav, click.wav (подобрать в банке sfxlib.py, переименовать).
 */
export const shotCues = (shots: { a: number; tr?: string }[]): Cue[] =>
  shots
    .filter((s) => s.a > 0)
    .map((s, i): Cue => ((s.tr ?? "cut") === "cut" ? [s.a - 0.02, "click", -14] : [s.a - 0.1, ["whoosh1", "whoosh2", "whoosh3"][i % 3], s.tr === "z" ? -6 : -4, 1.1]));

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
