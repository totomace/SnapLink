const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

let mainWindow;
let serverProcess;
let viteProcess;

// Hàm kill process theo port (Windows)
function killPort(port) {
  try {
    const lines = execSync(`netstat -ano | findstr :${port}`).toString().trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid)) {
        try { execSync(`taskkill /PID ${pid} /F`); } catch {}
      }
    }
  } catch {}
}

function startVite() {
  return new Promise((resolve, reject) => {
    killPort(5173);
    viteProcess = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '5173', '--strictPort'], {
      cwd: path.join(__dirname, '../apps/web'),
      shell: true,
      stdio: 'pipe'
    });
    viteProcess.stdout.on('data', (data) => {
      console.log(`Vite: ${data}`);
      if (data.toString().includes('Local')) resolve();
    });
    viteProcess.stderr.on('data', (data) => reject(data.toString()));
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    killPort(3001);
    serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: path.join(__dirname, '../apps/server'),
      env: { ...process.env, PORT: '3001' },
      shell: true,
      stdio: 'pipe'
    });
    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
      if (data.toString().includes('Server listening')) resolve();
    });
    serverProcess.stderr.on('data', (data) => reject(data.toString()));
  });
}

async function createWindow() {
  await Promise.all([startServer(), startVite()]);

  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'SnapLink',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL('http://localhost:5173');

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) serverProcess.kill();
    if (viteProcess) viteProcess.kill();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (viteProcess) viteProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});