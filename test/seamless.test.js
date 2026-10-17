import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { app,run,validateOptions } from '../server.js';
let dir,server,url,fixture,silent,assetId;
before(async()=>{
  dir=await mkdtemp(join(tmpdir(),'auto-seamless-test-'));fixture=join(dir,'periodic.mp4');silent=join(dir,'silent.mp4');
  await run('ffmpeg',['-v','error','-f','lavfi','-i',"nullsrc=s=160x96:r=30,geq=lum='128+60*sin(2*PI*(X/W+T/2))':cb='128+40*cos(2*PI*T/2)':cr=128",'-f','lavfi','-i','sine=frequency=443:sample_rate=48000','-t','6','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac',fixture]);
  await run('ffmpeg',['-v','error','-i',fixture,'-c:v','copy','-an',silent]);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
async function request(kind,options={},path=fixture,reuse=false){
  const body=new FormData();if(reuse)body.append('assetId',assetId);else body.append('video',new Blob([await readFile(path)]),'input.mp4');
  for(const [k,v]of Object.entries({start:0,end:6,repeats:3,...options}))body.append(k,String(v));
  const response=await fetch(`${url}/api/${kind}`,{method:'POST',body});const data=await response.json();assert.equal(response.status,202,JSON.stringify(data));assetId=data.assetId;
  const deadline=Date.now()+60000;let job;
  do {job=await(await fetch(`${url}/api/jobs/${data.id}`)).json();if(job.state!=='processing')break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
  assert.equal(job.state,'done',job.stage);return job;
}
async function download(job,name){const r=await fetch(`${url}/api/jobs/${job.id}/download`);assert.equal(r.status,200);const path=join(dir,name);await writeFile(path,Buffer.from(await r.arrayBuffer()));return path;}
async function rawFrames(path,name){const target=join(dir,name);await run('ffmpeg',['-v','error','-i',path,'-an','-vf','scale=32:16,format=gray','-f','rawvideo',target]);return readFile(target);}
function frameDelta(data,a,b){let sum=0;for(let p=0;p<512;p++)sum+=Math.abs(data[a*512+p]-data[b*512+p]);return sum/512;}
test('analysis finds matching phases in a known two-second periodic video with audio',async()=>{
  const job=await request('analyze');assert.ok(job.result.candidates.length>=3);assert.equal(job.result.hasAudio,true);
  const c=job.result.candidates[0];assert.ok(c.score>85,JSON.stringify(c));assert.ok(c.visual>90);assert.ok(c.motion>85);assert.ok(c.audio>85);
  const periods=(c.end-c.start)/2;assert.ok(Math.abs(periods-Math.round(periods))<0.1,JSON.stringify(c));
});
test('analysis handles a silent video without inventing an audio score',async()=>{
  const job=await request('analyze',{},silent);assert.equal(job.result.hasAudio,false);assert.ok(job.result.candidates.every(c=>c.audio===null&&c.audioFade===0));
});
test('crossfade exports synchronized cycles with independent picture and audio transitions',async()=>{
  const job=await request('export',{start:0.2,end:3.6,mode:'seamless',videoFade:0.5,audioFade:0.2});
  assert.equal(job.result.period,2.9);assert.ok(Math.abs(job.result.actualDuration-8.7)<0.04);assert.ok(job.result.syncDelta<0.05);assert.equal(job.result.checks.blackDetected,false);
  const path=await download(job,'seamless.mp4');await run('ffmpeg',['-v','error','-i',path,'-f','null','-']);
  const frames=await rawFrames(path,'frames.raw');assert.equal(frames.length/512,261);
  // Real decoded seams must look like a small adjacent-frame step, without black frames.
  assert.ok(frameDelta(frames,86,87)<8,'first rendered seam');assert.ok(frameDelta(frames,173,174)<8,'second rendered seam');
  const pcm=join(dir,'sound.f32');await run('ffmpeg',['-v','error','-i',path,'-vn','-ac','1','-ar','48000','-f','f32le',pcm]);const samples=await readFile(pcm);
  for(const t of [2.9,5.8]){const n=Math.round(t*48000);const step=Math.abs(samples.readFloatLE(n*4)-samples.readFloatLE((n-1)*4));assert.ok(step<0.035,`audio boundary jump ${step}`);}
});
test('audio-only and video-only fades preserve the same shared period, including mute',async()=>{
  for(const options of [{videoFade:0,audioFade:0.4},{videoFade:0.4,audioFade:0},{videoFade:0.4,audioFade:0.2,mute:true}]){
    const job=await request('export',{end:3,mode:'seamless',repeats:2,...options});assert.equal(job.result.period,2.6);assert.ok(Math.abs(job.result.actualDuration-5.2)<0.05);assert.equal(job.result.hasAudio,!options.mute);
  }
});
test('ping-pong reverses frame order without duplicating turning points',async()=>{
  const job=await request('export',{end:2,mode:'pingpong',repeats:2,mute:true});const path=await download(job,'pingpong.mp4');
  const frames=await rawFrames(path,'pingpong.raw');assert.equal(frames.length/512,236);assert.ok(Math.abs(job.result.actualDuration-236/30)<0.04);
  for(const [a,b]of [[10,108],[40,78],[58,60]])assert.ok(frameDelta(frames,a,b)<3,`reverse pair ${a},${b}`);
});
test('target duration and preview use a reusable source and expose validation results',async()=>{
  const job=await request('export',{end:3,mode:'seamless',videoFade:0.5,audioFade:0.2,outputMode:'duration',targetDuration:7});assert.ok(Math.abs(job.result.actualDuration-7)<0.04);assert.ok(job.result.warnings.some(s=>s.includes('memotong')));
  const preview=await request('preview',{end:3,mode:'seamless',videoFade:0.5,audioFade:0.2},fixture,true);
  assert.equal(preview.result.preview,true);assert.ok(preview.result.seamTime>0);assert.ok(preview.result.seamTime<preview.result.actualDuration);
  const response=await fetch(`${url}/api/jobs/${preview.id}/media`,{headers:{Range:'bytes=0-99'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,100);
});
test('validates unsafe or impossible analysis/render settings',async()=>{
  for(const o of [{mode:'unknown'},{mode:'seamless',videoFade:2},{mode:'seamless',videoFade:0,audioFade:0},{videoFade:NaN},{outputMode:'duration',targetDuration:0},{outputMode:'duration',targetDuration:3601}])assert.throws(()=>validateOptions({start:0,end:3,repeats:3,...o},6));
  assert.throws(()=>validateOptions({start:0,end:31,repeats:2,mode:'pingpong'},32));
  const body=new FormData();body.append('assetId',assetId);body.append('start','0');body.append('end','1');
  assert.equal((await fetch(url+'/api/analyze',{method:'POST',body})).status,400);
});
test('low-detail footage is not presented as a high-confidence seamless match',async()=>{
  const black=join(dir,'black.mp4');await run('ffmpeg',['-v','error','-f','lavfi','-i','color=black:s=160x96:r=30','-t','4','-c:v','libx264','-threads','2',black]);
  const analysis=await request('analyze',{end:4},black);assert.ok(analysis.result.candidates.every(c=>c.score<=55));
  const job=await request('export',{end:3,mode:'seamless',videoFade:0.4,audioFade:0,repeats:2},black,true);
  assert.equal(job.result.checks.blackDetected,true);assert.ok(job.result.warnings.some(s=>s.includes('gelap')));
});
test('variable-frame-rate input with short audio stays aligned over 30 crossfaded cycles',async()=>{
  const vfr=join(dir,'vfr-short-audio.mp4');
  await run('ffmpeg',['-v','error','-i',fixture,'-filter_complex',"[0:v]select='not(mod(n,3))+not(mod(n,5))'[v];[0:a]atrim=end=1[a]",'-map','[v]','-map','[a]','-fps_mode','vfr','-c:v','libx264','-threads','2','-c:a','aac',vfr]);
  const job=await request('export',{end:3,mode:'seamless',videoFade:0.4,audioFade:0.2,repeats:30},vfr);
  assert.ok(Math.abs(job.result.actualDuration-78)<0.04);assert.ok(job.result.syncDelta<0.05);
  const path=await download(job,'long.mp4');
  const info=JSON.parse(await run('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',path]));
  assert.equal(Number(info.streams.find(s=>s.codec_type==='video').nb_read_frames),2340);
  await run('ffmpeg',['-v','error','-i',path,'-f','null','-']);
});
test('analysis can consider the full boundary of a single cycle',async()=>{
  const job=await request('analyze',{end:2});
  assert.ok(job.result.candidates.some(c=>c.start<0.1&&Math.abs(c.end-2)<0.05&&c.endEstimated&&c.visual>85),JSON.stringify(job.result.candidates));
});
