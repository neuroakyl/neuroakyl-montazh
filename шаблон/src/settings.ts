// Что есть у ролика. Включай, когда файл положен в public/ (иначе рендер упадёт на отсутствующем файле).
export const REEL = {
  voice: false, // public/voice.wav — голос (golos.py кладёт в assets/voice.wav, скопируй сюда)
  music: false, // public/music.wav — подложка (из библиотеки musiclib.py)
  musicDb: -22, // громкость музыки относительно банка
};
