import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useFonts } from "./fonts";
import { BODY_END, FPS, at } from "./lib";
import { CalendarChaos } from "./kit/cards";
import { MindMap, TableFill } from "./kit/schemes";
import { BigSmear, StackLines, StepSlate, TitleRows } from "./kit/text";
import { Ending } from "./kit/cta";
import { Grain } from "./kit/live";
import { Shots, type Shot } from "./kit/shots";
import { CTA } from "./settings";
import { Sound } from "./sound";
import { Bg, Handle, Swap, capStyle } from "./ui";

// Ролик = список кадров (kit/shots.tsx). Кадр = функция от времени t (секунды) + переход: "cut" жёсткая склейка,
// "l"/"r"/"u"/"d" переезд, "z" нырок-зум. Три вида вперемешку, кадр 1,5–3 с (SKILL.md «живо и объёмно»).
// Детали (kit/*) берутся по смыслу фразы — каталог «когда брать» в приёмы.md, раздел «Детали шаблона».
// Это демо на черновых таймингах (demo_words.py): под свой ролик сцены пишутся заново.
const cut = (a: string) => at(a) - 0.04;
const cap = (s: string, a: string): [number, React.ReactNode] => [at(a), <div style={capStyle(56)}>{s}</div>];

const raw = (): [number, (t: number) => React.ReactNode][] => [
  // хук: заголовок по словам + календарь из хаоса
  [
    0,
    (t) => (
      <>
        <Bg kind="red" />
        <TitleRows
          t={t}
          rows={[
            { kind: "head", words: [["КАК", at("как")], ["СНИМАТЬ", at("снимать")], ["КОНТЕНТ", at("контент")]] },
            { kind: "head", words: [["КАЖДЫЙ", at("каждый")], ["ДЕНЬ", at("день")]] },
            { kind: "script", text: "всего за час", t: at("всего") },
          ]}
        />
        <CalendarChaos t={t} days={["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]} />
      </>
    ),
  ],
  // шаг-заставка
  [cut("есть"), (t) => (<><Bg kind="red" /><StepSlate t={t} ghost={["ШАГ 1", at("шаг")]} items={[["ПРОСТОЙ МЕТОД", at("есть")], ["НАЙДИ ТЕМЫ", at("найди")]]} dash={at("темы") + 0.3} /></>)],
  // пример: майндмэп
  [
    cut("например"),
    (t) => (
      <>
        <Bg kind="black" />
        <Swap t={t} until={at("кофейня")} items={[cap("например", "например"), cap("ниша", "ниша")]} />
        <MindMap t={t} center={["кофейня", at("кофейня")]} arrows={at("кофейня") + 0.2} items={[["зерно", at("зерно")], ["бариста", at("бариста")], ["десерты", at("десерты")], ["гости", at("гости")]]} />
      </>
    ),
  ],
  // таблица по словам
  [
    cut("сделай"),
    (t) => (
      <>
        <Bg kind="red" />
        <TableFill
          t={t}
          a={at("сделай")}
          rowsTitle={["ТЕМЫ", at("вертикали")]}
          colsTitle={["ФОРМАТЫ", at("горизонтали")]}
          rows={["Зерно", "Бариста", "Десерты"]}
          cols={["Разбор", "Туториал", "Реакция", "Сторис"]}
          fill={at("распредели")}
          cell={(n) => `${n} день`}
        />
        <Swap t={t} y={1130} until={99} items={[cap("сделай таблицу", "сделай"), cap("по вертикали", "вертикали"), cap("по горизонтали", "горизонтали"), cap("по дням", "дням")]} />
      </>
    ),
  ],
  // итог стопкой
  [
    cut("без"),
    (t) => (
      <>
        <Bg kind="black" />
        <StackLines
          t={t}
          lines={[
            { kind: "head", text: "БЕЗ ХАОСА", t: at("без") },
            { kind: "head", text: "БЕЗ ВЫГОРАНИЯ", t: at("без#2") },
            { kind: "script", text: "и без вечного", t: at("без#3") },
            { kind: "head", text: "ЧТО СНЯТЬ?", t: at("что") },
          ]}
        />
      </>
    ),
  ],
  // CTA
  [cut("напиши"), (t) => (<><Bg kind="red" /><Swap t={t} y={850} until={99} items={[[at("напиши"), <div style={capStyle(46)}>напиши</div>]]} /><BigSmear t={t} a={at("старт")} text="СТАРТ" /></>)],
];

// переходы демо: жёсткая склейка, переезд, нырок — вперемешку
const TR: Shot["tr"][] = ["cut", "z", "l", "cut", "u", "z"];
const scenes = (): Shot[] => raw().map(([a, r], i) => ({ a, r, tr: TR[i % TR.length] }));

export const Reel: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const list = scenes();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {ready && t < BODY_END && <Shots t={t} list={list} hits={[at("старт")]} />}
      {CTA && t >= BODY_END && <Ending t={t} start={BODY_END} cfg={CTA} />}
      <Grain t={t} />
      <Handle />
      <Sound shots={list} />
    </AbsoluteFill>
  );
};
