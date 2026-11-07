import React from "react";
import { useVideoConfig } from "remotion";
import { H, W } from "../lib";

/**
 * Сцена 1080×1920, на которую рассчитаны детали kit, в кадре любого формата.
 * Вертикаль — как есть. Горизонталь — вертикальная панель слева, справа или по центру, остальной кадр свободен под видео.
 */
export const Stage: React.FC<{ side?: "left" | "center" | "right"; children: React.ReactNode }> = ({ side = "center", children }) => {
  const { width, height } = useVideoConfig();
  const k = Math.min(width / W, height / H);
  const left = side === "left" ? 0 : side === "right" ? width - W * k : (width - W * k) / 2;
  return (
    <div style={{ position: "absolute", left, top: (height - H * k) / 2, width: W, height: H, transform: `scale(${k})`, transformOrigin: "0 0", overflow: "hidden" }}>
      {children}
    </div>
  );
};
