import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function roomRoutes(fastify: FastifyInstance) {
  fastify.post('/', async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = await prisma.room.create({
      data: { code },
      include: { devices: true }
    });
    return { success: true, data: room };
  });

  fastify.post('/:code/join', async (request: any, reply) => {
    const { code } = request.params;
    const { name, type } = request.body;
    const room = await prisma.room.findUnique({ where: { code } });
    if (!room) return reply.status(404).send({ success: false, error: 'Room not found' });
    const device = await prisma.device.create({ data: { name, type, roomId: room.id } });
    return { success: true, data: { room, device } };
  });

  fastify.get('/:code', async (request: any, reply) => {
    const room = await prisma.room.findUnique({
      where: { code: request.params.code },
      include: { devices: true }
    });
    if (!room) return reply.status(404).send({ success: false });
    return { success: true, data: room };
  });
}
