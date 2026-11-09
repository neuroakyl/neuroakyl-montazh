import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useFonts } from "./fonts";
import { F, FPS, W, type Word } from "./lib";
import { Shots, type Shot } from "./kit/shots";
import { AKCENT, Akcent, KAMERA, kamera } from "./kit/vary/akcent";
import { FON, Fon } from "./kit/vary/fon";
import { PEREHODY } from "./kit/vary/perehody";
import { B } from "./kit/vary/recept";
import { SUBS, Subs } from "./kit/vary/subs";
import { TEKST, Title } from "./kit/vary/tekst";

// Витрина банков разнообразия: каждый вариант — кусок 2 с с подписью. Композиции V-perehody, V-tekst, V-subs, V-fon, V-akcent, V-kamera.
// Кадры разом: COMP=V-tekst node stills.mjs out 0.6 2.6 4.6 …  (середина куска = 2·i + 0.6)
export const SEG = 2;
export const BANKS = {
  perehody: Object.keys(PEREHODY),
  tekst: [...TEKST],
  subs: [...SUBS],
  fon: [...FON],
  akcent: [...AKCENT],
  kamera: [...KAMERA],
} as const;
export type Bank = keyof typeof BANKS;
export const bankLen = (b: Bank) => BANKS[b].length * SEG + (b === "perehody" ? SEG : 0);

const Label: React.FC<{ text: string; n: number }> = ({ text, n }) => (
  <div style={{ position: "absolute", left: 40, top: 40, fontFamily: F.ui, fontWeight: 800, fontSize: 44, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "8px 22px", borderRadius: 12 }}>
    {n + 1}. {text}
  </div>
);

const Card: React.FC<{ t: number; n: number; kind?: string }> = ({ t, n, kind = "gradient" }) => (
  <>
    <Fon t={t} kind={kind} />
    <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontFamily: F.head, fontSize: 520, color: n % 2 ? B.accent : B.light }}>{n % 2 ? "B" : "A"}</div>
  </>
);

const fakeWords = (a: number, kind: string): Word[] =>
  ["Субтитры", "вида", kind, "звучат", "по", "словам"].map((text, i) => ({ text, start: a + 0.15 + i * 0.28, end: a + 0.15 + i * 0.28 + 0.26 }));

export const Varianty: React.FC<{ bank: Bank }> = ({ bank }) => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  if (!ready) return null;
  const list = BANKS[bank] as readonly string[];
  const i = Math.min(list.length - 1, Math.floor(t / SEG));
  const a = i * SEG;
  const name = list[i];
  if (bank === "perehody") {
    // кадр i меняется на i+1 переходом list[i] в середине куска
    const shots: Shot[] = [{ a: 0, r: (tt) => <Card t={tt} n={0} /> }, ...list.map((tr, j) => ({ a: j * SEG + 1, tr, r: (tt: number) => <Card t={tt} n={j + 1} kind={j % 2 ? "grid" : "gradient"} /> }))];
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <Shots t={t} list={shots} />
        <Label text={list[Math.min(list.length - 1, Math.floor(Math.max(0, t - 0.5) / SEG))]} n={Math.min(list.length - 1, Math.floor(Math.max(0, t - 0.5) / SEG))} />
      </AbsoluteFill>
    );
  }
  let body: React.ReactNode;
  switch (bank) {
    case "tekst":
      body = (
        <>
          <Fon t={t} kind="gradient" />
          <Title t={t} a={a + 0.15} text="Главное *слово* здесь" y={760} size={130} kind={name} />
        </>
      );
      break;
    case "subs":
      body = (
        <>
          <Fon t={t} kind="dots" />
          <Subs t={t} y={1300} kind={name} list={fakeWords(a, name)} />
        </>
      );
      break;
    case "fon":
      body = (
        <>
          <Fon t={t} kind={name} />
          <Title t={t} a={a} text="ФОН" y={800} size={160} kind="blur" />
        </>
      );
      break;
    case "akcent":
      body = (
        <>
          <Fon t={t} kind="gradient" />
          <div style={{ position: "absolute", left: 0, width: W, top: 820, textAlign: "center", fontFamily: F.head, fontSize: 220, color: "#fff" }}>+42%</div>
          <Akcent t={t} a={a + 0.2} x={W / 2} y={940} w={560} h={210} kind={name} label="ВАЖНО" />
        </>
      );
      break;
    case "kamera":
      body = (
        <AbsoluteFill style={{ transform: kamera(t - a, [0.4, 1.2], name) }}>
          <Fon t={t} kind="grid" />
          <Title t={t} a={a} text="Кадр *живёт*" y={800} size={140} kind="pop" />
        </AbsoluteFill>
      );
      break;
  }
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {body}
      <Label text={name} n={i} />
    </AbsoluteFill>
  );
};
