import { createServer } from 'vite';
// Explicit test/dev entry point. Vite build never uses this environment.
process.env.VITE_DEV_MOCK = 'true';
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await server.listen();
server.printUrls();
