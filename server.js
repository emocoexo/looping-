import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
export const app = express();
const jobs = new Map();
const MAX_JOBS = 2;
const TTL = 60 * 60 * 1000;

export function run(binary, args, timeout = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const executable = binary === 'ffmpeg' ? (process.env.FFMPEG_PATH || binary) : binary === 'ffprobe' ? (process.env.FFPROBE_PATH || binary) : binary;
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-100000); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`${binary} gagal (${code}): ${stderr}`)); });
  });
}

export function validateOptions(body, duration) {
  const start = Number(body.start), end = Number(body.end), repeats = Number(body.repeats);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 0.1 || end - start < 0.1) throw new Error('Pilih rentang video yang valid, minimal 0,1 detik.');
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 30) throw new Error('Jumlah pengulangan harus antara 1 dan 30.');
  if ((end - start) * repeats > 3600) throw new Error('Durasi hasil maksimal 60 menit.');
  return { start, end: Math.min(end, duration), repeats, mute: body.mute === 'true' };
}

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  next();
});
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
const upload = multer({ dest: tmpdir(), limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 4 } });
let active = 0;
app.post('/api/export', (req, res, next) => {
  if (active >= MAX_JOBS) return res.status(429).json({ error: 'Server sedang memproses video lain. Coba kembali sebentar lagi.' });
  active++;
  let released = false;
  req.releaseSlot = () => { if (!released) { active--; released = true; } };
  next();
}, upload.single('video'), async (req, res) => {
  let directory;
  try {
    if (!req.file) throw new Error('Pilih video terlebih dahulu.');
    const info = JSON.parse(await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', req.file.path], 30000));
    const duration = Number(info.format?.duration);
    if (!info.streams?.some(stream => stream.codec_type === 'video') || !Number.isFinite(duration)) throw new Error('Berkas tidak berisi video yang valid.');
    const options = validateOptions(req.body, duration);
    directory = await mkdtemp(join(tmpdir(), 'loop-studio-'));
    const id = randomUUID();
    const job = { id, state: 'processing', stage: 'Menyiapkan potongan video', directory, created: Date.now() };
    jobs.set(id, job);
    res.status(202).json({ id });
    void render(job, req.file.path, options).finally(req.releaseSlot);
  } catch (err) {
    req.releaseSlot();
    if (req.file) await rm(req.file.path, { force: true });
    if (directory) await rm(directory, { recursive: true, force: true });
    console.error('Video validation:', err.message);
    res.status(400).json({ error: err.message.startsWith('ffprobe') ? 'Video tidak dapat dibaca. Gunakan berkas MP4, MOV, atau WebM yang valid.' : err.message });
  }
});
async function render(job, input, { start, end, repeats, mute }) {
  const clip = join(job.directory, 'clip.mp4');
  const output = join(job.directory, 'loop.mp4');
  try {
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', String(start), '-i', input, '-t', String(end - start), '-map', '0:v:0', ...(mute ? ['-an'] : ['-map', '0:a:0?']), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', clip]);
    job.stage = 'Menggabungkan pengulangan';
    const list = join(job.directory, 'clips.txt');
    await writeFile(list, Array(repeats).fill("file 'clip.mp4'").join('\n'));
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'concat', '-safe', '1', '-i', list, '-c', 'copy', '-movflags', '+faststart', output]);
    job.state = 'done';
    job.stage = 'Video siap diunduh';
  } catch (err) {
    console.error('Video export:', err.message);
    job.state = 'error';
    job.stage = 'Ekspor gagal. Coba video yang lebih pendek atau format MP4.';
  } finally {
    await rm(input, { force: true });
    await rm(clip, { force: true });
    await rm(join(job.directory, 'clips.txt'), { force: true });
  }
}
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Hasil sudah kedaluwarsa. Silakan ekspor kembali.' });
  res.json({ id: job.id, state: job.state, stage: job.stage });
});
app.get('/api/jobs/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.state !== 'done') return res.status(404).json({ error: 'Video belum tersedia.' });
  res.download(join(job.directory, 'loop.mp4'), 'loop-studio.mp4');
});
app.use(express.static(join(root, 'public')));
app.use((err, req, res, _next) => {
  req.releaseSlot?.();
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran video maksimal 500 MB.' : 'Unggahan tidak valid. Pilih satu video maksimal 500 MB.' });
});
const cleanup = setInterval(() => {
  for (const [id, job] of jobs) {
    if (job.state !== 'processing' && Date.now() - job.created > TTL) {
      jobs.delete(id);
      void rm(job.directory, { recursive: true, force: true }).catch(console.error);
    }
  }
}, 60000);
cleanup.unref();
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`Loop Studio running on port ${port}`));
}
