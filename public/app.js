const $ = id => document.getElementById(id);
const video = $('video');
let file, objectUrl, duration = 0, start = 0, end = 0, repeats = 3, busy = false, timer;
const controls = ['reset','play','sound','full-range','start-range','end-range','start','end','repeats','minus','plus','mute','export'];
const format = seconds => { const n = Math.max(0, seconds || 0); return `${String(Math.floor(n / 60)).padStart(2,'0')}:${(n % 60).toFixed(1).padStart(4,'0')}`; };
const length = seconds => seconds < 60 ? `${Number(seconds.toFixed(1))} detik` : `${Math.floor(seconds / 60)} m ${Number((seconds % 60).toFixed(1))} d`;
function message(text) { $('message').textContent = text; $('message').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('message').hidden = true, 7000); }
function invalidateExport() { $('download').hidden = true; $('export-status').hidden = true; }
function setControls(enabled) { controls.forEach(id => $(id).disabled = !enabled || busy); document.querySelectorAll('[data-repeat]').forEach(el => el.disabled = !enabled || busy); $('choose').disabled = busy; $('change').disabled = busy; }
function update() {
  $('start').value = start.toFixed(1); $('end').value = end.toFixed(1);
  $('start-range').value = start; $('end-range').value = end;
  $('repeats').value = repeats;
  $('clip-duration').textContent = duration ? length(end-start) : '—';
  $('total-duration').textContent = duration ? length((end-start)*repeats) : '—';
  $('selection-label').textContent = duration ? `${format(start)} — ${format(end)}` : 'Pilih video untuk memulai';
  $('selection').style.left = `${duration ? start/duration*100 : 0}%`;
  $('selection').style.right = `${duration ? (1-end/duration)*100 : 0}%`;
  document.querySelectorAll('[data-repeat]').forEach(el => el.classList.toggle('selected', Number(el.dataset.repeat) === repeats));
  $('minus').disabled = !duration || busy || repeats === 1;
  $('plus').disabled = !duration || busy || repeats === 30;
  $('export').disabled = !duration || busy || (end-start)*repeats > 3600;
  $('export-hint').textContent = (end-start)*repeats > 3600 ? 'Hasil maksimal 60 menit. Kurangi rentang atau putaran.' : 'Tanpa watermark. Tanpa ribet.';
  $('play-time').innerHTML = `${format(video.currentTime)} <span>/ ${format(duration)}</span>`;
}
function reset() {
  video.pause(); video.removeAttribute('src'); video.load();
  if(objectUrl) URL.revokeObjectURL(objectUrl);
  file = undefined; objectUrl = undefined; duration = start = end = 0; repeats = 3;
  video.hidden = true; $('change').hidden = true; $('empty-state').hidden = false;
  $('video-badge').textContent = 'BELUM ADA VIDEO'; $('mute').checked = false; video.muted = false;
  $('sound').textContent = '♪'; $('sound').setAttribute('aria-label','Bisukan audio');
  $('ruler-start').textContent = $('ruler-mid').textContent = $('ruler-end').textContent = '00:00';
  $('file').value = ''; invalidateExport(); setControls(false); update();
}
function loadFile(chosen) {
  if (!chosen || busy) return;
  if (chosen.size > 500*1024*1024) return message('Ukuran video maksimal 500 MB.');
  if (!chosen.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v|ogv)$/i.test(chosen.name)) return message('Pilih berkas video MP4, MOV, atau WebM.');
  reset(); file = chosen; objectUrl = URL.createObjectURL(file); video.src = objectUrl;
}
$('choose').onclick = $('change').onclick = () => $('file').click();
$('file').onchange = e => loadFile(e.target.files[0]);
$('reset').onclick = reset;
const zone = $('dropzone');
['dragenter','dragover'].forEach(event => zone.addEventListener(event, e => { e.preventDefault(); if(!busy) zone.classList.add('dragging'); }));
['dragleave','drop'].forEach(event => zone.addEventListener(event, e => { e.preventDefault(); zone.classList.remove('dragging'); }));
zone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
video.addEventListener('loadedmetadata', () => {
  if (!Number.isFinite(video.duration) || video.duration < 0.1) { reset(); return message('Durasi video tidak valid atau terlalu pendek.'); }
  duration = video.duration; end = Math.floor(duration*10)/10; start = 0;
  for(const id of ['start-range','end-range','start','end']) $(id).max = end;
  $('empty-state').hidden = true; video.hidden = false; $('change').hidden = false;
  $('video-badge').textContent = `${video.videoWidth} × ${video.videoHeight}`;
  $('video-badge').title = file.name;
  $('ruler-mid').textContent = format(duration/2); $('ruler-end').textContent = format(duration);
  setControls(true); update();
});
video.addEventListener('error', () => { if(file) { reset(); message('Browser tidak dapat memutar video ini. Coba MP4 dengan codec H.264 atau WebM.'); } });
function updateRange(which, value) {
  if (!duration || !Number.isFinite(value)) return update();
  if(which === 'start') start = Math.max(0, Math.min(value, end-0.1));
  else end = Math.min(Math.floor(duration*10)/10, Math.max(value, start+0.1));
  invalidateExport();
  if(video.currentTime < start || video.currentTime >= end) video.currentTime = start;
  update();
}
['start','end'].forEach(id => { $(id).addEventListener('change', e => updateRange(id, Number(e.target.value))); $(id+'-range').addEventListener('input', e => updateRange(id, Number(e.target.value))); });
$('full-range').onclick = () => { start = 0; end = Math.floor(duration*10)/10; video.currentTime = 0; invalidateExport(); update(); };
function setRepeat(value) { repeats = Math.max(1, Math.min(30, Math.round(Number(value)) || 1)); invalidateExport(); update(); }
$('repeats').onchange = e => setRepeat(e.target.value);
$('minus').onclick = () => setRepeat(repeats-1); $('plus').onclick = () => setRepeat(repeats+1);
document.querySelectorAll('[data-repeat]').forEach(el => el.onclick = () => setRepeat(el.dataset.repeat));
function setMute(value) { video.muted = value; $('mute').checked = value; $('sound').textContent = value ? '∅' : '♪'; $('sound').setAttribute('aria-label', value ? 'Aktifkan audio' : 'Bisukan audio'); invalidateExport(); }
$('mute').onchange = e => setMute(e.target.checked); $('sound').onclick = () => setMute(!video.muted);
async function playPause() {
  if(!duration || busy) return;
  if(video.paused) { if(video.currentTime < start || video.currentTime >= end) video.currentTime = start; try { await video.play(); } catch { message('Video belum dapat diputar. Coba pilih video lain.'); } }
  else video.pause();
}
$('play').onclick = playPause;
video.addEventListener('play', () => { $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Jeda video'); });
video.addEventListener('pause', () => { $('play').textContent = '▶︎'; $('play').setAttribute('aria-label', 'Putar video'); });
video.addEventListener('timeupdate', update);
video.addEventListener('ended', () => { if(duration && !busy) { video.currentTime = start; void video.play().catch(() => {}); } });
function frame() { if(duration && !video.paused && video.currentTime >= end) video.currentTime = start; requestAnimationFrame(frame); } requestAnimationFrame(frame);
document.addEventListener('keydown', e => { if(e.code === 'Space' && !['INPUT','BUTTON','A','TEXTAREA'].includes(e.target.tagName)) { e.preventDefault(); void playPause(); } });
$('export').onclick = async () => {
  if (!file || busy) return;
  busy = true; video.pause(); setControls(false); invalidateExport();
  const status = $('export-status'); status.hidden = false; status.textContent = 'Mengunggah video…';
  const body = new FormData(); body.append('video', file); body.append('start', start); body.append('end', end); body.append('repeats', repeats); body.append('mute', $('mute').checked);
  try {
    const response = await fetch('/api/export', { method: 'POST', body });
    const data = await response.json(); if(!response.ok) throw new Error(data.error || 'Ekspor gagal.');
    const deadline = Date.now()+32*60*1000;
    while(Date.now()<deadline) {
      const check = await fetch(`/api/jobs/${data.id}`); const job = await check.json();
      if(!check.ok) throw new Error(job.error || 'Status ekspor tidak tersedia.');
      status.textContent = job.stage;
      if(job.state === 'error') throw new Error(job.stage);
      if(job.state === 'done') { $('download').href = `/api/jobs/${data.id}/download`; $('download').download = 'loop-studio.mp4'; $('download').hidden = false; return; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Proses terlalu lama. Coba potongan video yang lebih pendek.');
  } catch(err) { status.textContent = err.message === 'Failed to fetch' ? 'Koneksi terputus. Periksa server lalu coba ekspor kembali.' : err.message; }
  finally { busy = false; setControls(!!duration); update(); }
};
update();
