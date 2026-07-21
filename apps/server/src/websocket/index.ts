import { FastifyInstance } from 'fastify';

const connections = new Map<string, any>();

export async function websocketHandler(fastify: FastifyInstance) {
  fastify.get('/:roomCode', { websocket: true }, (socket, request: any) => {
    const { roomCode } = request.params;
    const deviceId = request.query.deviceId || 'unknown';
    
    console.log('🔗 ' + deviceId + ' joined ' + roomCode);
    connections.set(deviceId, socket);

    broadcast(roomCode, { type: 'device-joined', deviceId }, deviceId);

    socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        broadcast(roomCode, msg, deviceId);
      } catch (e) {}
    });

    socket.on('close', () => {
      connections.delete(deviceId);
      broadcast(roomCode, { type: 'device-left', deviceId }, deviceId);
    });
  });
}

function broadcast(roomCode: string, message: any, exclude?: string) {
  connections.forEach((socket, id) => {
    if (id !== exclude && socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  });
}
