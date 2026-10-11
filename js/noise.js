/**
 * Simplex/Perlin noise — deterministic, no external deps
 * Simplex 2D/3D implementation (public domain, Stefan Gustavson)
 */

/**
 * Mulberry32 PRNG - fast, 32-bit, good distribution
 */
function createPRNG(seed = 0) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 15), 1 | z);
      z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    },
    nextInt(max) {
      return Math.floor(this.next() * max);
    },
    nextFloat(min, max) {
      return min + this.next() * (max - min);
    }
  };
}

const GRAD3 = new Float32Array([
  1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
  1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
  0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1
]);

const SIMPLEX_F2 = 0.5 * (Math.sqrt(3) - 1);
const SIMPLEX_G2 = (3 - Math.sqrt(3)) / 6;

const PERM = new Uint8Array(512);
const PERM_MOD12 = new Uint8Array(512);

function initPerm(seed) {
  const prng = createPRNG(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = prng.nextInt(i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    PERM_MOD12[i] = PERM[i] % 12;
  }
}

// Initialize with default seed
initPerm(0);

export function setNoiseSeed(seed) {
  initPerm(seed);
}

/**
 * 2D Simplex Noise
 * @returns value in [-1, 1]
 */
export function simplex2D(xin, yin) {
  const s = (xin + yin) * SIMPLEX_F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * SIMPLEX_G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;

  let i1, j1;
  if (x0 > y0) { i1 = 1; j1 = 0; }
  else { i1 = 0; j1 = 1; }

  const x1 = x0 - i1 + SIMPLEX_G2;
  const y1 = y0 - j1 + SIMPLEX_G2;
  const x2 = x0 - 1 + 2 * SIMPLEX_G2;
  const y2 = y0 - 1 + 2 * SIMPLEX_G2;

  const ii = i & 255;
  const jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    const gi0 = PERM_MOD12[ii + PERM[jj]];
    t0 *= t0;
    n0 = t0 * t0 * (GRAD3[gi0 * 3] * x0 + GRAD3[gi0 * 3 + 1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    const gi1 = PERM_MOD12[ii + i1 + PERM[jj + j1]];
    t1 *= t1;
    n1 = t1 * t1 * (GRAD3[gi1 * 3] * x1 + GRAD3[gi1 * 3 + 1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    const gi2 = PERM_MOD12[ii + 1 + PERM[jj + 1]];
    t2 *= t2;
    n2 = t2 * t2 * (GRAD3[gi2 * 3] * x2 + GRAD3[gi2 * 3 + 1] * y2);
  }

  return 70 * (n0 + n1 + n2);
}

/**
 * Fractal Brownian Motion (fBm)
 * @param octaves - number of octaves
 * @param persistence - amplitude multiplier per octave
 * @param lacunarity - frequency multiplier per octave
 */
export function fbm2D(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex2D(x * frequency, y * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / maxValue;
}

/**
 * Ridged noise for sharp ridges (mountains)
 */
export function ridged2D(x, y, octaves = 4) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    const n = Math.abs(simplex2D(x * frequency, y * frequency));
    value += amplitude * (1 - 2 * n);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

/**
 * Domain warping for more organic shapes
 */
export function domainWarp(x, y, warpStrength = 30) {
  const wx = fbm2D(x + 100, y + 100, 2) * warpStrength;
  const wy = fbm2D(x + 200, y + 200, 2) * warpStrength;
  return { x: x + wx, y: y + wy };
}