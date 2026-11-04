// Спутниковая карта: глобус → подлёт до улиц → «наклейка» места (референс @august_geographic, разбор 04.11.2026).
// Плитки Esri World Imagery грузятся сами (<Img> ждёт загрузку), глобус — WebGL-шейдер по public/karta/globus.jpg
// (python3 -I инструменты/karta.py globus <движок>/public). Живая веб-карта в Remotion дрожит на движении — тут её нет:
// каждый кадр собирается из плиток двух уровней с плавной сменой, кадр детерминирован.
// Рендер с WebGL: chromiumOptions { gl: "angle" } (render.mjs / stills.mjs уже так).
//
//   <Karta keys={[{ t: 0, lon: 45, lat: 25, zoom: 2 }, { t: 3, lon: 74.6, lat: 41.4, zoom: 6.6, fly: true }]}>
//     <Naklejka shape={kg} img={staticFile("karta/flag-kg.png")} ot={2.2} do={7} />
//   </Karta>
// zoom: 2–5 глобус (на 5–5,5 сам переходит в плоскую карту), 5–7 страна, 8–9 область, 11–13 город, 15–17 улицы. fly: true — полёт «отлёт → перелёт → подлёт».
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export type KCam = { lon: number; lat: number; zoom: number; bearing?: number; tilt?: number };
export type KKey = KCam & { t: number; fly?: boolean };
export type Shape = number[][][]; // [[[lon, lat], …], …] — контуры (karta.py granica)

