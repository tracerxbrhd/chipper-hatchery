import { callGift } from '../lib/runtime.js';

export default function (input, ctx) {
  return callGift('cancelGift', input, ctx);
}
