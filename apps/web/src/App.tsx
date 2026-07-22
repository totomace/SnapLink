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

  const dotColor = connected ? '#10b981' : '#d4d4d4';

  return (
    <div style={styles.header}>
      <span style={styles.brand}>SnapLink</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isHost && roomCode && (
          <span style={styles.roomCodeSmall}>{roomCode}</span>
        )}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
        <span style={styles.statusText}>{statusText}</span>
      </div>
    </div>
  );
}

function PairingScreen({ url, roomCode }: { url: string; roomCode: string }) {
  return (
    <div style={styles.centerContent}>
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
    </div>
  );
}

function GalleryView({
  history,
  loading,
  onSelect,
  onDelete,
  onClear,
}: {
  history: FileRecord[];
  loading: boolean;
  onSelect: (file: FileRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📷</div>
        <p style={{ color: '#737373', fontSize: 15 }}>No photos yet</p>
        <p style={{ color: '#A3A3A3', fontSize: 13, marginTop: 4 }}>
          Waiting for incoming photos...
        </p>
      </div>
    );
  }

  return (
    <div style={styles.galleryContainer}>
      <div style={styles.galleryHeader}>
        <span style={{ fontWeight: 500, color: '#111' }}>Photos</span>
        <button onClick={onClear} style={styles.clearButton}>
          Clear all
        </button>
      </div>
      <div style={styles.grid}>
        {history.map((file) => (
          <div
            key={file.id}
            style={styles.thumbnail}
            onClick={() => onSelect(file)}
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

function SenderScreen({
  onSendFiles,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  onSendFiles: () => void;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div style={styles.centerContent}>
      <div
        style={{
          ...styles.dropZone,
          borderColor: isDragging ? '#111' : '#E5E5E5',
          background: isDragging ? '#F9F9F9' : '#fff',
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
    </div>
  );
}

/* ---------- MAIN APP ---------- */
export default function App() {
  // ----- state -----
  const initialRoomFromUrl = (
    new URLSearchParams(window.location.search).get('room') || ''
  ).trim().toUpperCase();
  const [roomCode, setRoomCode] = useState<string | null>(
    initialRoomFromUrl || null
  );
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
  const [copied, setCopied] = useState(false);
  // Phân biệt host (laptop) và guest (điện thoại)
  const [isHost, setIsHost] = useState<boolean | null>(null);
  // Trạng thái có điện thoại kết nối vào phòng (chỉ dành cho host)
  const [phoneConnected, setPhoneConnected] = useState(false);

  const { connected, lastMessage, sendMessage } = useWebSocket(roomCode);

  // Khi host tạo phòng, đánh dấu isHost = true
  useEffect(() => {
    if (initialRoomFromUrl && isHost === null) {
      // Nếu vào trang qua URL (quét QR) -> guest
      setIsHost(false);
    }
  }, []);

  // Lắng nghe sự kiện device-joined để cập nhật phoneConnected cho host
  useEffect(() => {
    if (isHost && lastMessage?.type === 'device-joined') {
      setPhoneConnected(true);
    }
  }, [lastMessage, isHost]);

  // ----- data loading -----
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

  // ----- save to folder -----
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

  // ----- receive file -----
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

  // ----- send files (phone side) -----
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
      // Lưu vào lịch sử gửi (cho phone nếu muốn hiển thị)
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

  // ----- room actions -----
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

  // ----- file deletion -----
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

  // ----- render logic -----
  const url = roomCode ? `${window.location.origin}?room=${roomCode}` : '';

  // Trang chủ (chưa vào phòng)
  if (!roomCode) {
    return (
      <div style={styles.shell}>
        <div style={styles.centerContent}>
          <h1 style={styles.title}>SnapLink</h1>
          <p style={styles.subtitle}>Share photos between your phone and computer</p>
          <div style={styles.homeActions}>
            <button onClick={createRoom} style={styles.primaryButton}>
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
            />
            <button
              onClick={joinRoom}
              disabled={!joinCode.trim()}
              style={styles.secondaryButton}
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Đã vào phòng – phân nhánh theo vai trò
  return (
    <div style={styles.shell}>
      <Header
        isHost={isHost}
        connected={connected}
        phoneConnected={phoneConnected}
        roomCode={roomCode}
      />

      {/* Host: laptop nhận ảnh */}
      {isHost && (
        <>
          {!phoneConnected ? (
            <PairingScreen url={url} roomCode={roomCode} />
          ) : (
            <div style={styles.mainContent}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button onClick={pickFolder} style={styles.secondaryButton}>
                  {folder ? '📂 Folder set' : 'Set download folder'}
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
          )}
        </>
      )}

      {/* Guest: điện thoại gửi ảnh */}
      {isHost === false && (
        <SenderScreen
          onSendFiles={openFileDialog}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      )}

      {/* Transfer toast (giữ nguyên) */}
      {transferStatus && (
        <div style={styles.toast}>
          {transferStatus.type === 'sending' && transferStatus.total ? (
            <>
              <span>Sending {transferStatus.current}/{transferStatus.total} files...</span>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${((transferStatus.current || 0) / transferStatus.total) * 100}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <span>Receiving {transferStatus.name}...</span>
          )}
        </div>
      )}

      {/* Modal xem ảnh (giữ nguyên) */}
      {selectedFile && (
        <div style={styles.modalOverlay} onClick={() => setSelectedFile(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setSelectedFile(null)}>
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
            >
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- STYLES ---------- */
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
    marginTop: 80,
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
    transition: 'border-color 0.2s, background 0.2s',
    textAlign: 'center',
    userSelect: 'none',
  },
  toast: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#111',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 500,
    zIndex: 999,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
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
  },
  modalContent: {
    position: 'relative',
    maxWidth: '90vw',
    maxHeight: '90vh',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#fff',
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
  },
};