"""Какая музыка в ролике: режет звук на куски по 12 с и спрашивает Shazam (shazamio, бесплатно, без ключа).
  .venv/bin/python инструменты/shazam.py ЗВУК_ИЛИ_ВИДЕО [шаг_секунд=15]
Лучше давать дорожку без голоса (Demucs --two-stems=vocals → no_vocals); пропуски добирать шагом 6 с.
Печатает «м:сс  Исполнитель — Трек» или «—», если не узнал (обычно пэды и звуковые подложки)."""
import asyncio, subprocess, sys, json, os, tempfile
from shazamio import Shazam
src = sys.argv[1]; step = float(sys.argv[2]) if len(sys.argv) > 2 else 15
dur = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src]))
async def main():
    sh = Shazam(); res = []
    t = 0.0
    while t < dur - 5:
        f = tempfile.mktemp(suffix='.mp3')
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-t','12','-i',src,'-ac','1','-ar','44100',f],check=True)
        try:
            r = await sh.recognize(f)
            tr = r.get('track') or {}
            name = f"{tr.get('subtitle','?')} — {tr.get('title','?')}" if tr else '—'
        except Exception as e:
            name = 'ошибка ' + str(e)[:60]
        os.remove(f)
        print(f"{int(t//60)}:{int(t%60):02d}  {name}", flush=True)
        res.append((t, name)); t += step
        await asyncio.sleep(1.2)
asyncio.run(main())
