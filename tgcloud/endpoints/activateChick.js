import { callGame } from '../lib/runtime.js';

export default function (input, ctx) {
  return callGame('activateChick', input, ctx);
}
