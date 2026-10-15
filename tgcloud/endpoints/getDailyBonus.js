import { callGame } from '../lib/runtime.js';

export default function (input, ctx) {
  return callGame('getDailyBonus', input, ctx);
}
