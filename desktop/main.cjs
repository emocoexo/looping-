const { app, BrowserWindow, Menu, dialog, session } = require('electron');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { join, dirname } = require('node:path');
const { mkdirSync, appendFileSync, writeFileSync } = require('node:fs');

app.setName('Loop Studio');
app.setAppUserModelId('com.emocoexo.loopstudio');
const smokeTest = process.argv.includes('--smoke-test');
const root = app.isPackaged ? dirname(process.execPath) : join(__dirname, '..');
const logDirectory = join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Loop Studio', 'logs');
let logPath, window, server, address, quitting = false, exitCode = 0, stderr = '';
function log(message) {
  try { if (logPath) appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`); } catch {}
}
function fail(error) {
  if (quitting) return;
  exitCode = 1;
  log(error.stack || error.message);
  if (!smokeTest) dialog.showErrorBox('Loop Studio', `${error.message}${stderr ? '\n\n' + stderr : ''}${logPath ? '\n\nLog: ' + logPath : ''}`);
  app.quit();
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 5000);
    const done = () => { clearTimeout(timer); resolve(); };
    if (process.platform === 'win32') {
      const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => { child.kill(); done(); });
      killer.once('close', done);
    } else { child.once('close', done); child.kill(); }
  });
}
function startServer() {
  return new Promise((resolve, reject) => {
    const node = process.platform === 'win32' ? join(root, 'runtime', 'node.exe') : process.env.LOOP_STUDIO_NODE || 'node';
    const script = app.isPackaged ? join(root, 'app', 'desktop', 'server.mjs') : join(__dirname, 'server.mjs');
    const timer = setTimeout(() => reject(new Error('Aplikasi belum siap setelah 90 detik. Detail tersedia pada log.')), 90000);
    server = spawn(node, [script], { cwd: dirname(script), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    log(`Server process ${server.pid}`);
    server.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); log('stderr: ' + data.toString().trim()); });
    const lines = createInterface({ input: server.stdout });
    lines.on('line', line => {
      log('stdout: ' + line);
      if (address) return;
      try {
        const url = new URL(line.trim());
        if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number(url.port) > 0) {
          address = url.origin;
          clearTimeout(timer);
          resolve(address);
        }
      } catch {}
    });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('close', code => {
      clearTimeout(timer);
      log(`Server exited: ${code}`);
      const error = new Error(`Proses video berhenti (kode ${code}).`);
      if (!address) reject(error);
      else if (!quitting) fail(error);
    });
  });
}
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void stopServer().finally(() => app.exit(exitCode));
  });
  app.whenReady().then(async () => {
    try {
      mkdirSync(logDirectory, { recursive: true });
      logPath = join(logDirectory, 'launcher.log');
      writeFileSync(logPath, 'Loop Studio desktop 2.1.0\n');
    } catch {}
    Menu.setApplicationMenu(null);
    window = new BrowserWindow({
      title: 'Loop Studio', width: 1280, height: 900, minWidth: 760, minHeight: 600,
      backgroundColor: '#0b0c13', show: !smokeTest,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (!address || new URL(url).origin !== address) event.preventDefault();
    });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('render-process-gone', (_event, details) => { if (!quitting) fail(new Error('Jendela aplikasi berhenti: ' + details.reason)); });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: 'Simpan hasil video', defaultPath: join(app.getPath('downloads'), item.getFilename()), filters: [{ name: 'Video MP4', extensions: ['mp4'] }] });
      item.once('done', (_event, state) => {
        log('Video save: ' + state);
        if (state === 'interrupted' && !smokeTest && !quitting) dialog.showErrorBox('Gagal menyimpan video', 'Penyimpanan terputus. Coba simpan kembali ke folder yang dapat ditulis.');
      });
    });
    await window.loadFile(join(__dirname, 'loading.html'));
    await startServer();
    if (quitting) return;
    await window.loadURL(address);
    if (smokeTest) {
      const health = await fetch(address + '/api/health').then(response => response.json());
      if (health.status !== 'ok' || window.webContents.getURL() !== address + '/') throw new Error('Pemeriksaan jendela aplikasi gagal.');
      log('PASS: desktop window loaded and video server is healthy');
      app.quit();
    }
  }).catch(fail);
}