const TILE = 256;
const PI = Math.PI;
const ESRI = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const mx = (lon: number) => (lon + 180) / 360;
const my = (lat: number) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * PI);
};
const unmx = (x: number) => x * 360 - 180;
const unmy = (y: number) => (360 / PI) * Math.atan(Math.exp((0.5 - y) * 2 * PI)) - 90;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const cl = (u: number) => Math.max(0, Math.min(1, u));
export const sm = (a: number, b: number, x: number) => {
  const u = cl((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const inOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// ── камера ─────────────────────────────────────────────────────────────────────
// Полёт ван Вейка (как flyTo в веб-картах): отдаление ровно настолько, чтобы перелёт выглядел одним движением.
function flight(a: KCam, b: KCam, s01: number, view = 1920) {
  const rho = 1.42, rho2 = rho * rho;
  const w0 = view / (TILE * 2 ** a.zoom), w1 = view / (TILE * 2 ** b.zoom);
  const x0 = mx(a.lon), y0 = my(a.lat), x1 = mx(b.lon), y1 = my(b.lat);
  const u1 = Math.hypot(x1 - x0, y1 - y0);
  if (u1 < 1e-7) return { x: lerp(x0, x1, s01), y: lerp(y0, y1, s01), zoom: lerp(a.zoom, b.zoom, s01) };
  const bi = (i: number) => (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (i ? w1 : w0) * rho2 * u1);
  const ri = (i: number) => {
    const b = bi(i);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };
  const r0 = ri(0), S = (ri(1) - r0) / rho, s = s01 * S;
  const w = (w0 * Math.cosh(r0)) / Math.cosh(rho * s + r0);
  const k = (w0 * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0))) / rho2 / u1;
  return { x: lerp(x0, x1, k), y: lerp(y0, y1, k), zoom: a.zoom + Math.log2(w0 / w) };
}

// Ключи: между обычными — медленный дрейф (наезд, сдвиг), к ключу с fly — полёт с разгоном и торможением.
// Дрейф без торможения на каждом ключе: кадр не «застывает».
export function kamera(keys: KKey[], t: number): KCam {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[n - 1].t) return keys[n - 1];
  let i = 0;
  while (t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const raw = (t - a.t) / (b.t - a.t);
  const prevFly = i === 0 || a.fly, nextFly = i === n - 2 || keys[i + 2]?.fly;
  const u = b.fly ? inOut(raw) : prevFly && nextFly ? sm(0, 1, raw) : prevFly ? 1 - (1 - raw) ** 2 : nextFly ? raw * raw : raw;
  const bearing = lerp(a.bearing ?? 0, b.bearing ?? 0, u), tilt = lerp(a.tilt ?? 0, b.tilt ?? 0, u);
  if (b.fly) {
    const f = flight(a, b, u);
    return { lon: unmx(f.x), lat: unmy(f.y), zoom: f.zoom, bearing, tilt };
  }
  return { lon: unmx(lerp(mx(a.lon), mx(b.lon), u)), lat: unmy(lerp(my(a.lat), my(b.lat), u)), zoom: lerp(a.zoom, b.zoom, u), bearing, tilt };
}

// ── проекция ───────────────────────────────────────────────────────────────────
// Глобус и плоская карта сшиты по масштабу в центре кадра; flat — доля плоской карты. Смена — когда глобус уже
// в 2–2,6 раза больше кадра (zoom ≈ 5–5,5): края кадра почти не искривлены, «призрака» растянутой карты мира нет.
const globeR = (cam: KCam) => (TILE * 2 ** cam.zoom) / (2 * PI) / Math.cos((cam.lat * PI) / 180);
export const flatShare = (cam: KCam, w: number, h: number) => sm(2.0, 2.6, globeR(cam) / (Math.hypot(w, h) / 2));

type Ctx = { cam: KCam; flat: number; w: number; h: number; t: number };
const KartaCtx = createContext<Ctx>({ cam: { lon: 0, lat: 0, zoom: 3 }, flat: 1, w: 1080, h: 1920, t: 0 });
export const useKarta = () => useContext(KartaCtx);

export function proj(c: Ctx, lon: number, lat: number) {
  const { cam, w, h, flat } = c;
  const S = TILE * 2 ** cam.zoom;
  const fx = w / 2 + (mx(lon) - mx(cam.lon)) * S, fy = h / 2 + (my(lat) - my(cam.lat)) * S;
  if (flat >= 1) return { x: fx, y: fy, vis: true };
  const R = globeR(cam), f0 = (cam.lat * PI) / 180, f = (lat * PI) / 180, dl = ((lon - cam.lon) * PI) / 180;
  const gx = w / 2 + R * Math.cos(f) * Math.sin(dl);
  const gy = h / 2 - R * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(dl));
  const vis = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(dl) > 0;
  return { x: lerp(gx, fx, flat), y: lerp(gy, fy, flat), vis };
}

// ── плитки ─────────────────────────────────────────────────────────────────────
const Plitki: React.FC<{ cam: KCam; level: number; opacity: number; w: number; h: number }> = ({ cam, level, opacity, w, h }) => {
  const n = 2 ** level, s = 2 ** (cam.zoom - level);
  const cx = mx(cam.lon) * n * TILE, cy = my(cam.lat) * n * TILE;
  const m = 1 + (cam.tilt ?? 0) / 22;
  const r = cam.bearing ? Math.hypot(w, h) / 2 : 0;
  const hx = (r || w / 2) * m, hy = (r || h / 2) * m;
  const tiles: React.ReactNode[] = [];
  const y0 = Math.max(0, Math.floor((cy - hy / s) / TILE)), y1 = Math.min(n - 1, Math.floor((cy + hy / s) / TILE));
  const x0 = Math.floor((cx - hx / s) / TILE), x1 = Math.floor((cx + hx / s) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n;
      tiles.push(
        <Img
          key={`${level}-${tx}-${ty}`}
          src={ESRI(level, wx, ty)}
          maxRetries={6}
          style={{ position: "absolute", left: w / 2 + (tx * TILE - cx) * s, top: h / 2 + (ty * TILE - cy) * s, width: TILE * s + 1, height: TILE * s + 1 }}
        />,
      );
    }
  return <AbsoluteFill style={{ opacity }}>{tiles}</AbsoluteFill>;
};

