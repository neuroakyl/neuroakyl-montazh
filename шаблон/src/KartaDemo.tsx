import React from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { useFonts } from "./fonts";
import { Foto, Karta, KKey, Metka, Naklejka, Oblast, Shape, priblizitelno } from "./kit/sputnik";
import kg from "../public/karta/kg.json";
import talas from "../public/karta/talas.json";

// Витрина спутниковой карты (kit/sputnik.tsx): старт с глобуса (Karta) или сразу с карты Средней Азии (KartaAziya)
// → Кыргызстан под углом (флаг на ветру) → Талас → Манас-Ордо (примерная область пунктиром + фото) → отлёт.
// Материалы: karta.py globus / granica / kartinka (public/karta/). COMP=Karta node stills.mjs out 1 5 …
export const KARTA_DURATION = 19;
const MO = { lon: 72.3814, lat: 42.5262 };

const route: KKey[] = [
  { t: 2.3, lon: 74.4, lat: 41.15, zoom: 6.2, tilt: 26, fly: true, ease: "out" },
  { t: 4.4, lon: 74.4, lat: 41.2, zoom: 6.42, tilt: 30 },
  { t: 6.8, lon: 71.95, lat: 42.25, zoom: 8.4, tilt: 30, fly: true },
  { t: 9.2, lon: 71.95, lat: 42.28, zoom: 8.7, tilt: 33 },
  { t: 11.8, lon: MO.lon, lat: MO.lat, zoom: 14.3, tilt: 35, fly: true },
  { t: 14.4, lon: MO.lon, lat: MO.lat + 0.002, zoom: 14.7, tilt: 38 },
  { t: 17.0, lon: 76, lat: 40, zoom: 2.7, tilt: 0, fly: true },
  { t: 19, lon: 82, lat: 39, zoom: 2.55 },
];
const START = {
  globus: { t: 0, lon: 48, lat: 30, zoom: 2.45 },
  aziya: { t: 0, lon: 66, lat: 45, zoom: 4.1 },
};

export const KartaDemo: React.FC<{ start?: "globus" | "aziya" }> = ({ start = "globus" }) => {
  useFonts();
  // с глобуса: 0,8 с Земля поворачивается к месту, к 2,3 с — уже страна; с карты — сразу полёт к стране
  const keys: KKey[] = start === "globus" ? [START.globus, { t: 0.8, lon: 72, lat: 40, zoom: 2.85 }, ...route] : [START.aziya, ...route];
  if (start === "aziya") keys[keys.length - 2] = { ...keys[keys.length - 2], lon: 70, lat: 44, zoom: 4.1 };
  if (start === "aziya") keys[keys.length - 1] = { ...keys[keys.length - 1], lon: 71, lat: 44, zoom: 4.0 };
  return (
    <AbsoluteFill>
      <Karta keys={keys} globus={start === "globus"}>
        <Naklejka shape={kg as Shape} img={staticFile("karta/flag-kg.png")} ot={1.2} do={6.9} />
        <Metka lon={74.6} lat={42.87} text="Бишкек" ot={2.8} do={6.7} />
        <Naklejka shape={talas as Shape} img={staticFile("karta/flag-talas.png")} ot={6.0} do={10.3} />
        <Oblast shape={priblizitelno(MO.lon, MO.lat, 0.55, 2, 1.3, 20)} ot={11.4} do={15.4} color="#ff3b30" alpha={0.35} obvodka="#d7ff3a" punktir />
        <Foto lon={MO.lon} lat={MO.lat} src={staticFile("karta/manas-ordo.jpg")} podpis="Манас Ордо" ot={12.0} do={15.4} />
      </Karta>
    </AbsoluteFill>
  );
};
