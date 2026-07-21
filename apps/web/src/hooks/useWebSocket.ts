import { useState, useEffect, useRef } from 'react';

export function useWebSocket(roomCode: string | null) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    const ws = new WebSocket('ws://localhost:3001/ws/' + roomCode + '?deviceId=web-' + Date.now());
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => setLastMessage(JSON.parse(event.data));
    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, [roomCode]);

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  return { connected, lastMessage, sendMessage };
}
