/**
 * Seeded PRNG — deterministic, no Math.random()
 * Mulberry32: fast, 32-bit, good distribution
 */
export function createPRNG(seed = 0) {
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
    },
    // deterministic shuffle (Fisher-Yates)
    shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = this.nextInt(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    },
    // fork a new independent PRNG from this one
    fork() {
      return createPRNG(this.nextInt(0xFFFFFFFF));
    },
    // choose a random element from an array
    choose(array) {
      return array[this.nextInt(array.length)];
    },
    getState() { return state; },
    setState(s) { state = s >>> 0; }
  };
}

// Global seeded PRNG (set by main.js on init)
export let globalPRNG = createPRNG(0);
export function setGlobalSeed(seed) {
  globalPRNG = createPRNG(seed);
}