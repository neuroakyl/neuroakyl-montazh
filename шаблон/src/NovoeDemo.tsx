import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useFonts } from "./fonts";
import { FPS, H, W, inOut, k, lerp, sharp, words } from "./lib";
import { Ending, UI_KG, type CtaConfig } from "./kit/cta";
import { BigWord, Grain, KaraokeSubs } from "./kit/live";
import { Slab3D, Sparks, Swarm3D } from "./kit/obem";
import { Shots, type Shot } from "./kit/shots";

// Витрина деталей 08.11.2026: переходы (Shots), объём (Swarm3D, Slab3D, Sparks), крупное слово, субтитры-караоке, две концовки.
// Посмотреть: COMP=Novoe node stills.mjs out 1 3.3 5.5 9 15  или  npx remotion studio → Novoe.
export const NOVOE_DURATION = 18;
const BODY = 7.5;

const bg = (c: string) => <AbsoluteFill style={{ background: `radial-gradient(110% 70% at 50% 40%, ${c} 0%, #05070D 72%)` }} />;

const list: Shot[] = [
  {
    a: 0,
    r: (t) => (
      <>
        {bg("#14204A")}
        <Swarm3D t={t} a={0.1} />
        <BigWord t={t} a={0.6} text="РОЙ В ОБЪЁМЕ" y={260} size={120} color="#FFC83D" />
      </>
    ),
  },
  {
    a: 2.6,
    tr: "z",
    r: (t) => (
      <>
        {bg("#2A1240")}
        <Slab3D w={900} h={320} ry={lerp(-50, 10, k(t, 2.7, 1.2, sharp))} rx={22} rz={-8} s={lerp(0.7, 0.95, k(t, 2.7, 0.6, inOut))} cy={1000}>
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #F4F6FB, #C9D0DE)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90, fontWeight: 900, color: "#1A1F2E", fontFamily: "K-Head" }}>
            ПРЕДМЕТ
          </div>
        </Slab3D>
        <BigWord t={t} a={3.0} text="ТОЛЩИНА И БЛИК" y={300} size={110} />
      </>
    ),
  },
  {
    a: 5.0,
    tr: "l",
    r: (t) => (
      <>
        {bg("#0E3A2A")}
        <Sparks t={t} a={5.4} x={W / 2} y={H / 2} n={28} spread={1.3} color="#CFFFE2" glow="#2EE37A" />
        <BigWord t={t} a={5.4} text="БАХ!" y={H / 2 - 120} size={220} color="#2EE37A" />
      </>
    ),
  },
];

const COMMENTS: CtaConfig = { kind: "comments", len: 5, keyword: "СТАРТ", nick: "my.nick", times: { in: 0.4, type: 2.4, send: 3.4 }, ui: UI_KG };
const LINK: CtaConfig = { kind: "link", len: 5.5, keyword: "", nick: "my.nick", role: "Нейросеттер менен контент", bio: "Видео жасаганды үйрөтөм.", linkLine: "Шилтемени бас", times: { in: 0.3, link: 1.6, click: 2.3 }, ui: UI_KG };

export const NovoeDemo: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  if (!ready) return null;
  return (
    <AbsoluteFill style={{ background: "#05070D" }}>
      {t < BODY && <Shots t={t} list={list} hits={[5.4]} />}
      {t >= BODY && t < BODY + COMMENTS.len && <Ending t={t} start={BODY} cfg={COMMENTS} />}
      {t >= BODY + COMMENTS.len && <Ending t={t} start={BODY + COMMENTS.len} cfg={LINK} />}
      {t < BODY && <KaraokeSubs t={t % Math.max(1, words.at(-1)?.end ?? 1)} y={1500} />}
      <Grain t={t} />
    </AbsoluteFill>
  );
};
