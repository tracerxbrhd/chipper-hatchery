import { callGift } from '../lib/runtime.js';

export default function (input, ctx) {
  return callGift('offerGift', input, ctx);
}
