import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebSocket } from './hooks/useWebSocket';
import { addFile, getAllFiles, clearFiles, deleteFile, FileRecord } from './services/db';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3001`;

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBase64(data: string, fileName: string, fileType: string) {
  const byteChars = atob(data);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNums)], { type: fileType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [history, setHistory] = useState<FileRecord[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [isDraggingOverDropZone, setIsDraggingOverDropZone] = useState(false);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [transferStatus, setTransferStatus] = useState<{
    type: 'sending' | 'receiving';
    current?: number;
    total?: number;
    name?: string;
  } | null>(null);
  const [initializing, setInitializing] = useState(true); // <-- Thêm state này

  const { connected, lastMessage, sendMessage } = useWebSocket(roomCode);

  // Tải lịch sử file
  useEffect(() => {
    (async () => {
      try {
        const files = await getAllFiles();
        setHistory(files);
      } catch (err) {
        console.error('Failed to load history', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Tự động join phòng nếu URL có ?room=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setRoomCode(roomFromUrl.trim().toUpperCase());
    }
    setInitializing(false);
  }, []);

  const saveToFolder = async (fileName: string, data: string, fileType: string) => {
    if (!folder) return;
    try {
      const byteChars = atob(data);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNums)], { type: fileType });
      const handle = await folder.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      console.error('Save failed', e);
    }
  };

  useEffect(() => {
    if (!lastMessage?.type || lastMessage.type !== 'file' || !lastMessage.data) return;

    setTransferStatus({ type: 'receiving', name: lastMessage.name });
    const processReceived = async () => {
      const newFile: FileRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: lastMessage.name,
        fileType: lastMessage.fileType,
        data: lastMessage.data,
        size: lastMessage.size || 0,
        direction: 'received',
        timestamp: lastMessage.timestamp || new Date().toISOString(),
      };

      try {
        await addFile(newFile);
        setHistory(prev => [newFile, ...prev]);
        await saveToFolder(newFile.name, newFile.data, newFile.fileType);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('📸 SnapLink', { body: `Received: ${lastMessage.name}` });
        }
      } catch (err) {
        console.error('Failed to save received file', err);
      } finally {
        setTransferStatus(null);
      }
    };

    processReceived();
  }, [lastMessage, folder]);

  const processFiles = useCallback(async (files: File[]) => {
    setTransferStatus({ type: 'sending', current: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), '')
      );
      const timestamp = new Date().toISOString();
      sendMessage({
        type: 'file',
        name: file.name,
        size: file.size,
        fileType: file.type,
        data: base64,
        timestamp,
      });
      const sentFile: FileRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        fileType: file.type,
        size: file.size,
        data: base64,
        direction: 'sent',
        timestamp,
      };
      try {
        await addFile(sentFile);
        setHistory(prev => [sentFile, ...prev]);
      } catch (err) {
        console.error(err);
      }
      setTransferStatus(prev => prev ? { ...prev, current: i + 1 } : null);
    }
    setTransferStatus(null);
  }, [sendMessage]);

  const removeFile = async (id: string) => {
    try {
      await deleteFile(id);
      setHistory(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Failed to delete file', err);
    }
  };

  const createRoom = async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      const res = await fetch(`${API_URL}/api/rooms`, { method: 'POST' });
      const { data } = await res.json();
      setRoomCode(data.code);

      console.log("API response:", data);
      console.log("roomCode:", data.code);

    } catch {
      alert('Cannot connect to server');
    }
  };

  const joinRoom = () => {
    if (!joinCode.trim()) return;
    setRoomCode(joinCode.trim().toUpperCase());
  };

  const copyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const openFileDialog = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      await processFiles(files);
    };
    input.click();
  };

  const pickFolder = async () => {
    if (!window.showDirectoryPicker) {
      alert('Trình duyệt không hỗ trợ (cần Chrome/Edge desktop)');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      setFolder(handle);
    } catch { /* user cancelled */ }
  };

  const handleDropZoneDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverDropZone(false);
    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverDropZone(true);
  };

  const handleDropZoneDragLeave = () => {
    setIsDraggingOverDropZone(false);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!roomCode) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        processFiles(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [roomCode, processFiles]);

  const handleClearHistory = async () => {
    try {
      await clearFiles();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear history', err);
    }
  };

  const url = roomCode ? `${window.location.origin}?room=${roomCode}` : '';

  // Debug: kiểm tra giá trị roomCode và url
  useEffect(() => {
    console.log("roomCode:", roomCode);
    console.log("url:", url);
  }, [roomCode, url]);

  // Hiển thị loading khi tự động vào phòng từ QR
  if (initializing && new URLSearchParams(window.location.search).get('room')) {
    return (
      <div style={s.shell}>
        <div style={{ marginTop: 120, textAlign: 'center' }}>
          <h1 style={s.title}>SnapLink</h1>
          <p style={{ color: '#737373', marginTop: 16 }}>Entering room...</p>
        </div>
      </div>
    );
  }

  if (roomCode) {
    return (
      <div style={s.shell}>
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .file-item {
            animation: fadeInUp 0.3s ease forwards;
          }
        `}</style>

        <div style={s.nav}>
          <span style={s.brand}>SnapLink</span>
          <div style={s.statusRow}>
            <span style={{ ...s.dot, background: connected ? '#10b981' : '#d4d4d4' }} />
            <span style={s.statusLabel}>{connected ? 'Connected' : 'Waiting...'}</span>
          </div>
        </div>

        <div style={s.body}>
          <div style={s.qrWrap}>
            <QRCodeSVG value={url} size={200} bgColor="#ffffff" fgColor="#111111" level="M" />
          </div>
          <p style={s.scanHint}>Scan with your phone</p>

          <div style={s.codeRow}>
            <div style={s.codeBox}>
              <p style={s.codeText}>{roomCode}</p>
            </div>
            <button onClick={copyCode} style={s.copyBtn}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div
            style={{
              ...s.dropZone,
              ...(isDraggingOverDropZone ? s.dropZoneActive : {}),
            }}
            onDrop={handleDropZoneDrop}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onClick={openFileDialog}
          >
            <span style={{ fontSize: 32, marginBottom: 8 }}>📁</span>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>Drop files here or click to browse</span>
            <span style={{ fontSize: 13, color: '#737373' }}>Images, videos • Paste (Ctrl+V) also works</span>
          </div>

          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button onClick={pickFolder} style={{ ...s.secondaryBtn, flex: 1 }}>
              {folder ? '📂 Folder set' : 'Set download folder'}
            </button>
            <button onClick={() => setRoomCode(null)} style={{ ...s.secondaryBtn, flex: 1 }}>
              Leave Room
            </button>
          </div>

          {history.length > 0 && (
            <div style={s.filesSection}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={s.sectionTitle}>Recent Files</p>
                <button onClick={handleClearHistory} style={s.clearBtn}>Clear all</button>
              </div>
              {loading ? (
                <p style={{ color: '#737373', fontSize: 13 }}>Loading...</p>
              ) : (
                <div style={s.grid}>
                  {history.map((file) => (
                    <div key={file.id} className="file-item" style={s.imgWrap}>
                      <div onClick={() => setSelectedFile(file)}>
                        {file.fileType.startsWith('video/') ? (
                          <video src={`data:${file.fileType};base64,${file.data}`} style={s.media} />
                        ) : (
                          <img
                            src={`data:${file.fileType};base64,${file.data}`}
                            alt={file.name}
                            style={s.media}
                          />
                        )}
                      </div>
                      <button
                        style={s.deleteBtn}
                        onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                      >
                        ×
                      </button>
                      <div style={s.fileInfo}>
                        <span style={{ fontSize: 10, color: '#fff' }}>
                          {formatSize(file.size || file.data.length * 0.75 || 0)}
                        </span>
                        <span style={{
                          background: file.direction === 'sent' ? '#111' : '#10b981',
                          color: 'white',
                          fontSize: 9,
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: 4,
                        }}>{file.direction === 'sent' ? 'SENT' : 'RCVD'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {transferStatus && (
          <div style={s.transferToast}>
            {transferStatus.type === 'sending' && transferStatus.total ? (
              <>
                <span>Sending {transferStatus.current}/{transferStatus.total} files...</span>
                <div style={s.progressBar}>
                  <div style={{ ...s.progressFill, width: `${((transferStatus.current || 0) / transferStatus.total) * 100}%` }} />
                </div>
              </>
            ) : (
              <span>Receiving {transferStatus.name}...</span>
            )}
          </div>
        )}

        {selectedFile && (
          <div style={s.modalOverlay} onClick={() => setSelectedFile(null)}>
            <div style={s.modalContent} onClick={e => e.stopPropagation()}>
              <button style={s.modalClose} onClick={() => setSelectedFile(null)}>✕</button>
              {selectedFile.fileType.startsWith('video/') ? (
                <video
                  src={`data:${selectedFile.fileType};base64,${selectedFile.data}`}
                  style={s.modalMedia}
                  controls
                  autoPlay
                />
              ) : (
                <img
                  src={`data:${selectedFile.fileType};base64,${selectedFile.data}`}
                  alt={selectedFile.name}
                  style={s.modalMedia}
                />
              )}
              <button
                style={s.downloadBtn}
                onClick={() => downloadBase64(selectedFile.data, selectedFile.name, selectedFile.fileType)}
              >
                Download
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={s.shell}>
      <div style={s.hero}>
        <h1 style={s.title}>SnapLink</h1>
        <p style={s.subtitle}>Share files between your devices</p>
      </div>

      <div style={s.actions}>
        <button onClick={createRoom} style={s.primaryBtn}>
          Create Room
        </button>

        <div style={s.divider}>
          <span style={s.or}>or</span>
        </div>

        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Room Code"
          maxLength={6}
          style={s.input}
        />

        <button onClick={joinRoom} disabled={!joinCode.trim()} style={s.secondaryBtn}>
          Join Room
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#FAFAFA',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '24px',
    boxSizing: 'border-box',
  },
  hero: {
    marginTop: '120px',
    textAlign: 'center',
  },
  title: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#111111',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  subtitle: {
    fontSize: '15px',
    color: '#737373',
    marginTop: '8px',
    fontWeight: 400,
  },
  actions: {
    marginTop: '48px',
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  primaryBtn: {
    width: '100%',
    padding: '14px 0',
    background: '#111111',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '16px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondaryBtn: {
    width: '100%',
    padding: '14px 0',
    background: '#FFFFFF',
    color: '#111111',
    border: '1px solid #E5E5E5',
    borderRadius: '16px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'center',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  or: {
    fontSize: '13px',
    color: '#A3A3A3',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    border: '1px solid #E5E5E5',
    borderRadius: '16px',
    fontSize: '18px',
    textAlign: 'center',
    letterSpacing: '6px',
    fontWeight: 500,
    color: '#111111',
    background: '#FFFFFF',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
  },
  nav: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '24px',
  },
  brand: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111111',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusLabel: {
    fontSize: '13px',
    color: '#737373',
  },
  body: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
  },
  qrWrap: {
    background: '#FFFFFF',
    border: '1px solid #E5E5E5',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    justifyContent: 'center',
  },
  scanHint: {
    fontSize: '13px',
    color: '#737373',
    margin: 0,
  },
  codeRow: {
    width: '100%',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  codeBox: {
    flex: 1,
    padding: '14px 0',
    background: '#FFFFFF',
    border: '1px solid #E5E5E5',
    borderRadius: '16px',
    textAlign: 'center',
  },
  codeText: {
    fontSize: '24px',
    fontWeight: 600,
    letterSpacing: '8px',
    color: '#111111',
    margin: 0,
    fontFamily: 'monospace',
  },
  copyBtn: {
    padding: '14px 20px',
    background: '#FFFFFF',
    border: '1px solid #E5E5E5',
    borderRadius: '16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#111111',
    cursor: 'pointer',
  },
  dropZone: {
    width: '100%',
    padding: '32px 16px',
    border: '2px dashed #D4D4D4',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    cursor: 'pointer',
    background: '#FFFFFF',
    boxSizing: 'border-box',
    textAlign: 'center',
  },
  dropZoneActive: {
    border: '2px dashed #111111',
    background: '#F9F9F9',
  },
  filesSection: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#737373',
    margin: 0,
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    fontSize: '13px',
    color: '#737373',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  imgWrap: {
    aspectRatio: '1',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #E5E5E5',
    background: '#FFFFFF',
    position: 'relative',
    cursor: 'pointer',
  },
  media: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: 20,
    height: 20,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    lineHeight: 1,
  },
  fileInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    padding: '2px 6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 10,
    pointerEvents: 'none',
  },
  transferToast: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#111',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 500,
    zIndex: 999,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 200,
  },
  progressBar: {
    width: '100%',
    height: 4,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#10b981',
    transition: 'width 0.2s',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px',
  },
  modalContent: {
    position: 'relative',
    maxWidth: '90vw',
    maxHeight: '90vh',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#fff',
  },
  modalClose: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: 'rgba(255,255,255,0.8)',
    border: 'none',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    fontSize: '18px',
    cursor: 'pointer',
    zIndex: 1,
  },
  modalMedia: {
    maxWidth: '90vw',
    maxHeight: 'calc(90vh - 60px)',
    objectFit: 'contain',
    display: 'block',
  },
  downloadBtn: {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};

export default App;