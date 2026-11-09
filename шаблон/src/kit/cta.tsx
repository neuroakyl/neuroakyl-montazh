import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile } from "remotion";
import { F, FPS, back, clamp, has, k, lerp, sharp } from "../lib";

/**
 * Готовая концовка с призывом — две версии одного ролика (сдача двумя концовками, правило в SKILL.md):
 *   "comments" — для Instagram: снизу шторка комментариев, люди пишут кодовое слово, зритель печатает его и отправляет;
 *   "link"     — для YouTube/TikTok: карточка профиля за спиной человека (вырезка поверх), рука кликает по ссылке.
 * Человек говорит концовку на своём видео (аватар или съёмка), моменты (секунды от начала концовки) берутся по его словам.
 *
 *   settings.ts:  export const CTA: CtaConfig | null = { kind: "comments", video: "cta-insta.mp4", audio: "cta-insta.wav", len: 7.7,
 *                   keyword: "СТАРТ", nick: "my.nick", times: { in: 3.8, type: 6.7, send: 7.3 }, ui: UI_KG };
 *   Reel.tsx:     {CTA && t >= BODY_END && <Ending t={t} start={BODY_END} cfg={CTA} />}   — длина ролика и звук считаются сами
 *
 * Файлы в public/: видео концовки; для link — вырезка человека с альфой (*.webm, инструменты/vyrezat.swift) и фото профиля;
 * рука — img/hand.webp (нет файла — рисуется эмодзи 👆).
 */
export type CtaUi = { comments: string; add: string; send: string; reply: string; follow: string; message: string; you: string; now: string; link: string };
export const UI_RU: CtaUi = { comments: "Комментарии", add: "Добавьте комментарий…", send: "Отправить", reply: "Ответить", follow: "Подписаться", message: "Сообщение", you: "ты", now: "сейчас", link: "ссылка" };
export const UI_KG: CtaUi = { comments: "Комментарийлер", add: "Комментарий кошуу…", send: "Жөнөтүү", reply: "Жооп берүү", follow: "Жазылуу", message: "Билдирүү", you: "сен", now: "азыр", link: "шилтеме" };

export type CtaComment = { at: number; user: string; text: string; likes: number; time?: string; colors?: [string, string] };
export type CtaConfig = {
  kind: "comments" | "link";
  video?: string; // public/<video> — человек говорит концовку (видео без звука)
  audio?: string; // public/<audio> — звук концовки (wav, −16 LUFS как голос); нет — берётся звук из video
  len: number; // длина концовки, с
  keyword: string; // кодовое слово в комментарии
  nick: string;
  role?: string; // строка под ником в карточке
  bio?: string;
  linkLine?: string; // «Жми на ссылку» над ссылкой
  photo?: string; // public/<photo> — аватарка профиля
  cut?: string; // public/<cut>.webm с альфой — человек поверх карточки
  comments?: CtaComment[]; // чужие комментарии (вымышленные ники, без чужих фото)
  times: { in: number; type?: number; send?: number; link?: number; click?: number };
  ui?: CtaUi;
  accent?: string; // "#RRGGBB"
};

const IG_BLUE = "#4C9EFF";

const Heart: React.FC<{ on?: boolean; size?: number }> = ({ on, size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? "#FF3B5C" : "none"} stroke={on ? "#FF3B5C" : "rgba(255,255,255,0.7)"} strokeWidth="2">
    <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 4.2 2.4C11.8 6.1 13.2 5 15.2 5c3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z" />
  </svg>
);
// аватарка вымышленного аккаунта: градиент + буква
const Ava: React.FC<{ letter: string; c: [string, string]; size?: number }> = ({ letter, c, size = 76 }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, background: `linear-gradient(135deg, ${c[0]}, ${c[1]})`, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.ui, fontWeight: 800, fontSize: size * 0.42, color: "#fff" }}>
    {letter.toUpperCase()}
  </div>
);
const PALS: [string, string][] = [["#FF7A45", "#FF2E63"], ["#7B5CFF", "#3BC9FF"], ["#1FD1A5", "#0A84FF"], ["#FFB020", "#FF5E3A"]];

const Row: React.FC<{ u: number; c: CtaComment; mine?: boolean; ui: CtaUi; accent: string; i: number }> = ({ u, c, mine, ui, accent, i }) => {
  if (u < c.at - 0.01) return null;
  const p = interpolate(u, [c.at, c.at + 0.25], [0, 1], { ...clamp, easing: back });
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 24, padding: "18px 40px", opacity: Math.min(1, p * 2.5), transform: `translateY(${lerp(30, 0, p)}px)`, background: mine ? `${accent}14` : undefined }}>
      <Ava letter={c.user[0]} c={c.colors ?? PALS[i % PALS.length]} />
      <div style={{ flex: 1, fontFamily: F.ui }}>
        <div style={{ fontSize: 28, color: "rgba(255,255,255,0.95)", fontWeight: 700 }}>
          {c.user} <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.45)", marginLeft: 8 }}>{c.time ?? ""}</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, color: mine ? accent : "#fff", marginTop: 6 }}>{c.text}</div>
        <div style={{ fontSize: 24, color: "rgba(255,255,255,0.45)", marginTop: 8, fontWeight: 600 }}>{ui.reply}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 14 }}>
        <Heart on={!mine && u > c.at + 0.6} />
        <div style={{ fontFamily: F.ui, fontSize: 22, color: "rgba(255,255,255,0.5)" }}>{c.likes}</div>
      </div>
    </div>
  );
};

