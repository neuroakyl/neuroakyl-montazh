import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { useFonts } from "./fonts";
import { F, FPS, H, W } from "./lib";
import { BehindText, BigSmall, BlurWords, Breathe, BottomShade, FONT, PullIn, PushCut, blurWord, keyOpts } from "./kit/trend";

/**
 * Повтор рядом с оригиналом (27.11.2026, свод ручного отбора, раздел 8): слева кусок эталона, справа тот же приём деталями kit/trend.tsx
 * на аватаре HeyGen (74-той f1 + вырезка f1-cut.webm), на одном таймкоде. Времена слов сняты с оригинала по кадрам 30 к/с.
 * Файлы — public/povtor/ (куски эталонов ffmpeg -ss -t, аватар). Рендер:
 *   npx remotion render src/index.ts Povtor "../../референсы/ручной-отбор/_повтор/povtor.mp4"
 */
const PW = 720; // ширина панели (эталоны 720×1280)
const PH = 1280;
const TOP = 96;
export const POVTOR_W = PW * 2;
export const POVTOR_H = PH + TOP;

const LIME = "#D2FF3C";
const FR1 = 1 / 30;
/** время по номеру кадра 30 к/с: события сняты с оригинала по кадрам (0,267 ≠ кадр 8 = 0,2667 — слово опоздало бы на кадр) */
const fr = (n: number) => n / 30;
const Vid: React.FC<{ f: string; transparent?: boolean; from?: number }> = ({ f, transparent, from = 0 }) => (
  <OffthreadVideo src={staticFile(`povtor/${f}`)} muted transparent={transparent} trimBefore={Math.round(from * FPS)} style={{ position: "absolute", width: W, height: H, objectFit: "cover" }} />
);

type Seg = { orig: string; len: number; title: string; what: string; render: (t: number) => React.ReactNode };

