import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [receivedFiles, setReceivedFiles] = useState<any[]>([]);

  const { connected, lastMessage, sendMessage } = useWebSocket(roomCode);

  useEffect(() => {
    if (lastMessage?.type === 'file' && lastMessage.data) {
      setReceivedFiles(prev => [...prev, lastMessage]);
    }
  }, [lastMessage]);

  const createRoom = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/rooms', { method: 'POST' });
      const { data } = await res.json();
      setRoomCode(data.code);
      setShowQR(true);
    } catch (err) {
      alert('Không kết nối được server!');
    }
  };

  const joinRoom = () => {
    if (!joinCode.trim()) return;
    setRoomCode(joinCode.toUpperCase());
  };

  const sendFiles = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), '')
        );
        sendMessage({
          type: 'file',
          name: file.name,
          size: file.size,
          fileType: file.type,
          data: base64,
          timestamp: new Date().toISOString()
        });
      }
    };
    input.click();
  };

  const url = window.location.origin + '?room=' + roomCode;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>⚡</div>
          <h1 style={styles.title}>SnapLink</h1>
          <p style={styles.subtitle}>Chia sẻ ảnh giữa điện thoại & laptop</p>
        </div>

        {!roomCode ? (
          <div style={styles.homeScreen}>
            <button onClick={createRoom} style={styles.primaryBtn}>
              <span style={styles.btnIcon}>📱</span>
              Tạo phòng mới
            </button>
            <div style={styles.divider}>
              <span style={styles.dividerText}>hoặc tham gia</span>
            </div>
            <div style={styles.joinBox}>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Nhập mã phòng"
                maxLength={6}
                style={styles.codeInput}
              />
              <button onClick={joinRoom} disabled={!joinCode.trim()} style={{
                ...styles.joinBtn,
                opacity: joinCode.trim() ? 1 : 0.5
              }}>
                Tham gia
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.roomScreen}>
            <div style={styles.statusBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  ...styles.dot,
                  background: connected ? '#10b981' : '#ef4444',
                  boxShadow: connected ? '0 0 8px #10b981' : 'none'
                }} />
                <span style={styles.statusText}>
                  {connected ? 'Đã kết nối' : 'Đang chờ...'}
                </span>
              </div>
              <button onClick={() => { setRoomCode(null); setShowQR(false); setReceivedFiles([]); }} style={styles.closeBtn}>
                ✕
              </button>
            </div>

            <div style={styles.codeBox}>
              <p style={styles.codeLabel}>Mã phòng</p>
              <p style={styles.codeValue}>{roomCode}</p>
            </div>

            {showQR && (
              <div style={styles.qrBox}>
                <QRCodeSVG
                  value={url}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#1e293b"
                  level="M"
                  includeMargin={false}
                />
                <p style={styles.qrHint}>Quét để kết nối</p>
              </div>
            )}

            <button onClick={sendFiles} style={styles.sendBtn}>
              <span style={{ fontSize: '24px' }}>📤</span>
              Chọn ảnh để gửi
            </button>

            {receivedFiles.length > 0 && (
              <div style={styles.receivedBox}>
                <p style={styles.receivedTitle}>Ảnh đã nhận ({receivedFiles.length})</p>
                <div style={styles.imageGrid}>
                  {receivedFiles.map((file, i) => (
                    <div key={i} style={styles.imageWrapper}>
                      <img
                        src={`data:${file.fileType};base64,${file.data}`}
                        alt={file.name}
                        style={styles.image}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: 'rgba(30, 41, 59, 0.8)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    borderRadius: '24px',
    padding: '40px 32px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  title: {
    fontSize: '36px',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: '0 0 8px 0',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '15px',
    margin: 0,
  },
  homeScreen: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  primaryBtn: {
    width: '100%',
    padding: '16px 24px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: 'white',
    border: 'none',
    borderRadius: '16px',
    fontSize: '17px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    boxShadow: '0 8px 30px rgba(99,102,241,0.3)',
  },
  btnIcon: {
    fontSize: '22px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  dividerText: {
    color: '#475569',
    fontSize: '13px',
    textAlign: 'center',
    flex: 1,
  },
  joinBox: {
    display: 'flex',
    gap: '10px',
  },
  codeInput: {
    flex: 1,
    padding: '14px 16px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '14px',
    color: '#e2e8f0',
    fontSize: '18px',
    textAlign: 'center',
    letterSpacing: '6px',
    outline: 'none',
    fontWeight: 600,
    boxSizing: 'border-box' as const,
  },
  joinBtn: {
    padding: '14px 20px',
    background: '#334155',
    color: '#e2e8f0',
    border: 'none',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  roomScreen: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '14px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  statusText: {
    color: '#cbd5e1',
    fontSize: '14px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px',
  },
  codeBox: {
    textAlign: 'center',
    padding: '16px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '16px',
  },
  codeLabel: {
    color: '#64748b',
    fontSize: '13px',
    margin: '0 0 6px 0',
  },
  codeValue: {
    fontSize: '44px',
    fontWeight: 800,
    letterSpacing: '10px',
    color: '#a78bfa',
    margin: 0,
    fontFamily: 'monospace',
  },
  qrBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px',
    background: 'white',
    borderRadius: '20px',
    gap: '12px',
  },
  qrHint: {
    color: '#64748b',
    fontSize: '13px',
    margin: 0,
  },
  sendBtn: {
    width: '100%',
    padding: '16px',
    background: 'rgba(99,102,241,0.15)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: '16px',
    color: '#a78bfa',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  receivedBox: {
    marginTop: '8px',
  },
  receivedTitle: {
    color: '#94a3b8',
    fontSize: '13px',
    marginBottom: '12px',
  },
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  imageWrapper: {
    aspectRatio: '1',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'rgba(15, 23, 42, 0.8)',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
};

export default App;