const CommentsSheet: React.FC<{ u: number; cfg: CtaConfig; ui: CtaUi; accent: string }> = ({ u, cfg, ui, accent }) => {
  const IN = cfg.times.in;
  const TYPE = cfg.times.type ?? IN + 2.9;
  const SEND = cfg.times.send ?? TYPE + 0.6;
  if (u < IN - 0.02) return null;
  const s = k(u, IN, 0.35, sharp);
  const word = cfg.keyword;
  const n = Math.max(0, Math.min(word.length, Math.floor((u - TYPE) / 0.08) + 1));
  const caret = Math.floor(u * 2.5) % 2 === 0;
  const sent = u >= SEND;
  const press = u >= SEND - 0.05 && u < SEND + 0.1 ? 0.9 : 1;
  const list = cfg.comments ?? [
    { at: IN + 0.2, user: "aibek.creator", time: "2m", text: word, likes: 24 },
    { at: IN + 0.7, user: "nurai_content", time: "5m", text: word, likes: 18 },
    { at: IN + 1.2, user: "erlan.reels", time: "9m", text: `${word} 🔥`, likes: 11 },
  ];
  const mine: CtaComment = { at: SEND + 0.05, user: ui.you, time: ui.now, text: word, likes: 0, colors: [accent, accent] };
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1130, bottom: 0, transform: `translateY(${lerp(800, 0, s)}px)` }}>
      <div style={{ position: "absolute", inset: 0, background: "#101012", borderRadius: "44px 44px 0 0", boxShadow: "0 -20px 60px rgba(0,0,0,0.55)" }} />
      <div style={{ position: "relative" }}>
        <div style={{ width: 90, height: 9, borderRadius: 5, background: "rgba(255,255,255,0.3)", margin: "18px auto 0" }} />
        <div style={{ fontFamily: F.ui, fontWeight: 800, fontSize: 32, color: "#fff", textAlign: "center", padding: "20px 0 18px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>{ui.comments}</div>
        {sent && <Row u={u} c={mine} mine ui={ui} accent={accent} i={0} />}
        {list.map((c, i) => (
          <Row key={c.user} u={u} c={c} ui={ui} accent={accent} i={i} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 150, background: "#101012", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: 22, padding: "0 34px 20px" }}>
        <Ava letter={ui.you[0]} c={[accent, accent]} size={70} />
        <div style={{ flex: 1, height: 84, borderRadius: 42, border: `2px solid ${n ? accent : "rgba(255,255,255,0.22)"}`, display: "flex", alignItems: "center", padding: "0 30px", fontFamily: F.ui, whiteSpace: "nowrap" }}>
          {sent || !n ? (
            <span style={{ fontSize: 32, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{ui.add}</span>
          ) : (
            <span style={{ fontSize: 40, color: accent, fontWeight: 900, letterSpacing: "0.04em" }}>
              {word.slice(0, n)}
              {caret && <span style={{ color: "#fff", fontWeight: 300 }}>|</span>}
            </span>
          )}
        </div>
        <div style={{ fontFamily: F.ui, fontWeight: 800, fontSize: 32, color: n === word.length && !sent ? IG_BLUE : "rgba(76,158,255,0.35)", transform: `scale(${press})` }}>{ui.send}</div>
      </div>
    </div>
  );
};

const CARD_TOP = 140;
const ProfileCard: React.FC<{ u: number; cfg: CtaConfig; ui: CtaUi; accent: string }> = ({ u, cfg, ui, accent }) => {
  const IN = cfg.times.in;
  const LINK = cfg.times.link ?? IN + 1;
  const CLICK = cfg.times.click ?? LINK + 0.5;
  if (u < IN - 0.02) return null;
  const cu = interpolate(u, [IN, IN + 0.3], [0, 1], { ...clamp, easing: back });
  const lu = k(u, LINK, 0.2, sharp);
  const press = u >= CLICK && u < CLICK + 0.16 ? 0.94 : 1;
  const ring = k(u, CLICK, 0.45, sharp);
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top: CARD_TOP, opacity: Math.min(1, cu * 3), transform: `translateY(${lerp(120, 0, cu)}px) scale(${lerp(0.8, 1, cu)})` }}>
      <div style={{ borderRadius: 44, background: "rgba(14,14,16,0.94)", border: "2px solid rgba(255,255,255,0.12)", padding: "30px 40px 36px", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", fontFamily: F.ui }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ width: 150, height: 150, borderRadius: 75, padding: 6, background: "linear-gradient(135deg, #FEDA75, #FA7E1E, #D62976, #962FBF)", flex: "none" }}>
            {cfg.photo ? (
              <Img src={staticFile(cfg.photo)} style={{ width: 138, height: 138, borderRadius: 69, border: "5px solid #0E0E10", objectFit: "cover" }} />
            ) : (
              <Ava letter={cfg.nick[0]} c={[accent, "#333"]} size={138} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 46, color: "#fff" }}>{cfg.nick}</div>
            <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
              <div style={{ background: IG_BLUE, color: "#fff", fontWeight: 700, fontSize: 28, borderRadius: 16, padding: "12px 30px" }}>{ui.follow}</div>
              <div style={{ background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, fontSize: 28, borderRadius: 16, padding: "12px 30px" }}>{ui.message}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 24, color: "#fff", fontSize: 32, lineHeight: 1.35 }}>
          {cfg.role && <div style={{ fontWeight: 800 }}>{cfg.role}</div>}
          {cfg.bio && <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.88)" }}>{cfg.bio}</div>}
          {cfg.linkLine && <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.88)" }}>{cfg.linkLine} 👇</div>}
        </div>
        <div
          style={{
            marginTop: 18,
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 24px",
            borderRadius: 22,
            position: "relative",
            background: `${accent}${Math.round((0.06 + lu * 0.16) * 255).toString(16).padStart(2, "0")}`,
            border: `3px solid ${accent}`,
            boxShadow: `0 0 ${lu * 40}px ${accent}88`,
            transform: `scale(${press})`,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <div style={{ fontWeight: 800, fontSize: 36, color: accent, textDecoration: "underline", textUnderlineOffset: 8 }}>{ui.link}</div>
          {u >= CLICK && (
            <div style={{ position: "absolute", left: 110, top: "50%", width: 40, height: 40, marginTop: -20, marginLeft: -20, borderRadius: 40, border: `5px solid ${accent}`, transform: `scale(${lerp(0.5, 5, ring)})`, opacity: 1 - ring }} />
          )}
        </div>
      </div>
    </div>
  );
};

// рука поверх всего: кончик пальца приходит в ссылку
const Hand: React.FC<{ u: number; cfg: CtaConfig }> = ({ u, cfg }) => {
  const LINK = cfg.times.link ?? cfg.times.in + 1;
  const CLICK = cfg.times.click ?? LINK + 0.5;
  if (u < LINK) return null;
  const hu = interpolate(u, [LINK + 0.05, CLICK - 0.02], [0, 1], { ...clamp, easing: sharp });
  const press = u >= CLICK && u < CLICK + 0.16 ? 0.9 : 1;
  const style: React.CSSProperties = { position: "absolute", width: 150, height: 150, left: lerp(860, 125, hu), top: lerp(900, 500, hu), filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.6))" };
  return has("img/hand.webp") ? (
    <Img src={staticFile("img/hand.webp")} style={{ ...style, transform: `rotate(-35deg) scale(${press})` }} />
  ) : (
    <div style={{ ...style, fontSize: 130, lineHeight: "150px", transform: `scale(${press})` }}>👆</div>
  );
};

/** t — время ролика, start — где начинается концовка (обычно последнее слово тела + 0,35 с) */
export const Ending: React.FC<{ t: number; start: number; cfg: CtaConfig }> = ({ t, start, cfg }) => {
  const u = t - start;
  const ui = cfg.ui ?? UI_RU;
  const accent = cfg.accent ?? "#D4FF3A";
  const link = cfg.kind === "link";
  const zoom = lerp(1.08, 1, k(u, 0, 0.4, sharp)) + Math.min(0.03, u * 0.004);
  const from = Math.round(start * FPS);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {/* своё время с начала концовки: без Sequence видео берёт время всего ролика и стоит на последнем кадре */}
        {cfg.video ? (
          <Sequence from={from} layout="none">
            <OffthreadVideo src={staticFile(cfg.video)} muted={!!cfg.audio} style={{ position: "absolute", width: 1080, height: 1920, objectFit: "cover" }} />
          </Sequence>
        ) : (
          <AbsoluteFill style={{ background: "radial-gradient(120% 80% at 50% 35%, #2A2A33 0%, #0B0B0E 70%)" }} />
        )}
        {link && <ProfileCard u={u} cfg={cfg} ui={ui} accent={accent} />}
        {link && cfg.cut && (
          <Sequence from={from} layout="none">
            <OffthreadVideo src={staticFile(cfg.cut)} transparent muted style={{ position: "absolute", width: 1080, height: 1920 }} />
          </Sequence>
        )}
      </AbsoluteFill>
      {link ? <Hand u={u} cfg={cfg} /> : <CommentsSheet u={u} cfg={cfg} ui={ui} accent={accent} />}
    </AbsoluteFill>
  );
};
