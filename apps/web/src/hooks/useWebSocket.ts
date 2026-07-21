import { useEffect, useRef, useState } from 'react';

export function useWebSocket(roomCode: string | null) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    // Tự động dùng hostname từ trình duyệt (localhost hoặc IP)
    const host = window.location.hostname;
    const wsUrl = `ws://${host}:3001`;

    const ws = new WebSocket(`${wsUrl}/ws/${roomCode}?deviceId=web-${Date.now()}`);
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