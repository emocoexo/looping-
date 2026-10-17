import { validateOptions, FPS } from './options.js';
const $=id=>document.getElementById(id),video=$('video');
let file,objectUrl,assetId,duration=0,start=0,end=0,repeats=3,busy=false,timer,candidates=[],selected=-1;
const controls=['reset','play','sound','full-range','start-range','end-range','start','end','repeats','minus','plus','mute','export','analyze','preview','mode','video-fade','audio-fade','output-mode','target-duration'];
const format=seconds=>{const n=Math.max(0,seconds||0);return `${String(Math.floor(n/60)).padStart(2,'0')}:${(n%60).toFixed(2).padStart(5,'0')}`;};
const length=n=>n<60?`${Number(n.toFixed(2))} detik`:`${Math.floor(n/60)} m ${Number((n%60).toFixed(2))} d`;
function message(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('message').hidden=true,8000);}
function values(){return {start,end,repeats,mode:$('mode').value,videoFade:$('video-fade').value,audioFade:$('audio-fade').value,outputMode:$('output-mode').value,targetDuration:$('target-duration').value,mute:$('mute').checked};}
function invalidate(){ $('download').hidden=true;$('export-status').hidden=true;$('validation').hidden=true;$('preview-status').hidden=true;$('preview-note').hidden=true;$('seam-preview').pause();$('seam-preview').removeAttribute('src');$('seam-preview').load();$('seam-preview').hidden=true;$('preview-empty').hidden=false; }
function setControls(){controls.forEach(id=>$(id).disabled=!duration||busy);document.querySelectorAll('[data-repeat],[data-frame],.candidate').forEach(el=>el.disabled=!duration||busy);$('choose').disabled=busy;$('change').disabled=busy;}
function clock(){$('play-time').textContent=`${format(video.currentTime)} / ${format(duration)}`;}
function update(){
  setControls();$('start').value=Number(start.toFixed(3));$('end').value=Number(end.toFixed(3));$('start-range').value=start;$('end-range').value=end;$('repeats').value=repeats;
  $('clip-duration').textContent=duration?length(end-start):'—';$('selection-label').textContent=duration?`${format(start)} — ${format(end)}`:'Pilih video untuk memulai';
  $('selection').style.left=`${duration?start/duration*100:0}%`;$('selection').style.right=`${duration?(1-end/duration)*100:0}%`;
  $('fade-fields').hidden=$('mode').value!=='seamless';$('repeat-fields').hidden=$('output-mode').value!=='repeats';$('target-field').hidden=$('output-mode').value!=='duration';
  $('mode-note').textContent=$('mode').value==='seamless'?'Siklus berkurang sebesar transisi terpanjang. Gambar dan audio tetap sinkron.':$('mode').value==='pingpong'?'Maju lalu mundur, tanpa menggandakan frame titik balik. Audio juga dibalik. Rentang maksimal 30 detik.':'Mengulang potongan tanpa transisi tambahan.';
  $('minus').disabled=!duration||busy||repeats===1;$('plus').disabled=!duration||busy||repeats===30;
  document.querySelectorAll('[data-repeat]').forEach(el=>el.classList.toggle('selected',Number(el.dataset.repeat)===repeats));
  document.querySelectorAll('.candidate').forEach((el,i)=>{el.classList.toggle('selected',i===selected);el.setAttribute('aria-pressed',String(i===selected));});
  try{
    if(!duration)throw new Error('Pilih video untuk memulai.');
    const p=validateOptions(values(),duration);$('period-duration').textContent=length(p.period);$('total-duration').textContent=length(p.totalDuration);
    $('export-hint').textContent=p.totalFrames%p.periodFrames?'Target memotong putaran terakhir. Untuk file berulang utuh, pilih jumlah putaran.':'Tanpa watermark · transisi diperiksa saat ekspor';
  }catch(err){$('period-duration').textContent=$('total-duration').textContent='—';$('export').disabled=$('preview').disabled=true;$('export-hint').textContent=err.message;}
  clock();
}
function reset(){
  video.pause();video.removeAttribute('src');video.load();if(objectUrl)URL.revokeObjectURL(objectUrl);
  file=objectUrl=assetId=undefined;duration=start=end=0;repeats=3;candidates=[];selected=-1;
  video.hidden=true;$('change').hidden=true;$('empty-state').hidden=false;$('video-badge').textContent='BELUM ADA VIDEO';$('mute').checked=false;video.muted=false;
  $('mode').value='seamless';$('video-fade').value='0.5';$('audio-fade').value='0.2';$('output-mode').value='repeats';$('target-duration').value='60';
  $('sound').textContent='♪';$('sound').setAttribute('aria-label','Bisukan audio');$('candidates').replaceChildren();$('analysis-status').hidden=true;$('analysis-note').textContent='Skor adalah perkiraan kecocokan, bukan jaminan seamless. Semua analisis diproses lokal pada versi Windows.';
  $('ruler-start').textContent=$('ruler-mid').textContent=$('ruler-end').textContent='00:00';$('file').value='';invalidate();update();
}
function loadFile(chosen){if(!chosen||busy)return;if(chosen.size>500*1024*1024)return message('Ukuran video maksimal 500 MB.');if(!chosen.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v|ogv)$/i.test(chosen.name))return message('Pilih berkas video MP4, MOV, atau WebM.');reset();file=chosen;objectUrl=URL.createObjectURL(file);video.src=objectUrl;}
$('choose').onclick=$('change').onclick=()=>$('file').click();$('file').onchange=e=>loadFile(e.target.files[0]);$('reset').onclick=reset;
const zone=$('dropzone');['dragenter','dragover'].forEach(event=>zone.addEventListener(event,e=>{e.preventDefault();if(!busy)zone.classList.add('dragging');}));['dragleave','drop'].forEach(event=>zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('dragging');}));zone.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
video.addEventListener('loadedmetadata',()=>{
  if(!Number.isFinite(video.duration)||video.duration<0.1){reset();return message('Durasi video tidak valid atau terlalu pendek.');}
  duration=video.duration;end=Math.floor(duration*FPS)/FPS;start=0;
  for(const id of ['start-range','end-range','start','end'])$(id).max=end;
  $('empty-state').hidden=true;video.hidden=false;$('change').hidden=false;$('video-badge').textContent=`${video.videoWidth} × ${video.videoHeight}`;$('video-badge').title=file.name;
  $('ruler-mid').textContent=format(duration/2);$('ruler-end').textContent=format(duration);update();
});
video.addEventListener('error',()=>{if(file){reset();message('Browser tidak dapat memutar video ini. Coba MP4 H.264 atau WebM.');}});
function updateRange(which,value){if(!duration||!Number.isFinite(value))return update();value=Math.round(value*FPS)/FPS;if(which==='start')start=Math.max(0,Math.min(value,end-3/FPS));else end=Math.min(Math.floor(duration*FPS)/FPS,Math.max(value,start+3/FPS));selected=-1;invalidate();if(video.currentTime<start||video.currentTime>=end)video.currentTime=start;update();}
['start','end'].forEach(id=>{$(id).addEventListener('change',e=>updateRange(id,Number(e.target.value)));$(id+'-range').addEventListener('input',e=>updateRange(id,Number(e.target.value)));});
document.querySelectorAll('[data-frame]').forEach(el=>el.onclick=()=>{const [which,step]=el.dataset.frame.split(':');updateRange(which,(which==='start'?start:end)+Number(step)/FPS);});
$('full-range').onclick=()=>{start=0;end=Math.floor(duration*FPS)/FPS;selected=-1;video.currentTime=0;invalidate();update();};
function setRepeat(value){repeats=Math.max(1,Math.min(30,Math.round(Number(value))||1));invalidate();update();}
$('repeats').onchange=e=>setRepeat(e.target.value);$('minus').onclick=()=>setRepeat(repeats-1);$('plus').onclick=()=>setRepeat(repeats+1);document.querySelectorAll('[data-repeat]').forEach(el=>el.onclick=()=>setRepeat(el.dataset.repeat));
for(const id of ['mode','video-fade','audio-fade','output-mode','target-duration'])$(id).onchange=()=>{invalidate();update();};
function setMute(value){video.muted=value;$('mute').checked=value;$('sound').textContent=value?'∅':'♪';$('sound').setAttribute('aria-label',value?'Aktifkan audio':'Bisukan audio');invalidate();update();}
$('mute').onchange=e=>setMute(e.target.checked);$('sound').onclick=()=>setMute(!video.muted);
async function playPause(){if(!duration||busy)return;if(video.paused){if(video.currentTime<start||video.currentTime>=end)video.currentTime=start;try{await video.play();}catch{message('Video belum dapat diputar.');}}else video.pause();}
$('play').onclick=playPause;video.addEventListener('play',()=>{$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Jeda video');});video.addEventListener('pause',()=>{$('play').textContent='▶︎';$('play').setAttribute('aria-label','Putar video');});video.addEventListener('timeupdate',clock);
video.addEventListener('ended',()=>{if(duration&&!busy){video.currentTime=start;void video.play().catch(()=>{});}});
function frame(){if(duration&&!video.paused&&video.currentTime>=end)video.currentTime=start;requestAnimationFrame(frame);}requestAnimationFrame(frame);
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','BUTTON','A','TEXTAREA','SELECT','VIDEO'].includes(e.target.tagName)){e.preventDefault();void playPause();}});
async function requestJob(kind,status){
  status.hidden=false;status.textContent=assetId?'Menyiapkan video…':'Mengunggah video ke pemroses…';
  async function submit(){const body=new FormData();if(assetId)body.append('assetId',assetId);else body.append('video',file);for(const [key,value]of Object.entries(values()))body.append(key,String(value));return fetch(`/api/${kind}`,{method:'POST',body});}
  let response=await submit();if(response.status===404&&assetId){assetId=undefined;response=await submit();}
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Proses gagal.');assetId=data.assetId;
  const deadline=Date.now()+60*60*1000;
  while(Date.now()<deadline){
    const check=await fetch(`/api/jobs/${data.id}`),job=await check.json();if(!check.ok)throw new Error(job.error||'Status tidak tersedia.');status.textContent=job.stage;
    if(job.state==='error')throw new Error(job.stage);if(job.state==='done')return job;
    await new Promise(resolve=>setTimeout(resolve,700));
  }throw new Error('Proses terlalu lama. Coba rentang lebih pendek.');
}
async function perform(kind,status,onDone){
  if(!file||busy)return;busy=true;video.pause();$('seam-preview').pause();update();
  try{await onDone(await requestJob(kind,status));}catch(err){status.hidden=false;status.textContent=err.message==='Failed to fetch'?'Koneksi terputus. Periksa aplikasi lalu coba kembali.':err.message;}
  finally{busy=false;update();}
}
function applyCandidate(index){const c=candidates[index];selected=index;start=c.start;end=c.end;$('mode').value='seamless';$('video-fade').value=c.videoFade.toFixed(3);$('audio-fade').value=c.audioFade.toFixed(3);video.currentTime=start;invalidate();update();}
$('analyze').onclick=()=>{
  if(end-start<2||end-start>300)return message('Pilih rentang analisis 2 detik sampai 5 menit melalui pengatur awal–akhir.');
  invalidate();void perform('analyze',$('analysis-status'),async job=>{
    candidates=job.result.candidates;$('candidates').replaceChildren();
    candidates.forEach((c,i)=>{const button=document.createElement('button');button.className='candidate';button.type='button';button.setAttribute('aria-pressed','false');
      const title=document.createElement('strong');title.textContent=`${i+1}. ${format(c.start)} → ${format(c.end)}`;
      const score=document.createElement('span');score.className='score';score.textContent=`${c.score}/100`;
      const scores=document.createElement('span');scores.className='scores';scores.textContent=`Gambar ${c.visual} · Gerak ${c.motion} · Audio ${c.audio===null?'tidak ada':c.audio}`;
      const note=document.createElement('span');note.className='candidate-note';note.textContent=c.note;button.append(title,score,scores,note);button.onclick=()=>applyCandidate(i);$('candidates').append(button);
    });
    $('analysis-note').textContent=`${job.result.sampledFrames} sampel, interval ${job.result.sampleInterval.toFixed(2)} detik, rentang ${format(job.result.range.start)}–${format(job.result.range.end)}. ${job.result.method}`;
    applyCandidate(0);
  });
};
$('preview').onclick=()=>{invalidate();void perform('preview',$('preview-status'),async job=>{
  const p=$('seam-preview');p.src=`/api/jobs/${job.id}/media`;p.hidden=false;$('preview-empty').hidden=true;
  $('preview-note').hidden=false;$('preview-note').textContent=`Sambungan berada sekitar detik ${job.result.seamTime.toFixed(2)} pada pratinjau. ${job.result.warnings.join(' ')}`;
  p.load();
});};
$('export').onclick=()=>{$('download').hidden=true;$('validation').hidden=true;void perform('export',$('export-status'),async job=>{
  $('download').href=`/api/jobs/${job.id}/download`;$('download').download='loop-studio.mp4';$('download').hidden=false;
  const checks=$('validation');checks.replaceChildren();checks.hidden=false;
  const label=document.createElement('div');label.textContent=`✓ Hasil ${length(job.result.actualDuration)} · ${job.result.width} × ${job.result.height} · ${job.result.fps} fps. Area sambungan berhasil didekode.`;checks.append(label);
  for(const warning of job.result.warnings){const p=document.createElement('p');p.textContent=warning;checks.append(p);}
});};
update();
