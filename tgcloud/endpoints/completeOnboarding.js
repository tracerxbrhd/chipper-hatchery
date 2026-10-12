import { callGame } from '../lib/runtime.js';

export default function (input, ctx) {
  return callGame('completeOnboarding', input, ctx);
}
