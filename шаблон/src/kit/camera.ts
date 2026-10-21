// Камера для 3D (three.js / @remotion/three) по ключам — без рывков (ролик «шаги», 21.10.2026).
// Было: плавность внутри каждого отрезка → камера тормозила и разгонялась на каждом ключе («дёрганая»).
// Стало: одна кривая Катмулла — Рома через все ключи, разгон только в начале и торможение в конце;
// ключи ближе 0,9 с выкидываются (короткие фразы другого языка сжимают их — камера рвалась).
// Использование: const cam = camAt(keys, t); <Cam p={cam.p} look={cam.look} fov={cam.fov} /> (lookAt + fov в useThree).
export type V3 = [number, number, number];
export type CamKey = { t: number; p: V3; look: V3; fov?: number };

const cr = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
const cr3 = (a: V3, b: V3, c: V3, d: V3, u: number) => a.map((_, i) => cr(a[i], b[i], c[i], d[i], u)) as V3;
const easeIn = (u: number) => u * u * (2 - u) * 0.5 + u * 0.5;
const easeOut = (u: number) => 1 - easeIn(1 - u);
const smooth = (u: number) => u * u * (3 - 2 * u);

export function camAt(raw: CamKey[], t: number, minGap = 0.9): { p: V3; look: V3; fov: number } {
  let f = raw[0].fov ?? 35;
  const filled = raw.map((k) => ({ ...k, fov: (f = k.fov ?? f) }));
  const keys = filled.filter((k, i) => i === 0 || i === filled.length - 1 || k.t - filled[i - 1].t >= minGap);
  const n = keys.length;
  if (t <= keys[0].t) return { p: keys[0].p, look: keys[0].look, fov: keys[0].fov };
  if (t >= keys[n - 1].t) return { p: keys[n - 1].p, look: keys[n - 1].look, fov: keys[n - 1].fov };
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(n - 1, i + 2)];
  let u = (t - b.t) / (c.t - b.t);
  if (i === 0) u = easeIn(u);
  if (i === n - 2) u = easeOut(u);
  return { p: cr3(a.p, b.p, c.p, d.p, u), look: cr3(a.look, b.look, c.look, d.look, u), fov: b.fov + (c.fov - b.fov) * smooth(u) };
}
