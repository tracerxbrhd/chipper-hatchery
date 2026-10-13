import { callSocial } from '../lib/runtime.js';

export default function (input, ctx) {
  return callSocial('resolveSocialLink', input, ctx);
}
