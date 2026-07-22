import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebSocket } from './hooks/useWebSocket';
import { addFile, getAllFiles, clearFiles, deleteFile, FileRecord } from './services/db';

/* ---------- CONSTANTS ---------- */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3001`;

/* ---------- UTILS ---------- */
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

/* ---------- STYLES (CSS-in-JS) ---------- */
const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#FAFAFA',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '24px 32px',
    maxWidth: 1200,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 24,
    borderBottom: '1px solid #E5E5E5',
    marginBottom: 24,
  },
  brand: {
    fontSize: 18,
    fontWeight: 600,
    color: '#111',
    letterSpacing: -0.3,
  },
  statusText: {
    fontSize: 14,
    color: '#737373',
  },
  roomCodeSmall: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#737373',
    padding: '2px 8px',
    border: '1px solid #E5E5E5',
    borderRadius: 8,
  },
  centerContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    gap: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 600,
    color: '#111',
    margin: 0,
  },
  subtitle: {
    fontSize: 16,
    color: '#737373',
    margin: 0,
  },
  homeActions: {
    width: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 24,
  },
  primaryButton: {
    width: '100%',
    padding: '14px 0',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  secondaryButton: {
    padding: '10px 20px',
    background: '#fff',
    color: '#111',
    border: '1px solid #E5E5E5',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#A3A3A3',
    fontSize: 13,
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    border: '1px solid #E5E5E5',
    borderRadius: 12,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 6,
    fontWeight: 500,
    color: '#111',
    background: '#fff',
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  qrWrapper: {
    background: '#fff',
    border: '1px solid #E5E5E5',
    borderRadius: 16,
    padding: 24,
    display: 'inline-flex',
  },
  scanHint: {
    fontSize: 14,
    color: '#737373',
    margin: 0,
  },
  codeDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  copyBtnSmall: {
    background: 'none',
    border: 'none',
    color: '#737373',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  mainContent: {
    marginTop: 32,
    animation: 'fadeInUp 0.4s ease',
  },
  galleryContainer: {
    width: '100%',
  },
  galleryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  clearButton: {
    background: 'none',
    border: 'none',
    color: '#737373',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
  },
  thumbnail: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: '1',
    border: '1px solid #E5E5E5',
    cursor: 'pointer',
    background: '#fff',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  media: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    border: 'none',
    fontSize: 16,
    lineHeight: 1,
    cursor: 'pointer',
    zIndex: 2,
    transition: 'background 0.15s',
  },
  fileInfo: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#737373',
    marginTop: 80,
    animation: 'fadeInUp 0.4s ease',
  },
  dropZone: {
    width: 320,
    height: 200,
    border: '2px dashed #E5E5E5',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: '#fff',
    transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
    textAlign: 'center',
    userSelect: 'none',
  },
  progressContainer: {
    background: '#fff',
    border: '1px solid #E5E5E5',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 24,
    animation: 'fadeInUp 0.3s ease',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBarLarge: {
    width: '100%',
    height: 6,
    background: '#F0F0F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFillLarge: {
    height: '100%',
    background: '#111',
    transition: 'width 0.3s ease',
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
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
    animation: 'fadeIn 0.2s ease',
  },
  modalContent: {
    position: 'relative',
    maxWidth: '90vw',
    maxHeight: '90vh',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#fff',
    animation: 'scaleIn 0.2s ease',
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    background: 'rgba(255,255,255,0.8)',
    border: 'none',
    borderRadius: '50%',
    width: 36,
    height: 36,
    fontSize: 18,
    cursor: 'pointer',
    zIndex: 1,
    transition: 'background 0.15s',
  },
  modalMedia: {
    maxWidth: '90vw',
    maxHeight: 'calc(90vh - 60px)',
    objectFit: 'contain',
    display: 'block',
  },
  downloadBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  // Animation keyframes được định nghĩa trong <style> tag
};

/* ---------- COMPONENTS ---------- */
function Header({
  isHost,
  connected,
  phoneConnected,
  roomCode,
}: {
  isHost: boolean | null;
  connected: boolean;
  phoneConnected: boolean;
  roomCode: string | null;
}) {
  const statusText = isHost
    ? phoneConnected
      ? 'Phone Connected'
      : 'Waiting for phone...'
    : 'Connected';

  return (
    <div style={styles.header}>
      <span style={styles.brand}>SnapLink</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isHost && roomCode && (
          <span style={styles.roomCodeSmall}>{roomCode}</span>
        )}
        <span
          className={connected ? 'pulse-dot' : ''}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? '#10b981' : '#d4d4d4',
            transition: 'background 0.3s',
          }}
        />
        <span style={styles.statusText}>{statusText}</span>
      </div>
    </div>
  );
}

function PairingScreen({
  url,
  roomCode,
  onLeave,
  onPickFolder,
  folder,
}: {
  url: string;
  roomCode: string;
  onLeave: () => void;
  onPickFolder: () => void;
  folder: FileSystemDirectoryHandle | null;
}) {
  return (
    <div className="fade-in-up" style={styles.centerContent}>
      <div style={styles.qrWrapper}>
        <QRCodeSVG value={url} size={200} bgColor="#ffffff" fgColor="#111111" level="M" />
      </div>
      <p style={styles.scanHint}>Scan this QR with your phone</p>
      <div style={styles.codeDisplay}>
        <span style={{ fontSize: 20, fontFamily: 'monospace', letterSpacing: 4 }}>
          {roomCode}
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(roomCode)}
          style={styles.copyBtnSmall}
        >
          Copy
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={onPickFolder}
          style={styles.secondaryButton}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {folder ? '📂 Folder set' : 'Set download folder'}
        </button>
        <button
          onClick={onLeave}
          style={styles.secondaryButton}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}

function GalleryView({
  history,
  loading,
  onSelect,
  onDelete,
  onClear,
  showClear = true,
}: {
  history: FileRecord[];
  loading: boolean;
  onSelect: (file: FileRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  showClear?: boolean;
}) {
  if (history.length === 0) {
    return (
      <div className="fade-in-up" style={styles.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📷</div>
        <p style={{ color: '#737373', fontSize: 15 }}>No photos yet</p>
        <p style={{ color: '#A3A3A3', fontSize: 13, marginTop: 4 }}>
          Waiting for incoming photos...
        </p>
      </div>
    );
  }

  return (
    <div className="fade-in-up" style={styles.galleryContainer}>
      {showClear && (
        <div style={styles.galleryHeader}>
          <span style={{ fontWeight: 500, color: '#111' }}>Photos</span>
          <button
            onClick={onClear}
            style={styles.clearButton}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#111')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#737373')}
          >
            Clear all
          </button>
        </div>
      )}
      <div style={styles.grid}>
        {history.map((file, index) => (
          <div
            key={file.id}
            className="file-item"
            style={{
              ...styles.thumbnail,
              animationDelay: `${index * 0.05}s`,
            }}
            onClick={() => onSelect(file)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {file.fileType.startsWith('video/') ? (
              <video
                src={`data:${file.fileType};base64,${file.data}`}
                style={styles.media}
              />
            ) : (
              <img
                src={`data:${file.fileType};base64,${file.data}`}
                alt={file.name}
                style={styles.media}
              />
            )}
            <button
              style={styles.deleteButton}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(file.id);
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.7)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
            >
              ×
            </button>
            <div style={styles.fileInfo}>
              <span>{formatSize(file.size || file.data.length * 0.75 || 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuestScreen({
  onSendFiles,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onLeave,
  history,
  loading,
  onSelect,
  onDelete,
}: {
  onSendFiles: () => void;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onLeave: () => void;
  history: FileRecord[];
  loading: boolean;
  onSelect: (file: FileRecord) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 32 }}>
      <div className="fade-in-up" style={styles.centerContent}>
        <div
          style={{
            ...styles.dropZone,
            borderColor: isDragging ? '#111' : '#E5E5E5',
            background: isDragging ? '#F9F9F9' : '#fff',
            height: 160,
            transform: isDragging ? 'scale(0.98)' : 'scale(1)',
          }}
          onClick={onSendFiles}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
          <div style={{ fontWeight: 500, color: '#111', marginBottom: 4 }}>
            Tap to select photos
          </div>
          <div style={{ color: '#737373', fontSize: 13 }}>or drag & drop</div>
        </div>
        <p style={{ color: '#737373', fontSize: 13, marginTop: 16 }}>
          Photos will be sent instantly to the laptop
        </p>
        <button
          onClick={onLeave}
          style={{ ...styles.secondaryButton, marginTop: 16 }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          Leave Room
        </button>
      </div>

      <div style={{ marginTop: 48 }}>
        <div style={styles.galleryHeader}>
          <span style={{ fontWeight: 500, color: '#111' }}>Sent Photos</span>
        </div>
        <GalleryView
          history={history}
          loading={loading}
          onSelect={onSelect}
          onDelete={onDelete}
          onClear={() => {}}
          showClear={false}
        />
      </div>
    </div>
  );
}

function TransferProgress({
  status,
}: {
  status: {
    type: 'sending' | 'receiving';
    current?: number;
    total?: number;
    name?: string;
  };
}) {
  const percent =
    status.total && status.current !== undefined
      ? Math.round(((status.current || 0) / status.total) * 100)
      : undefined;

  return (
    <div className="fade-in-up" style={styles.progressContainer}>
      <div style={styles.progressHeader}>
        <span style={{ fontWeight: 500 }}>
          {status.type === 'sending' ? 'Sending' : 'Receiving'}
          {status.name ? ` ${status.name}` : ''}
        </span>
        {status.total && status.current !== undefined && (
          <span style={{ color: '#737373', fontSize: 13 }}>
            {status.current}/{status.total} files
          </span>
        )}
      </div>
      <div style={styles.progressBarLarge}>
        <div
          style={{
            ...styles.progressFillLarge,
            width: `${percent ?? 0}%`,
          }}
          className={status.type === 'receiving' && percent === undefined ? 'progress-indeterminate' : ''}
        />
      </div>
      {percent !== undefined && (
        <div style={{ textAlign: 'right', fontSize: 12, color: '#737373', marginTop: 4 }}>
          {percent}%
        </div>
      )}
    </div>
  );
}

/* ---------- MAIN APP ---------- */
export default function App() {
  const initialRoom = (new URLSearchParams(window.location.search).get('room') || '').trim().toUpperCase();
  const [roomCode, setRoomCode] = useState<string | null>(initialRoom || null);
  const [isHost, setIsHost] = useState<boolean | null>(initialRoom ? false : null);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [history, setHistory] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [transferStatus, setTransferStatus] = useState<{
    type: 'sending' | 'receiving';
    current?: number;
    total?: number;
    name?: string;
  } | null>(null);

  const { connected, lastMessage, sendMessage } = useWebSocket(roomCode);

  const createRoom = async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      const res = await fetch(`${API_URL}/api/rooms`, { method: 'POST' });
      const { data } = await res.json();
      setRoomCode(data.code);
      setIsHost(true);
    } catch {
      alert('Cannot connect to server');
    }
  };

  const joinRoom = () => {
    if (!joinCode.trim()) return;
    setRoomCode(joinCode.trim().toUpperCase());
    setIsHost(false);
  };

  const leaveRoom = () => {
    setRoomCode(null);
    setIsHost(null);
    setPhoneConnected(false);
    setHistory([]);
  };

  useEffect(() => {
    if (isHost && lastMessage?.type === 'device-joined') {
      setPhoneConnected(true);
    }
  }, [lastMessage, isHost]);

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
    if (!isHost) return;

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
  }, [lastMessage, folder, isHost]);

  const processFiles = useCallback(async (files: File[]) => {
    setTransferStatus({ type: 'sending', current: 0, total: files.length, name: files[0]?.name });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setTransferStatus(prev => prev ? { ...prev, current: i + 1, name: file.name } : null);
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

  const clearAll = async () => {
    try {
      await clearFiles();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear history', err);
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

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

  const url = roomCode ? `${window.location.origin}?room=${roomCode}` : '';

  if (!roomCode) {
    return (
      <div style={styles.shell}>
        <div className="fade-in-up" style={styles.centerContent}>
          <h1 style={styles.title}>SnapLink</h1>
          <p style={styles.subtitle}>Share photos between your phone and computer</p>
          <div style={styles.homeActions}>
            <button
              onClick={createRoom}
              style={styles.primaryButton}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              Create Room
            </button>
            <div style={styles.divider}>
              <span>or</span>
            </div>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room Code"
              maxLength={6}
              style={styles.input}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#111';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.05)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#E5E5E5';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <button
              onClick={joinRoom}
              disabled={!joinCode.trim()}
              style={{
                ...styles.secondaryButton,
                opacity: joinCode.trim() ? 1 : 0.5,
              }}
              onMouseEnter={(e) => {
                if (joinCode.trim()) e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes progressIndeterminate {
          0% { width: 0%; margin-left: 0; }
          50% { width: 70%; margin-left: 30%; }
          100% { width: 0%; margin-left: 100%; }
        }
        .fade-in-up {
          animation: fadeInUp 0.4s ease both;
        }
        .file-item {
          animation: fadeInUp 0.3s ease both;
        }
        .pulse-dot {
          animation: pulse 2s infinite;
        }
        .progress-indeterminate {
          animation: progressIndeterminate 1.5s ease infinite;
          width: 30% !important;
        }
      `}</style>

      <Header
        isHost={isHost}
        connected={connected}
        phoneConnected={phoneConnected}
        roomCode={roomCode}
      />

      {transferStatus && <TransferProgress status={transferStatus} />}

      {isHost ? (
        phoneConnected ? (
          <div style={styles.mainContent}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
              <button
                onClick={pickFolder}
                style={styles.secondaryButton}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {folder ? '📂 Folder set' : 'Set download folder'}
              </button>
              <button
                onClick={leaveRoom}
                style={styles.secondaryButton}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                Leave Room
              </button>
            </div>
            <GalleryView
              history={history}
              loading={loading}
              onSelect={setSelectedFile}
              onDelete={removeFile}
              onClear={clearAll}
            />
          </div>
        ) : (
          <PairingScreen
            url={url}
            roomCode={roomCode}
            onLeave={leaveRoom}
            onPickFolder={pickFolder}
            folder={folder}
          />
        )
      ) : (
        <GuestScreen
          onSendFiles={openFileDialog}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onLeave={leaveRoom}
          history={history}
          loading={loading}
          onSelect={setSelectedFile}
          onDelete={removeFile}
        />
      )}

      {selectedFile && (
        <div style={styles.modalOverlay} onClick={() => setSelectedFile(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button
              style={styles.modalClose}
              onClick={() => setSelectedFile(null)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.8)')}
            >
              ✕
            </button>
            {selectedFile.fileType.startsWith('video/') ? (
              <video
                src={`data:${selectedFile.fileType};base64,${selectedFile.data}`}
                style={styles.modalMedia}
                controls
                autoPlay
              />
            ) : (
              <img
                src={`data:${selectedFile.fileType};base64,${selectedFile.data}`}
                alt={selectedFile.name}
                style={styles.modalMedia}
              />
            )}
            <button
              style={styles.downloadBtn}
              onClick={() =>
                downloadBase64(selectedFile.data, selectedFile.name, selectedFile.fileType)
              }
              onMouseEnter={(e) => (e.currentTarget.style.background = '#333')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#111')}
            >
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}