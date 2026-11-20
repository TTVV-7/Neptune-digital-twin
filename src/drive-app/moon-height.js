// The Moon's ground (moon.js, body.js): how high it is anywhere, to the metre and below, as
// body-height.js makes any world's, with the Moon's heights (LRO's laser altimeter's, LOLA, every
// quarter degree, from drive/public/moon/height.bin, scripts/make-moon.mjs) and its made-up craters
// and rolling ground (worlds.js). One Moon for the page and one for the Worker (worker/drive/
// challenges.js checks its challenges' routes on it), each handed its heights with setHeights.

import { createGround } from './body-height.js';
import { WORLDS } from './worlds.js';

export const MOON_RADIUS = WORLDS.moon.radius;

const moon = createGround( WORLDS.moon );

export const { setHeights, hasHeights, groundAt, heightAt } = moon;
export { moon as moonGround };
