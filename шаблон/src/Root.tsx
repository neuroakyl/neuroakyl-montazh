import React from "react";
import { Composition } from "remotion";
import { Cover } from "./Cover";
import { DURATION, FPS } from "./lib";
import { Reel } from "./Reel";

export const Root: React.FC = () => (
  <>
    <Composition id="Reel" component={Reel} width={1080} height={1920} fps={FPS} durationInFrames={Math.round(DURATION * FPS)} />
    <Composition id="Cover" component={Cover} width={1080} height={1920} fps={FPS} durationInFrames={1} />
  </>
);
