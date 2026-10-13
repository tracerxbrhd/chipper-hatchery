import { callSocial } from '../lib/runtime.js';

export default function (input, ctx) {
  return callSocial('blockUser', input, ctx);
}
