import { app, run } from '../server.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
for (const binary of ['ffmpeg', 'ffprobe']) {
  const bundled = join(root, 'bin', `${binary}.exe`);
  if (process.platform === 'win32' && existsSync(bundled)) process.env[`${binary.toUpperCase()}_PATH`] = bundled;
  await run(binary, ['-version'], 10000);
}
// Desktop instances listen only on this computer and use an available port.
const server = app.listen(0, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}`);
});
server.on('error', error => { console.error(error.message); process.exit(1); });
