import { callExchange } from '../lib/runtime.js';
export default function (input, ctx) { return callExchange('offerExchange', input, ctx); }
