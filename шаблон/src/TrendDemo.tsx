import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useFonts } from "./fonts";
import { F, FPS, W } from "./lib";
import {
  BehindText, BigSmall, BlurWords, Breathe, Cascade, CoinWipe, ColorDisc, DrumNumber, EdgeCascade, Flash, Flip, HandEllipse,
  LoadBar, Mosaic, NeonWord, PhotoCard, PopForward, PullIn, Silhouette, Tint, TypeOn, Underline, ZoomUI,
} from "./kit/trend";

// Витрина 16 трендовых приёмов (kit/trend.tsx): по 2,6 с на приём, без голоса. COMP=Trend node stills.mjs out 1.2 …
// Тексты — заглушки; в ролике времена берутся из at("слово").
export const SEG = 2.6;
export const TREND_DURATION = SEG * 16;

const bg = (c1: string, c2: string) => <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${c1} 0%, ${c2} 100%)` }} />;
const Label: React.FC<{ n: number; s: string }> = ({ n, s }) => (
  <div style={{ position: "absolute", top: 120, left: 0, width: W, textAlign: "center", fontFamily: F.ui, fontWeight: 600, fontSize: 34, color: "rgba(255,255,255,0.55)" }}>
    {n} · {s}
  </div>
);
const Box: React.FC<{ w: number; h: number; c: string; s?: string }> = ({ w, h, c, s }) => (
  <div style={{ width: w, height: h, borderRadius: 26, background: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.head, fontSize: 70, color: "#111" }}>{s}</div>
);
const Ui: React.FC = () => (
  <AbsoluteFill style={{ background: "#F3F4F7", padding: 90 }}>
    {Array.from({ length: 9 }, (_, i) => (
      <div key={i} style={{ height: 120, marginBottom: 34, borderRadius: 22, background: i === 4 ? "#C6FF3D" : "#fff", boxShadow: "0 4px 14px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", paddingLeft: 40, fontFamily: F.ui, fontWeight: 700, fontSize: 44, color: "#222" }}>
        {i === 4 ? "Жарыялоо ✓" : `Пункт ${i + 1}`}
      </div>
    ))}
  </AbsoluteFill>
);

const SCENES: [label: string, render: (t: number) => React.ReactNode][] = [
  ["слово из размытия", (t) => (<>{bg("#2A2A33", "#0B0B0F")}<BlurWords t={t} words={[["Бир", 0.3], ["роликке", 0.5], ["бүтүн", 0.72], ["күн", 0.92], ["кетчү", 1.12]]} accent={[3, "#C6FF3D"]} out={2.3} /></>)],
  ["мелкое + огромное", (t) => (<>{bg("#1E1B2E", "#07060C")}<BigSmall t={t} rows={[[{ text: "айына", t: 0.3 }, { text: "250 миң", t: 0.55, big: true, color: "#FFC83D", glow: true }], [{ text: "бирок", t: 1.1, font: "script" }, { text: "үйгө", t: 1.35, font: "thin" }], [{ text: "КАЙТА АЛБАДЫМ", t: 1.6, big: true }]]} /></>)],
  ["вспышка-переход + свуш", (t) => (<>{t < 1.2 ? bg("#123", "#012") : bg("#3A1E0E", "#120803")}<BlurWords t={t} words={[t < 1.2 ? ["МОСКВА", 0.2] : ["БИШКЕК", 1.2]]} font="black" size={200} /><Flash t={t} a={1.2} /></>)],
  ["отъезд-склейка", (t) => (<PullIn t={t} a={0.25} from={1.9}>{bg("#0E2A22", "#03110C")}<BlurWords t={t} words={[["ЖАҢЫ", 0.25], ["КЕСИП", 0.25]]} font="black" size={210} /></PullIn>)],
  ["текст за спикером", (t) => <BehindText t={t} a={0.35} text="МОСКВА" bg={bg("#E9E4DA", "#B8B0A2")} color="#B3121B" person={<Silhouette />} echo />],
  ["цветной круг за вырезкой", (t) => (<>{bg("#1A1A1A", "#050505")}<Tint t={t} a={1.4} color="#7A3CFF" /><ColorDisc t={t} a={0.3} color="#FFC83D" hits={[1.1, 1.8]} /><Silhouette color="#0C0C0C" /></>)],
  ["предмет вылетает вперёд", (t) => <PopForward t={t} a={0.6} back={<>{bg("#3B2A55", "#120B1E")}<BlurWords t={t} words={[["ноутбук", 0.1]]} size={120} y={520} /></>}><Box w={560} h={360} c="#E8ECF2" s="💻" /></PopForward>],
  ["въезд из-за края со смазом", (t) => (<>{bg("#2B1B12", "#0D0805")}<EdgeCascade t={t} a={0.3} cards={[0, 1, 2].map((i) => ({ node: <PhotoCard w={520} h={640}><Box w={496} h={616} c={["#7FB3FF", "#FFB37F", "#B3FF7F"][i]} s={`${i + 1}`} /></PhotoCard>, x: [380, 700, 540][i], y: [760, 980, 1220][i] }))} /></>)],
  ["число-барабан", (t) => (<>{bg("#0D1E10", "#020803")}<DrumNumber t={t} a={0.3} to={250000} suffix=" СОМ" color="#C6FF3D" y={900} /><BlurWords t={t} words={[["айына", 0.4]]} size={70} y={1120} font="serif" /></>)],
  ["штрих рисуется", (t) => (<>{bg("#F4EFE6", "#D9D0C0")}<BlurWords t={t} words={[["КАРЫЗ", 0.2]]} font="black" size={220} color="#111" y={800} /><HandEllipse t={t} a={0.7} x={540} y={800} w={640} h={260} /><Underline t={t} a={1.1} x={540} y={1020} w={560} /><LoadBar t={t} a={1.5} d={0.9} y={1260} /></>)],
  ["печать по буквам", (t) => (<>{bg("#0B0B12", "#000")}<TypeOn t={t} a={0.3} text="НЕЙРОСЕТЬ" per={0.07} glow color="#C6FF3D" /></>)],
  ["3D-переворот + монета", (t) => (<>{bg("#1D1D24", "#08080B")}<div style={{ position: "absolute", left: 540, top: 900, transform: "translate(-50%,-50%)" }}><Flip t={t} a={0.6} front={<Box w={600} h={380} c="#FFFFFF" s="КАЙЧЫ" />} back={<Box w={600} h={380} c="#C6FF3D" s="НОУТБУК" />} /></div><CoinWipe t={t} a={1.7} face={<span style={{ fontFamily: F.head, fontSize: 90 }}>СОМ</span>} /></>)],
  ["каскад + мозаика", (t) => (<>{bg("#101820", "#03070A")}<Cascade t={t} a={0.25} items={Array.from({ length: 9 }, (_, i) => ({ node: <Box w={240} h={240} c={["#FF5C5C", "#FFC83D", "#C6FF3D", "#5CE1FF", "#B07CFF"][i % 5]} s={`${i + 1}`} />, x: 270 + (i % 3) * 270, y: 650 + Math.floor(i / 3) * 290 }))} step={0.1} /><Mosaic t={t} a={1.8} color={(i) => (i % 2 ? "#C6FF3D" : "#0A0A0A")} /></>)],
  ["зум по интерфейсу", (t) => (<ZoomUI t={t} a={0.6} fx={540} fy={90 + 4 * 154 + 60} z={2.2} b={2.1}><Ui /></ZoomUI>)],
  ["камера дышит + прыжки", (t) => (<Breathe t={t} a={0} rate={0.04} hits={[0.9]} cuts={[1.7]}>{bg("#2C2C30", "#0A0A0C")}<Silhouette color="#55555E" /><BlurWords t={t} words={[["УРМАТ", 0.9]]} font="black" size={150} y={1500} /></Breathe>)],
  ["неон-слово", (t) => (<>{bg("#0A0814", "#000")}<NeonWord t={t} a={0.3} text="ЖАҢЫ ЖОЛ" color="#FF4FD8" /></>)],
];

export const TrendDemo: React.FC = () => {
  const ready = useFonts();
  const T = useCurrentFrame() / FPS;
  if (!ready) return null;
  const i = Math.min(SCENES.length - 1, Math.floor(T / SEG));
  const [label, render] = SCENES[i];
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {render(T - i * SEG)}
      <Label n={i + 1} s={label} />
    </AbsoluteFill>
  );
};
