import React from "react";
import { Audio, Sequence, interpolate, staticFile } from "remotion";
import { DURATION, FPS } from "./lib";
import { REEL } from "./settings";

// Звуковая партитура: эффект на каждое видимое действие, привязан к слову через at().
// Банк sfx выровнен sfxlib.py norm к −16 LUFS, голос −16 LUFS → эффекты на 14–18 дБ тише голоса.
export type Cue = [t: number, name: string, db?: number, dur?: number];
const SFX_BASE = -12;
export const db = (g: number) => Math.pow(10, g / 20);

// Реплики ролика. Пример: [at("слово") - 0.05, "swoosh", -8]  — файл public/sfx/swoosh.wav
export const CUES = (): Cue[] => [];

const musicVol = (f: number) =>
  db(REEL.musicDb) * interpolate(f / FPS, [0, 0.3, DURATION - 1.2, DURATION], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const Sound: React.FC = () => (
  <>
    {REEL.voice && <Audio src={staticFile("voice.wav")} volume={db(2)} />}
    {REEL.music && <Audio src={staticFile("music.wav")} volume={musicVol} />}
    {CUES().map(([t, name, g = 0, dur], i) => (
      <Sequence key={i} from={Math.max(0, Math.round(t * FPS))} durationInFrames={Math.round((dur ?? 1.5) * FPS)}>
        <Audio src={staticFile(`sfx/${name}.wav`)} volume={db(SFX_BASE + g)} />
      </Sequence>
    ))}
  </>
);
