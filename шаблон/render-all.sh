#!/bin/bash
# render-all.sh [insta,link] — лежит в папке ролика (рядом с движок/). Обе версии за ОДИН рендер тела (движок/render2.mjs),
# потом сдача каждой: обложка + проверка уровня + −14 LUFS (deliver.py). Ждёт общий замок: два рендера разом мак не тянет.
VERSII="${1:-insta,link}"
ROLIK="$(cd "$(dirname "$0")" && pwd)"; NAME="$(basename "$ROLIK")"
NAVYK="$ROLIK/../навык-монтаж"
cd "$ROLIK/движок" || exit 1
until mkdir /tmp/render-lock 2>/dev/null; do sleep 30; done
trap 'rmdir /tmp/render-lock 2>/dev/null' EXIT
echo "$(date '+%F %T') замок взят $VERSII" >> ../время.txt
source "$NAVYK/.venv/bin/activate"
node render2.mjs .. "$VERSII"; rc=$?
echo "$(date '+%F %T') рендер $VERSII rc=$rc" >> ../время.txt
[ $rc -eq 0 ] || exit $rc
for V in ${VERSII//,/ }; do
  python3 -I "$NAVYK/инструменты/deliver.py" "../out-$V.mp4" "../out-$V.wav" ../cover.jpg "../$NAME-$V.mp4" || exit 1
  echo "$(date '+%F %T') готово $V" >> ../время.txt
done
