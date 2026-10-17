import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, run, validateOptions } from '../server.js';
let server, base, fixture, directory;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'loop-test-'));
  fixture = join(directory, 'sample.mp4');
  await run('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-c:a','aac',fixture]);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive:true, force:true }); });

test('rejects invalid ranges, repeat counts, and excessive output duration', () => {
  for (const body of [{start:-1,end:2,repeats:3},{start:2,end:1,repeats:3},{start:0,end:9,repeats:3},{start:0,end:2,repeats:31},{start:0,end:2,repeats:1.5}]) assert.throws(() => validateOptions(body,3));
  assert.throws(() => validateOptions({start:0,end:300,repeats:30},400));
});
test('serves the application and health endpoint', async () => {
  assert.equal((await fetch(base+'/api/health')).status,200);
  const response = await fetch(base); assert.match(await response.text(), /Video looper/);
});
test('rejects missing files, invalid video, and unknown job IDs', async () => {
  assert.equal((await fetch(base+'/api/export',{method:'POST',body:new FormData()})).status,400);
  const form = new FormData(); form.append('video',new Blob(['invalid']),'bad.mp4');
  assert.equal((await fetch(base+'/api/export',{method:'POST',body:form})).status,400);
  assert.equal((await fetch(base+'/api/jobs/no-such-job')).status,404);
});
for (const mute of [false,true]) test(`exports a trimmed 3x loop with mute=${mute}`, async () => {
  const body = new FormData(); body.append('video',new Blob([await readFile(fixture)],{type:'video/mp4'}),'sample.mp4');
  Object.entries({start:'0.5',end:'1.5',repeats:'3',mute:String(mute)}).forEach(([key,value])=>body.append(key,value));
  const response = await fetch(base+'/api/export',{method:'POST',body}); assert.equal(response.status,202);
  const {id} = await response.json(); let job;
  const deadline = Date.now()+30000;
  do { job = await (await fetch(base+`/api/jobs/${id}`)).json(); if(job.state==='processing') await new Promise(resolve=>setTimeout(resolve,100)); } while(job.state==='processing' && Date.now()<deadline);
  assert.equal(job.state,'done');
  const download = await fetch(base+`/api/jobs/${id}/download`); assert.equal(download.status,200);
  const output = join(directory,`result-${mute}.mp4`); await writeFile(output,Buffer.from(await download.arrayBuffer()));
  const info = JSON.parse(await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',output]));
  assert.ok(Math.abs(Number(info.format.duration)-3)<0.2, `Expected 3 seconds, got ${info.format.duration}`);
  assert.equal(info.streams.some(s=>s.codec_type==='audio'),!mute);
  const stream = info.streams.find(s=>s.codec_type==='video'); assert.equal(stream.codec_name,'h264'); assert.equal(stream.width,320); assert.equal(stream.height,180);
  await run('ffmpeg',['-v','error','-i',output,'-f','null','-']);
});
