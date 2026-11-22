import type { CtaConfig } from "./kit/cta";
// Что есть у ролика. Включай, когда файл положен в public/ (иначе рендер упадёт на отсутствующем файле).
export const REEL = {
  voice: false, // public/voice.wav — голос (golos.py кладёт в assets/voice.wav, скопируй сюда)
  music: false, // public/music.wav — подложка (из библиотеки musiclib.py)
  musicDb: -15, // музыка под голосом на 15 дБ тише (правило Бобби 10.11); в паузах ≥0,8 с сама поднимается на 5 дБ (sound.tsx, kit/profi.ts ZVUK)
};

// Готовая концовка с призывом (kit/cta.tsx): null — без неё. Две версии одного ролика: kind "comments" (Instagram) и "link".
export const CTA: CtaConfig | null = null;
