import { bragClear, darkSquare, lightSquare, night, patron, primary } from './colors';
import { pick, pieceSrc, rand, reduceMotion } from './html';

export type Palette = [string, string, string];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  decay: number;
  gravity: number;
  color?: string;
  img?: HTMLImageElement;
}

export interface Background {
  warp(v?: number): void;
  burst(x: number, y: number, n?: number, palette?: string[]): void;
  fireworks(count?: number, spread?: number): () => void;
  setColors(c: Palette): void;
  size(): { W: number; H: number };
  // fewer effects, for devices that can't keep up
  lite(): void;
}

const pieceImages = (): HTMLImageElement[] =>
  ['wN', 'bN', 'wQ', 'bQ', 'wK', 'bK', 'wP', 'bP'].map(k => {
    const img = new Image();
    img.src = pieceSrc(k[0] as 'w' | 'b', k[1]);
    return img;
  });

type Rgb = [number, number, number];
const hexRgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const mix = (a: Rgb, b: Rgb, k: number): Rgb => a.map((v, i) => v + (b[i] - v) * k) as Rgb;
const css = (c: Rgb) => `rgb(${c.map(Math.round).join(',')})`;
const bgRgb = hexRgb(night);
const squareRgb = [hexRgb(darkSquare), hexRgb(lightSquare)];

interface Floor {
  setColor(hex: string): void;
  warp(v: number): void;
  freeze(): void;
}

// the blue board rolling towards the viewer at night, tinted with the slide colour.
// Low resolution and 30fps: it sits behind a fade, so nobody can tell.
function makeFloor(cv: HTMLCanvasElement): Floor {
  const ctx = cv.getContext('2d', { alpha: false })!;
  const res = 0.5;
  let W = 0;
  let H = 0;
  let offset = 0;
  let speed = 0;
  let from: Rgb = hexRgb(primary);
  let to: Rgb = from;
  let fade = 1;
  let frozen = false;
  let last = 0;

  const resize = () => {
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * res);
    cv.height = Math.round(H * res);
    ctx.setTransform(res, 0, 0, res, 0, 0);
    draw();
  };

  const draw = () => {
    const tint = mix(from, to, fade);
    ctx.fillStyle = css(bgRgb);
    ctx.fillRect(0, 0, W, H);
    const horizon = H * 0.45;
    const f = H * 0.8; // focal length; the camera is 1 square above the floor
    const cx = W / 2;
    for (const parity of [0, 1]) {
      ctx.fillStyle = css(mix(bgRgb, mix(squareRgb[parity], tint, 0.4), parity ? 0.16 : 0.1));
      ctx.beginPath();
      for (let r = Math.floor(offset) + 1; r < offset + 26; r++) {
        const z1 = r - offset;
        const z2 = z1 + 1;
        const y1 = horizon + f / z2;
        const y2 = Math.min(H, horizon + f / z1);
        if (y1 > H) continue;
        const half = Math.ceil((cx * z2) / f) + 1;
        for (let c = -half; c < half; c++) {
          if (((r + c) & 1) !== parity) continue;
          ctx.moveTo(cx + (f * c) / z2, y1);
          ctx.lineTo(cx + (f * (c + 1)) / z2, y1);
          ctx.lineTo(cx + (f * (c + 1)) / z1, y2);
          ctx.lineTo(cx + (f * c) / z1, y2);
        }
      }
      ctx.fill();
    }
  };

  const tick = (now: number) => {
    if (frozen) return;
    requestAnimationFrame(tick);
    if (now - last < 32 || document.hidden) return;
    const dt = Math.min(100, now - last);
    last = now;
    offset = (offset + (dt / 1000) * (0.35 + speed * 6)) % 2;
    speed *= 0.9;
    if (fade < 1) fade = Math.min(1, fade + dt / 600);
    draw();
  };

  resize();
  addEventListener('resize', resize);
  requestAnimationFrame(tick);
  return {
    setColor(hex) {
      from = mix(from, to, fade);
      to = hexRgb(hex);
      fade = frozen ? 1 : 0;
      if (frozen) draw();
    },
    warp(v) {
      speed = Math.max(speed, v);
    },
    freeze() {
      frozen = true;
      fade = 1;
      draw();
    },
  };
}

