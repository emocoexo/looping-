import { _electron as electron } from 'playwright';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { exerciseUI } from './ui-flow.mjs';
const executablePath = process.env.LOOP_STUDIO_EXE;
if (!executablePath) throw new Error('LOOP_STUDIO_EXE must point to the installed desktop executable.');
const directory = await mkdtemp(join(tmpdir(), 'loop-desktop-'));
const desktop = await electron.launch({ executablePath, timeout: 60000 });
let serverPid;
try {
  const page = await desktop.firstWindow();
  await page.waitForSelector('#file', { state: 'attached', timeout: 90000 });
  const properties = await desktop.evaluate(({ BrowserWindow, shell }) => {
    globalThis.externalOpenCount = 0;
    shell.openExternal = () => { globalThis.externalOpenCount++; throw new Error('External browser must not open.'); };
    const window = BrowserWindow.getAllWindows()[0];
    return { count: BrowserWindow.getAllWindows().length, title: window.getTitle(), visible: window.isVisible(), preferences: window.webContents.getLastWebPreferences() };
  });
  assert.equal(properties.count, 1);
  assert.equal(properties.visible, true);
  assert.match(properties.title, /Loop Studio/);
  assert.equal(properties.preferences.nodeIntegration, false);
  assert.equal(properties.preferences.contextIsolation, true);
  assert.equal(properties.preferences.sandbox, true);
  const health = await page.evaluate(() => fetch('/api/health').then(r => r.json()));
  assert.equal(health.version, '2.1.0');
  const log = await readFile(join(process.env.LOCALAPPDATA, 'Loop Studio/logs/launcher.log'), 'utf8');
  serverPid = Number(log.match(/Server process (\d+)/)?.[1]);
  assert.ok(serverPid > 0);
  await exerciseUI(page, directory, {
    screenshotPrefix: 'loop-studio-native', checkMobile: false,
    saveVideo: async path => {
      // Supply the save destination instead of interacting with the OS save dialog in CI.
      await desktop.evaluate(({ session }, destination) => {
        globalThis.savedVideoState = 'waiting';
        session.defaultSession.once('will-download', (_event, item) => {
          item.setSavePath(destination);
          globalThis.savedVideoState = 'progressing';
          item.once('done', (_event, state) => { globalThis.savedVideoState = state; });
        });
      }, path);
      await page.locator('#download').click();
      const deadline = Date.now() + 30000;
      let state;
      do {
        state = await desktop.evaluate(() => globalThis.savedVideoState);
        if (state === 'completed') break;
        if (state === 'interrupted' || state === 'cancelled') throw new Error('Desktop video save: ' + state);
        await new Promise(resolve => setTimeout(resolve, 200));
      } while (Date.now() < deadline);
      assert.equal(state, 'completed');
      await access(path);
    }
  });
  assert.equal(await desktop.evaluate(() => globalThis.externalOpenCount), 0);
  assert.equal(desktop.windows().length, 1);
  await desktop.close();
  const deadline = Date.now() + 10000;
  let running = true;
  do {
    try { process.kill(serverPid, 0); } catch { running = false; break; }
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  assert.equal(running, false, 'Closing the app must stop its video server.');
  console.log('PASS: installed desktop window, isolated renderer, video playback, analysis, seam preview, MP4 save, no external browser, clean shutdown.');
} finally {
  await desktop.close().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
