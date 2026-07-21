const API = 'http://localhost:3001/api';

export const api = {
  createRoom: () => fetch(API + '/rooms', { method: 'POST' }).then(r => r.json()),
  joinRoom: (code: string, device: any) =>
    fetch(API + '/rooms/' + code + '/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(device)
    }).then(r => r.json()),
  getRoom: (code: string) => fetch(API + '/rooms/' + code).then(r => r.json()),
};
