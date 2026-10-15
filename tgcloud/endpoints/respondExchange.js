import { callExchange } from '../lib/runtime.js';
export default function (input, ctx) { return callExchange('respondExchange', input, ctx); }
