import React from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { useFonts } from "./fonts";
import { Foto, Karta, KKey, Metka, Naklejka, Oblast, Shape, priblizitelno } from "./kit/sputnik";
import kg from "../public/karta/kg.json";
import talas from "../public/karta/talas.json";

// Витрина спутниковой карты (kit/sputnik.tsx): глобус → Кыргызстан (наклейка с флагом) → Талас (флаг области)
// → Манас-Ордо (примерная область пунктиром + фото на булавке) → обратно на глобус. COMP=Karta node stills.mjs out 1 5 …
export const KARTA_DURATION = 22;
const MO = { lon: 72.3814, lat: 42.5262 };

const keys: KKey[] = [
  { t: 0, lon: 40, lat: 30, zoom: 2.3 },
  { t: 2.6, lon: 74.6, lat: 41.3, zoom: 2.75 },
  { t: 5.0, lon: 74.7, lat: 41.25, zoom: 6.55, fly: true },
  { t: 7.6, lon: 74.7, lat: 41.3, zoom: 6.9 },
  { t: 10.0, lon: 71.95, lat: 42.35, zoom: 8.55, fly: true },
  { t: 12.4, lon: 71.95, lat: 42.37, zoom: 8.85 },
  { t: 15.0, lon: MO.lon, lat: MO.lat + 0.006, zoom: 14.3, fly: true },
  { t: 17.6, lon: MO.lon, lat: MO.lat + 0.006, zoom: 14.75 },
  { t: 20.2, lon: 76, lat: 40, zoom: 2.7, fly: true },
  { t: 22, lon: 82, lat: 39, zoom: 2.55 },
];

export const KartaDemo: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill>
      <Karta keys={keys}>
        <Naklejka shape={kg as Shape} img={staticFile("karta/flag-kg.png")} ot={4.0} do={8.4} />
        <Metka lon={74.6} lat={42.87} text="Бишкек" ot={5.6} do={8.2} />
        <Naklejka shape={talas as Shape} img={staticFile("karta/flag-talas.png")} ot={9.2} do={13.4} />
        <Oblast shape={priblizitelno(MO.lon, MO.lat, 0.55, 2, 1.3, 20)} ot={14.6} do={18.6} color="#ff3b30" alpha={0.35} obvodka="#d7ff3a" punktir />
        <Foto lon={MO.lon} lat={MO.lat} src={staticFile("karta/manas-ordo.jpg")} podpis="Манас Ордо" ot={15.4} do={18.6} />
      </Karta>
    </AbsoluteFill>
  );
};
