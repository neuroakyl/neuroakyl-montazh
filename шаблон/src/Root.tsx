import React from "react";
import { Composition } from "remotion";
import { Cover } from "./Cover";
import { FORMAT, KLIPY_DURATION, Klipy } from "./Klipy";
import { KARTA_DURATION, KartaDemo } from "./KartaDemo";
import { DURATION, FPS } from "./lib";
import { Reel } from "./Reel";
import { TREND_DURATION, TrendDemo } from "./TrendDemo";

export const Root: React.FC = () => (
  <>
    <Composition id="Reel" component={Reel} width={1080} height={1920} fps={FPS} durationInFrames={Math.round(DURATION * FPS)} />
    <Composition id="Klipy" component={Klipy} width={FORMAT.w} height={FORMAT.h} fps={FPS} durationInFrames={Math.round(KLIPY_DURATION * FPS)} />
    <Composition id="Trend" component={TrendDemo} width={1080} height={1920} fps={FPS} durationInFrames={Math.round(TREND_DURATION * FPS)} />
    <Composition id="Karta" component={KartaDemo} width={1080} height={1920} fps={FPS} durationInFrames={Math.round(KARTA_DURATION * FPS)} />
    <Composition id="KartaAziya" component={KartaDemo} width={1080} height={1920} fps={FPS} durationInFrames={Math.round(KARTA_DURATION * FPS)} defaultProps={{ start: "aziya" as const }} />
    <Composition id="Cover" component={Cover} width={1080} height={1920} fps={FPS} durationInFrames={1} defaultProps={{}} />
    <Composition id="CoverWide" component={Cover} width={1280} height={720} fps={FPS} durationInFrames={1} defaultProps={{}} />
  </>
);
