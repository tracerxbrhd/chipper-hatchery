import { callExchange } from '../lib/runtime.js';
export default function (input, ctx) { return callExchange('cancelExchange', input, ctx); }
