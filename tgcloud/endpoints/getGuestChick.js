import { callGuest } from '../lib/runtime.js';

export default function (input, ctx) {
  return callGuest('getGuestChick', input, ctx);
}
