import React from "react";
import { AbsoluteFill } from "remotion";
import { useFonts } from "./fonts";
import { At, Bg, headStyle, scriptStyle } from "./ui";

// Обложка: 3–4 жирных слова из сценария, всё важное в центре 1080×1440 (сетка профиля режет края).
// Вшивается первыми 0,1 с ролика (инструменты/deliver.py).
export const Cover: React.FC = () => {
  const ready = useFonts();
  if (!ready) return null;
  return (
    <AbsoluteFill>
      <Bg kind="red" />
      <At y={860}>
        <div style={{ ...headStyle(190), textAlign: "center", lineHeight: 0.95 }}>
          ТРИ
          <br />
          СЛОВА
        </div>
      </At>
      <At y={1120}>
        <div style={scriptStyle(110)}>приписка</div>
      </At>
    </AbsoluteFill>
  );
};
