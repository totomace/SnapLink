import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { roomRoutes } from './routes/rooms.js';
import { websocketHandler } from './websocket/index.js';

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(websocket);
await server.register(roomRoutes, { prefix: '/api/rooms' });
await server.register(websocketHandler, { prefix: '/ws' });

server.get('/health', async () => ({ status: 'ok' }));

try {
  await server.listen({ port: 3001, host: '0.0.0.0' });
  console.log('🚀 Server: http://localhost:3001');
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