const SEGS: Seg[] = [
  {
    // 12, 0,00–2,20: старт с 115 % → 100 % за 0,2 с; «If the» мелко слева, «Prospects» лаймом 110→100 % с тусклым 1-м кадром,
    // «have to» справа сверху, «meet you» справа снизу; группа уходит за 1 кадр (1,633), «to» + «Understand».
    orig: "o12a.mp4", len: 2.2, title: "Мелкое + огромное, слово по голосу", what: "эталон 12 · BigSmall (Inter 600/900, aligns, push) + PullIn 1,15",
    render: (t) => (
      <PullIn t={t} a={fr(6)} from={1.15} d={0.2} blur={0} ease="cubic">
        <Breathe t={t} a={0} cuts={[[0, 1.15]]}>
          <Vid f="f1.mp4" />
        </Breathe>
        <BigSmall t={t} ton="dinamichno" y={925} bigW={0.8} ratio={2.4} lead={0.7} out={fr(49)} wordOpts={{ rise: 0, blur: 3, d: 0.07 }}
          aligns={["left", "center", "right"]} dx={[0.03, 0, -0.01]}
          rows={[
            [{ text: "If", t: fr(1), font: "gBold" }, { text: "the", t: fr(4), font: "gBold" }, { text: "have", t: fr(16), push: true, font: "gBold" }, { text: "to", t: fr(18), font: "gBold" }],
            [{ text: "Prospects", t: fr(8), big: true, color: LIME, glow: true, font: "gBold" }],
            [{ text: "meet", t: fr(31), font: "gBold" }, { text: "you", t: fr(33), font: "gBold" }],
          ]} />
        <BigSmall t={t} ton="dinamichno" y={925} bigW={0.82} ratio={2.4} lead={0.7} wordOpts={{ rise: 0, blur: 3, d: 0.07 }} aligns={["left", "center"]} dx={[0.02, 0]}
          rows={[[{ text: "to", t: fr(50), font: "gBold" }], [{ text: "Understand", t: fr(55), big: true, color: LIME, glow: true, font: "gBold" }]]} />
      </PullIn>
    ),
  },
  {
    // 04, 0,30–2,30: план 112 %, строка по словам на своих местах (3 строки, акцент «you» оранжевым, вход 4–5 кадров, подъём 0,6 %,
    // blur 2), «happen» Playfair Black Italic жёлтым градиентом за головой (110→100 % + blur 8 за 0,15 с), уход blur за 0,1 с;
    // на кадре 49 джамп-кат на 100 % и «back» белым гротеском за головой (уход «happen» и строки — кадр 47, 0,1 с).
    orig: "o04.mp4", len: 2.0, title: "Текст за спикером + строка по словам", what: "эталон 04 · BehindText serifBlack from 1,1 + BlurWords (uiMed) + джамп 1,12 → 1",
    render: (t) => {
      const sub = { font: "uiMed" as const, size: 80, ton: "spokoyno" as const, mode: "fast" as const, rise: 0.006, blur: 2, d: 0.15, out: fr(47), outMode: "blur" as const, width: 1060, shadow: "0 2px 6px rgba(0,0,0,.45), 0 3px 16px rgba(0,0,0,.5)" };
      return (
        <Breathe t={t} a={0} cuts={[[0, 1.12], [fr(49), 1]]}>
          <Vid f="f1.mp4" from={0.4} />
          <BehindText t={t} a={fr(8)} text="happen" person={null} font="serifBlack" width={W * 0.96} y={H * 0.4} from={1.1} d={0.15} blur={8} out={fr(47)}
            grad={["#FFE11A", "#F6B700"]} color="#F6B700" />
          <BehindText t={t} a={fr(49)} text="back" person={null} font="ui" width={W * 0.62} y={H * 0.245} from={1.1} d={0.15} blur={8} />
          <Vid f="f1-cut.webm" transparent from={0.4} />
          <BlurWords t={t} {...sub} y={H * 0.505} words={[["What", -1], ["has", -1], ["to", -1], ["happen", fr(6)]]} />
          <BlurWords t={t} {...sub} y={H * 0.505 + 86} words={[["to", fr(15)], ["you", fr(20)], ["so", fr(20)], ["that", fr(33)]]} accent={[1, "#F5A623"]} accentKey={false} />
          <BlurWords t={t} {...sub} y={H * 0.505 + 172} words={[["you", fr(39)], ["turn", fr(39)]]} />
        </Breathe>
      );
    },
  },
  {
    // 12, 4,53–6,17: «You know» мелко слева вверху, «content» огромным лаймом, «matters» справа — всё за головой, вход за 1 кадр.
    orig: "o12b.mp4", len: 1.63, title: "Мелкое + огромное за головой", what: "эталон 12 · BehindText layer = BigSmall, вход 1 кадр, вырезка поверх",
    render: (t) => (
      <Breathe t={t} a={0} cuts={[[0, 1.15]]}>
        <Vid f="f1.mp4" from={1.2} />
        <BigSmall t={t} ton="dinamichno" y={330} bigW={0.82} ratio={2.4} lead={0.7} wordOpts={{ rise: 0, blur: 0, d: FR1 }} keyIn={{ d: FR1, blur: 0, rise: 0 }} aligns={["left", "center", "right"]} dx={[0.01, 0, 0]}
          rows={[
            [{ text: "You", t: 0, font: "gBold" }, { text: "know", t: fr(2), font: "gBold" }],
            [{ text: "content", t: fr(17), big: true, color: LIME, glow: true, font: "gBold" }],
            [{ text: "matters", t: fr(31), font: "gBold" }],
          ]} />
        <Vid f="f1-cut.webm" transparent from={1.2} />
      </Breathe>
    ),
  },
  {
    // 06, 3,50–4,60: «com|munity» (белый → голубой) + «because» бледно-жёлтым тонким; 4,07–4,233 толчок 100 → 125 % с разгоном и смазом,
    // текст едет с планом; на 4,233 голая склейка на новый план, «if» по центру.
    orig: "o06.mp4", len: 1.1, title: "Толчок в склейку", what: "эталон 06 · PushCut 1 → 1,22 за 0,17 с, easeInCubic, blur 10 → голая склейка",
    render: (t) => (
      <PushCut t={t} a={fr(22)} d={0.17} to={1.24} blur={10} nextFrom={1} nextD={0.01}
        next={<><Vid f="s1.mp4" from={0.5} /><BottomShade from={0.6} /><BlurWords t={t} words={[["if", fr(24)]]} font="gMed" size={70} y={H * 0.56} ton="dinamichno" /></>}>
        <Breathe t={t} a={0} cuts={[[0, 1.15]]} rate={0.02}>
          <Vid f="f1.mp4" from={2.2} />
        </Breathe>
        <div style={{ position: "absolute", left: 0, width: W, top: H * 0.5, textAlign: "center", ...FONT.gBold, fontWeight: 700, fontSize: 104, lineHeight: 1 }}>
          <span style={{ color: "#FFFFFF" }}>com</span>
          <span style={{ backgroundImage: "linear-gradient(90deg, #FFFFFF 0%, #7DB7E8 45%, #7DB7E8 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>munity</span>
        </div>
        <div style={{ position: "absolute", left: 0, width: W, top: H * 0.5 + 100, textAlign: "center" }}>
          <span style={{ ...FONT.g, fontWeight: 300, fontSize: 70, display: "inline-block", ...blurWord(t, fr(4), { ...keyOpts("sredne"), blur: 10, rise: 0, color: "#E8E6A8" }) }}>because</span>
        </div>
      </PushCut>
    ),
  },
];

export const POVTOR_DURATION = SEGS.reduce((s, x) => s + x.len, 0);

const Panel: React.FC<{ seg: Seg }> = ({ seg }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: TOP, width: PW, height: PH, overflow: "hidden", background: "#000" }}>
        <OffthreadVideo src={staticFile(`povtor/${seg.orig}`)} style={{ width: PW, height: PH }} />
      </div>
      <div style={{ position: "absolute", left: PW, top: TOP, width: PW, height: PH, overflow: "hidden", background: "#000" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `scale(${PW / W})`, transformOrigin: "0 0", overflow: "hidden" }}>
          <AbsoluteFill style={{ overflow: "hidden" }}>{seg.render(t)}</AbsoluteFill>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, width: POVTOR_W, height: TOP, background: "#0E0E10", display: "flex", alignItems: "center", fontFamily: F.inter }}>
        <div style={{ width: PW, paddingLeft: 28, color: "#9A9A9A", fontSize: 26, fontWeight: 500 }}>
          оригинал · <span style={{ color: "#F4F2E8", fontWeight: 700 }}>{seg.title}</span>
          <div style={{ fontSize: 20, marginTop: 4 }}>t = {t.toFixed(2)} с</div>
        </div>
        <div style={{ width: PW, paddingLeft: 28, color: "#9A9A9A", fontSize: 22, fontWeight: 500 }}>
          <span style={{ color: LIME, fontWeight: 700, fontSize: 26 }}>повтор kit</span>
          <div style={{ marginTop: 4 }}>{seg.what}</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: PW - 1, top: TOP, width: 2, height: PH, background: "#0E0E10" }} />
    </AbsoluteFill>
  );
};

export const Povtor: React.FC = () => {
  const ready = useFonts();
  if (!ready) return null;
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#0E0E10" }}>
      {SEGS.map((s, i) => {
        const f0 = Math.round(from * FPS);
        const n = Math.round(s.len * FPS);
        from += s.len;
        return (
          <Sequence key={i} from={f0} durationInFrames={n}>
            <Panel seg={s} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