// ── глобус (WebGL) ─────────────────────────────────────────────────────────────
const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FS = `precision highp float;
uniform sampler2D tex;uniform vec2 ctr;uniform vec2 c;uniform float R;
const float PI=3.14159265;const float ML=1.4844;
void main(){
  vec2 q=(gl_FragCoord.xy-ctr)/R;float rho=length(q);
  vec3 col=vec3(0.);float a=0.;
  if(rho<1.){
    float cc=asin(rho),sc=sin(cc),co=cos(cc);
    float lat=rho<1e-6?c.y:asin(co*sin(c.y)+q.y*sc*cos(c.y)/rho);
    float lon=c.x+atan(q.x*sc,rho*co*cos(c.y)-q.y*sc*sin(c.y));
    float ml=clamp(lat,-ML,ML);
    vec2 uv=vec2(fract((lon+PI)/(2.*PI)),0.5-log(tan(PI/4.+ml/2.))/(2.*PI));
    col=texture2D(tex,uv).rgb;
    float z=sqrt(1.-rho*rho);
    col*=.5+.5*pow(z,.55);
    col=mix(col,vec3(.38,.62,1.),.45*pow(1.-z,3.));
    a=smoothstep(1.,1.-1.6/R,rho);
  }
  float g=rho>1.?exp(-(rho-1.)*R/26.):1.;
  vec3 glow=vec3(.32,.6,1.)*g*.85;
  gl_FragColor=vec4(col*a+glow*(1.-a),a+g*.85*(1.-a));
}`;

const Globus: React.FC<{ cam: KCam; w: number; h: number; grade: string }> = ({ cam, w, h, grade }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const gl = useRef<{ g: WebGLRenderingContext; prog: WebGLProgram } | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("globus"));
  useLayoutEffect(() => {
    const g = ref.current!.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: true })!;
    const sh = (type: number, src: string) => {
      const s = g.createShader(type)!;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = g.createProgram()!;
    g.attachShader(prog, sh(g.VERTEX_SHADER, VS));
    g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS));
    g.linkProgram(prog);
    g.useProgram(prog);
    const buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(prog, "p");
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    const img = new Image();
    img.onload = () => {
      const t = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, t);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, img);
      g.generateMipmap(g.TEXTURE_2D);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      gl.current = { g, prog };
      setReady(true);
      continueRender(handle);
    };
    img.src = staticFile("karta/globus.jpg");
  }, [handle]);
  useLayoutEffect(() => {
    if (!ready || !gl.current) return;
    const { g, prog } = gl.current;
    g.viewport(0, 0, w, h);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    g.uniform2f(g.getUniformLocation(prog, "ctr"), w / 2, h / 2);
    g.uniform2f(g.getUniformLocation(prog, "c"), (cam.lon * PI) / 180, (cam.lat * PI) / 180);
    g.uniform1f(g.getUniformLocation(prog, "R"), globeR(cam));
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  });
  return <canvas ref={ref} width={w} height={h} style={{ position: "absolute", inset: 0, filter: grade }} />;
};