// stars above the horizon, drawn once. The brightest go on a second canvas which CSS makes twinkle.
function makeSky(sky: HTMLElement) {
  const [still, twinkle] = Array.from(sky.querySelectorAll('canvas'));
  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = innerWidth;
    const H = innerHeight * 0.46;
    const count = Math.round((W * H) / 2200);
    const ctxs = [still, twinkle].map(cv => {
      cv.width = W * dpr;
      cv.height = H * dpr;
      const ctx = cv.getContext('2d')!;
      ctx.scale(dpr, dpr);
      return ctx;
    });
    for (let i = 0; i < count; i++) {
      const y = H * Math.pow(Math.random(), 1.4); // thinner towards the horizon
      const bright = Math.random() < 0.15;
      const ctx = ctxs[bright ? 1 : 0];
      ctx.globalAlpha = bright ? 1 : rand(0.25, 0.7) * (1 - (y / H) * 0.7);
      ctx.fillStyle = Math.random() < 0.2 ? pick([bragClear, lightSquare]) : '#fff';
      const s = bright ? rand(1.4, 2.2) : rand(0.7, 1.4);
      ctx.fillRect(rand(0, W), y, s, s);
    }
  };
  draw();
  addEventListener('resize', draw);
}

// the floor, the sky, and a canvas for confetti which only draws while confetti is flying
export function makeBackground(
  cv: HTMLCanvasElement,
  floorCanvas: HTMLCanvasElement,
  sky: HTMLElement,
): Background {
  const ctx = cv.getContext('2d')!;
  const floor = makeFloor(floorCanvas);
  makeSky(sky);
  if (reduceMotion()) floor.freeze();
  let W = 0;
  let H = 0;
  let colors: string[] = [];
  let lite = false;
  let running = false;
  const bits: Bit[] = [];
  const pieces = pieceImages();
  const coarse = matchMedia('(pointer: coarse)').matches;

  const resize = () => {
    const dpr = coarse ? 1 : Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
  };
  resize();
  addEventListener('resize', resize);

  const frame = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const dpr = cv.width / W;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.vx *= 0.985;
      b.vy = b.vy * 0.985 + b.gravity;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      b.life -= b.decay;
      if (b.life <= 0 || b.y > H + 40) {
        bits.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, b.life * 2);
      ctx.setTransform(
        dpr * Math.cos(b.rot),
        dpr * Math.sin(b.rot),
        -dpr * Math.sin(b.rot),
        dpr * Math.cos(b.rot),
        b.x * dpr,
        b.y * dpr,
      );
      if (b.img) ctx.drawImage(b.img, -b.size / 2, -b.size / 2, b.size, b.size);
      else {
        ctx.fillStyle = b.color!;
        ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size);
      }
    }
    ctx.globalAlpha = 1;
    if (bits.length) requestAnimationFrame(frame);
    else running = false;
  };

  const burst = (x: number, y: number, n = 90, palette = colors) => {
    if (lite || reduceMotion()) return;
    const count = Math.round(coarse ? n * 0.5 : n);
    const squareColors = ['#f0d9b5', '#b58863', ...palette];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(2, 9);
      const isPiece = i % 6 === 0;
      bits.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 3,
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.2, 0.2),
        size: isPiece ? rand(22, 34) : rand(6, 11),
        life: 1,
        decay: rand(0.006, 0.014),
        gravity: 0.12,
        ...(isPiece ? { img: pick(pieces) } : { color: pick(squareColors) }),
      });
    }
    run();
  };

  const run = () => {
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  };

  // a ring of sparks in one patron colour, with a few gold ones
  const firework = (x: number, y: number) => {
    if (lite || reduceMotion()) return;
    const color = pick(patron);
    const count = coarse ? 36 : 64;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
      const v = rand(3.2, 4.2);
      bits.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: 0,
        vr: 0,
        size: rand(2.5, 3.5),
        life: 1,
        decay: rand(0.012, 0.018),
        gravity: 0.05,
        color: i % 5 ? color : bragClear,
      });
    }
    run();
  };

  const fireworks = (count = 5, spread = 1600) => {
    const ids: Timeout[] = [];
    for (let i = 0; i < count; i++)
      ids.push(setTimeout(() => firework(rand(W * 0.15, W * 0.85), rand(H * 0.1, H * 0.4)), rand(0, spread)));
    return () => ids.forEach(clearTimeout);
  };

  return {
    warp: (v = 1) => floor.warp(v),
    burst,
    fireworks,
    setColors: c => {
      colors = c;
      floor.setColor(c[0]);
    },
    size: () => ({ W, H }),
    lite: () => {
      lite = true;
      bits.length = 0;
      floor.freeze();
    },
  };
}
