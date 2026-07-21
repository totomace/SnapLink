import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb, saveDb } from '../data/db';

export async function roomRoutes(fastify: FastifyInstance) {
  fastify.post('/', async () => {
    const db = await getDb();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const id = uuidv4();
    db.run('INSERT INTO room (id, code) VALUES (?, ?)', [id, code]);
    saveDb();
    return { success: true, data: { id, code, devices: [] } };
  });

  fastify.post('/:code/join', async (request: any, reply) => {
    const db = await getDb();
    const { code } = request.params;
    const { name, type } = request.body;
    
    const stmt = db.prepare('SELECT id, code FROM room WHERE code = ?');
    stmt.bind([code]);
    let room: [string, string] | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      room = [row.id as string, row.code as string];
    }
    stmt.free();
    
    if (!room) return reply.status(404).send({ success: false, error: 'Room not found' });
    
    const deviceId = uuidv4();
    db.run('INSERT INTO device (id, name, type, room_id) VALUES (?, ?, ?, ?)', [deviceId, name, type, room[0]]);
    saveDb();
    return { success: true, data: { room: { id: room[0], code: room[1] }, device: { id: deviceId, name, type } } };
  });

  fastify.get('/:code', async (request: any, reply) => {
    const db = await getDb();
    const { code } = request.params;
    
    const stmt = db.prepare('SELECT id, code FROM room WHERE code = ?');
    stmt.bind([code]);
    let room: [string, string] | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      room = [row.id as string, row.code as string];
    }
    stmt.free();
    
    if (!room) return reply.status(404).send({ success: false });
    
    const devicesStmt = db.prepare('SELECT id, name, type, ip FROM device WHERE room_id = ?');
    devicesStmt.bind([room[0]]);
    const devices: { id: string; name: string; type: string; ip: string }[] = [];
    while (devicesStmt.step()) {
      const d = devicesStmt.getAsObject();
      devices.push({
        id: d.id as string,
        name: d.name as string,
        type: d.type as string,
        ip: (d.ip as string) || '',
      });
    }
    devicesStmt.free();
    
    return {
      success: true,
      data: {
        id: room[0],
        code: room[1],
        devices,
      },
    };
  });
}