// ── карта целиком ──────────────────────────────────────────────────────────────
// grade — цвет снимков: по умолчанию темнее и сочнее (как у референса), "" — как есть.
export const Karta: React.FC<{ keys: KKey[]; children?: React.ReactNode; grade?: string; istochnik?: boolean; fon?: string }> = ({
  keys, children, grade = "contrast(1.12) saturate(1.22) brightness(0.86)", istochnik = true,
  fon = "radial-gradient(ellipse 70% 50% at 50% 50%, #0d1a38 0%, #03060f 100%)",
}) => {
  const frame = useCurrentFrame();
  const { fps, width: w, height: h } = useVideoConfig();
  const t = frame / fps;
  const cam = kamera(keys, t);
  const flat = flatShare(cam, w, h);
  const L = Math.min(18, Math.max(1, Math.floor(cam.zoom)));
  const fine = sm(0, 0.35, cam.zoom - L);
  const plane: React.CSSProperties = {
    transform: `perspective(1700px) rotateX(${cam.tilt ?? 0}deg) rotateZ(${-(cam.bearing ?? 0)}deg)`,
    transformOrigin: "50% 50%",
  };
  return (
    <AbsoluteFill style={{ background: fon, overflow: "hidden" }}>
      {flat < 1 && <Globus cam={cam} w={w} h={h} grade={grade} />}
      {flat > 0 && (
        <AbsoluteFill style={{ ...plane, opacity: flat, filter: grade }}>
          <Plitki cam={cam} level={L} opacity={1} w={w} h={h} />
          {fine > 0.01 && L < 18 && <Plitki cam={cam} level={L + 1} opacity={fine} w={w} h={h} />}
        </AbsoluteFill>
      )}
      <KartaCtx.Provider value={{ cam, flat, w, h, t }}>
        <AbsoluteFill style={flat > 0 ? plane : undefined}>{children}</AbsoluteFill>
      </KartaCtx.Provider>
      {istochnik && (
        <div style={{ position: "absolute", left: 24, bottom: 18, fontFamily: "sans-serif", fontSize: 17, fontStyle: "italic", color: "rgba(255,255,255,0.5)" }}>
          © Esri, Maxar, Earthstar Geographics
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── детали поверх карты ────────────────────────────────────────────────────────
const pathOf = (c: Ctx, ring: number[][]) => {
  let d = "";
  for (const [lon, lat] of ring) {
    const p = proj(c, lon, lat);
    d += `${d ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d + "Z";
};
const bboxOf = (c: Ctx, shape: Shape) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ring of shape)
    for (const [lon, lat] of ring) {
      const p = proj(c, lon, lat);
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
let uid = 0;
const useUid = (p: string) => useState(() => `${p}${++uid}`)[0];

// Наклейка места (приём референса): граница проявляется белым → заливка картинкой (флаг, герб, фото, орнамент)
// сверху вниз → неоновая обводка рисуется по контуру → наклейка приподнимается (тень, лёгкий отскок) и чуть покачивается.
// Без img — заливка цветом color. ot/do — секунды ролика.
export const Naklejka: React.FC<{ shape: Shape; img?: string; color?: string; ot: number; do?: number; obvodka?: string; tolshina?: number }> = ({
  shape, img, color = "#e8343a", ot, do: until, obvodka = "#d7ff3a", tolshina = 7,
}) => {
  const c = useKarta();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = useUid("nk");
  const t = c.t - ot;
  if (t < 0 || (until !== undefined && c.t > until)) return null;
  const out = until !== undefined ? sm(until - 0.35, until, c.t) : 0;
  const ghost = sm(0, 0.22, t) * 0.5 + sm(0.18, 0.4, t) * 0.5;
  const fill = sm(0.35, 0.8, t), line = sm(0.5, 1.05, t);
  const lift = spring({ frame: frame - Math.round((ot + 0.45) * fps), fps, config: { damping: 11, stiffness: 140 } });
  const b = bboxOf(c, shape);
  const sway = Math.sin((t - 1) * 1.4) * 0.7 * sm(1, 1.6, t);
  const sc = (1 + 0.035 * lift) * (1 - 0.1 * out);
  const paths = shape.map((r) => pathOf(c, r));
  return (
    <svg width={c.w} height={c.h} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: 1 - out }}>
      <defs>
        <clipPath id={`${id}c`}>{paths.map((d, i) => <path key={i} d={d} />)}</clipPath>
        <clipPath id={`${id}w`}><rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={(b.h + 8) * fill} /></clipPath>
        <filter id={`${id}s`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx={5 * lift} dy={11 * lift} stdDeviation={5} floodColor="#000" floodOpacity={0.6 * cl(lift)} />
        </filter>
        <filter id={`${id}g`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation={6} /></filter>
      </defs>
      <g transform={`translate(${b.cx} ${b.cy}) rotate(${sway}) scale(${sc}) translate(${-b.cx} ${-b.cy})`}>
        <g filter={`url(#${id}s)`}>
          <g clipPath={`url(#${id}c)`}>
            <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="#fff" opacity={ghost} />
            <g clipPath={`url(#${id}w)`}>
              {img ? (
                <image href={img} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill={color} />
              )}
            </g>
          </g>
          {paths.map((d, i) => (
            <path key={i} d={d} pathLength={1} fill="none" stroke={obvodka} strokeWidth={tolshina} strokeLinejoin="round" strokeDasharray={`${line} 1`} />
          ))}
        </g>
        {paths.map((d, i) => (
          <path key={i} d={d} pathLength={1} fill="none" stroke={obvodka} strokeWidth={tolshina * 2.2} strokeDasharray={`${line} 1`} opacity={0.35} filter={`url(#${id}g)`} />
        ))}
      </g>
    </svg>
  );
};

// Область без наклейки: полупрозрачная заливка (подсветка страны, зона влияния, «примерно здесь»)
// и обводка — сплошная или пунктир (punktir — для исторических мест, где граница известна примерно).
export const Oblast: React.FC<{ shape: Shape; ot: number; do?: number; color?: string; alpha?: number; obvodka?: string; punktir?: boolean; tolshina?: number }> = ({
  shape, ot, do: until, color = "#e8343a", alpha = 0.5, obvodka, punktir, tolshina = 6,
}) => {
  const c = useKarta();
  const t = c.t - ot;
  if (t < 0 || (until !== undefined && c.t > until)) return null;
  const vis = sm(0, 0.5, t) * (until !== undefined ? 1 - sm(until - 0.5, until, c.t) : 1);
  const line = sm(0.1, 0.9, t);
  const paths = shape.map((r) => pathOf(c, r));
  return (
    <svg width={c.w} height={c.h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {paths.map((d, i) => <path key={i} d={d} fill={color} opacity={alpha * vis} style={{ mixBlendMode: "multiply" }} />)}
      {paths.map((d, i) => <path key={i} d={d} fill={color} opacity={alpha * 0.35 * vis} />)}
      {obvodka &&
        paths.map((d, i) => (
          <path key={i} d={d} pathLength={punktir ? undefined : 1} fill="none" stroke={obvodka} strokeWidth={tolshina} strokeLinejoin="round" strokeLinecap="round"
            opacity={punktir ? vis * line : vis} strokeDasharray={punktir ? `${tolshina * 2.2} ${tolshina * 1.8}` : `${line} 1`} />
        ))}
    </svg>
  );
};

// Примерная область вокруг точки: живой контур радиусом rKm (seed меняет форму, vytyanutost > 1 — вытянута по ugol).
export function priblizitelno(lon: number, lat: number, rKm: number, seed = 1, vytyanutost = 1, ugol = 0): Shape {
  const pts: number[][] = [];
  const a = (ugol * PI) / 180;
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * 2 * PI;
    const r = rKm * (1 + 0.16 * Math.sin(3 * th + seed) + 0.09 * Math.sin(5 * th + 2.3 * seed) + 0.05 * Math.sin(8 * th + 4.1 * seed));
    const x0 = Math.cos(th) * r * vytyanutost, y0 = Math.sin(th) * r;
    const x = x0 * Math.cos(a) - y0 * Math.sin(a), y = x0 * Math.sin(a) + y0 * Math.cos(a);
    pts.push([lon + x / (111.32 * Math.cos((lat * PI) / 180)), lat + y / 110.57]);
  }
  return [pts];
}

// Фото на булавке: точка на карте → ножка → карточка с фото и подписью выскакивает с отскоком.
export const Foto: React.FC<{ lon: number; lat: number; src: string; ot: number; do?: number; podpis?: string; w?: number; h?: number; font?: string; naklon?: number }> = ({
  lon, lat, src, ot, do: until, podpis, w = 470, h = 330, font = "K-UI", naklon = -3,
}) => {
  const c = useKarta();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = c.t - ot;
  if (t < 0 || (until !== undefined && c.t > until)) return null;
  const p = proj(c, lon, lat);
  const dot = spring({ frame: frame - Math.round(ot * fps), fps, config: { damping: 12 } });
  const pop = spring({ frame: frame - Math.round((ot + 0.18) * fps), fps, config: { damping: 10, stiffness: 150 } });
  const out = until !== undefined ? sm(until - 0.3, until, c.t) : 0;
  const leg = 90 * sm(0.05, 0.3, t);
  const sway = Math.sin(t * 1.2) * 1.2 * sm(0.8, 1.4, t);
  const capH = podpis ? 64 : 0;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: 1 - out }}>
      <div style={{ position: "absolute", left: p.x - 13, top: p.y - 13, width: 26, height: 26, borderRadius: 13, background: "#d7ff3a", border: "4px solid #fff", transform: `scale(${dot})`, boxShadow: "0 4px 12px rgba(0,0,0,.6)" }} />
      <div style={{ position: "absolute", left: p.x - 3, top: p.y - leg, width: 6, height: leg, background: "#fff", borderRadius: 3 }} />
      <div
        style={{
          position: "absolute", left: p.x - w / 2, top: p.y - 90 - h - capH - 20, width: w, padding: 10, background: "#fff", borderRadius: 22,
          boxShadow: "0 18px 40px rgba(0,0,0,.55)", transformOrigin: "50% 100%", transform: `scale(${pop * (1 - 0.15 * out)}) rotate(${naklon + sway}deg)`,
        }}
      >
        <Img src={src} style={{ width: w - 20, height: h, objectFit: "cover", borderRadius: 14, display: "block" }} />
        {podpis && (
          <div style={{ height: capH, lineHeight: `${capH}px`, textAlign: "center", fontFamily: font, fontWeight: 900, fontSize: 34, color: "#111", textTransform: "uppercase" }}>
            {podpis}
          </div>
        )}
      </div>
    </div>
  );
};

// Подпись места: точка + плашка с названием, выезжает из точки.
export const Metka: React.FC<{ lon: number; lat: number; text: string; ot: number; do?: number; font?: string; color?: string; sprava?: boolean }> = ({
  lon, lat, text, ot, do: until, font = "K-UI", color = "#d7ff3a", sprava = true,
}) => {
  const c = useKarta();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = c.t - ot;
  if (t < 0 || (until !== undefined && c.t > until)) return null;
  const p = proj(c, lon, lat);
  if (!p.vis) return null;
  const s = spring({ frame: frame - Math.round(ot * fps), fps, config: { damping: 13 } });
  const out = until !== undefined ? sm(until - 0.3, until, c.t) : 0;
  return (
    <div style={{ position: "absolute", left: p.x, top: p.y, opacity: 1 - out }}>
      <div style={{ position: "absolute", left: -11, top: -11, width: 22, height: 22, borderRadius: 11, background: color, border: "4px solid #111", transform: `scale(${s})` }} />
      <div
        style={{
          position: "absolute", top: -34, [sprava ? "left" : "right"]: 26, whiteSpace: "nowrap", padding: "8px 20px", borderRadius: 14,
          background: "rgba(10,12,20,.82)", border: `3px solid ${color}`, fontFamily: font, fontWeight: 900, fontSize: 40, color: "#fff",
          textTransform: "uppercase", transformOrigin: sprava ? "0 50%" : "100% 50%", transform: `scaleX(${s})`,
        }}
      >
        {text}
      </div>
    </div>
  );
};
