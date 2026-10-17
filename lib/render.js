import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run, command, probe, ff } from './process.js';
import { FPS } from '../public/options.js';
const encode=['-c:v','libx264','-threads','2','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-bf','0','-c:a','pcm_s16le'];
const num=n=>Number(n.toFixed(8));
export async function render(input,info,dir,o,stage=()=>{},preview=false) {
  const audio=!o.mute && info.streams.some(s=>s.codec_type==='audio');
  const L=o.clipFrames/FPS,D=o.overlapFrames/FPS,P=o.period;
  const base=join(dir,'base.mkv'),cycle=join(dir,'cycle.mkv');
  stage('Menyiapkan gambar 30 fps dan audio yang sinkron');
  await run('ffmpeg',[...ff,'-ss',String(o.start),'-protocol_whitelist','file,pipe','-i',input,'-t',String(L),
    '-map','0:v:0',...(audio?['-map','0:a:0']:['-an']),
    '-vf',`fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${o.clipFrames},settb=1/${FPS},setpts=N`,
    ...(audio?['-af',`aresample=48000,apad,atrim=end_sample=${o.clipFrames*1600},asetpts=N/SR/TB`,'-ac','2']:[]),...encode,base]);
  let parts;
  if(o.mode==='seamless') {
    stage('Membuat sambungan gambar dan audio melingkar');
    const n=o.clipFrames,d=o.overlapFrames;
    const weight=o.videoFade>0?`clip((T-${num((D-o.videoFade)/2)})/${num(o.videoFade)},0,1)`:`gte(T,${num(D/2)})`;
    const graph=[
      `[0:v]fps=${FPS},settb=1/${FPS},setpts=N,split=3[vb][vt][vh]`,
      `[vb]trim=start_frame=${d}:end_frame=${n-d},setpts=PTS-STARTPTS[body]`,
      `[vt]trim=start_frame=${n-d}:end_frame=${n},setpts=PTS-STARTPTS[tail]`,
      `[vh]trim=end_frame=${d},setpts=PTS-STARTPTS[head]`,
      `[tail][head]blend=shortest=1:all_expr='A*(1-(${weight}))+B*(${weight})'[mix]`,
      '[body][mix]concat=n=2:v=1:a=0,format=yuv420p[v]'
    ];
    if(audio) {
      graph.push('[0:a]asplit=3[ab][at][ah]',
        `[ab]atrim=start_sample=${d*1600}:end_sample=${(n-d)*1600},asetpts=PTS-STARTPTS[abody]`,
        `[at]atrim=start_sample=${(n-d)*1600}:end_sample=${n*1600},asetpts=PTS-STARTPTS[atail]`,
        `[ah]atrim=end_sample=${d*1600},asetpts=PTS-STARTPTS[ahead]`);
      if(o.audioFade>0) {
        const st=num((D-o.audioFade)/2);
        graph.push(`[atail]afade=t=out:st=${st}:d=${o.audioFade}:curve=tri[ao]`,
          `[ahead]afade=t=in:st=${st}:d=${o.audioFade}:curve=tri[ai]`,
          '[ao][ai]amix=inputs=2:duration=shortest:normalize=0[amix]');
      } else {
        const half=Math.floor(d*1600/2);
        graph.push(`[atail]atrim=end_sample=${half},asetpts=PTS-STARTPTS[ao]`,
          `[ahead]atrim=start_sample=${half},asetpts=PTS-STARTPTS[ai]`,
          '[ao][ai]concat=n=2:v=0:a=1[amix]');
      }
      graph.push('[abody][amix]concat=n=2:v=0:a=1,asetpts=N/SR/TB[a]');
    }
    await run('ffmpeg',[...ff,'-i',base,'-filter_complex',graph.join(';'),'-map','[v]',...(audio?['-map','[a]']:['-an']),...encode,'-t',String(P),cycle]);
    parts=[{name:'cycle.mkv',duration:P}];
  } else if(o.mode==='pingpong') {
    stage('Membalik gerakan dalam potongan kecil agar hemat memori');
    parts=[{name:'base.mkv',duration:L}];
    // Exclude duplicated turning-point frames; reverse at most 30 frames at once.
    for(let hi=o.clipFrames-1,index=0;hi>1;index++) {
      const lo=Math.max(1,hi-FPS),name=`reverse-${index}.mkv`,length=(hi-lo)/FPS;
      await run('ffmpeg',[...ff,'-ss',String(lo/FPS),'-i',base,'-t',String(length),'-map','0:v:0',...(audio?['-map','0:a:0']:['-an']),
        '-vf',`trim=end_frame=${hi-lo},reverse,settb=1/${FPS},setpts=N`,
        ...(audio?['-af',`atrim=end_sample=${(hi-lo)*1600},areverse,asetpts=N/SR/TB`]:[]),...encode,join(dir,name)]);
      parts.push({name,duration:length});hi=lo;
    }
  } else parts=[{name:'base.mkv',duration:L}];
  stage(preview?'Merender area sambungan untuk pratinjau':'Menggabungkan putaran dan menyandikan audio sekali');
  const previewStart=Math.max(0,P-Math.min(P,2));
  const outputDuration=preview?Math.min(4,2*P):o.totalDuration;
  const repeats=preview?3:Math.ceil(o.totalFrames/o.periodFrames);
  const list=join(dir,'cycles.txt');
  await writeFile(list,Array.from({length:repeats},()=>parts.map(p=>`file '${p.name}'\nduration ${num(p.duration)}`).join('\n')).join('\n'));
  const output=join(dir,'loop.mp4');
  await run('ffmpeg',[...ff,'-f','concat','-safe','1','-i',list,...(preview?['-ss',String(previewStart)]:[]),'-t',String(outputDuration),'-map','0:v:0',
    ...(audio?['-map','0:a:0','-af',`aresample=48000:async=1:first_pts=0,apad,atrim=duration=${outputDuration}`,'-c:a','aac','-b:a','192k']:['-an']),
    ...(preview?['-vf',`scale=w='min(960,iw)':h=-2,fps=${FPS}`,'-c:v','libx264','-threads','2','-preset','veryfast','-crf','20','-bf','0']:['-c:v','copy']),
    '-movflags','+faststart',output]);
  stage('Memeriksa durasi, sinkronisasi, dan frame di sambungan');
  const result=await probe(output),vs=result.streams.find(s=>s.codec_type==='video'),as=result.streams.find(s=>s.codec_type==='audio');
  const actual=Number(vs?.duration || result.format.duration);
  if(!vs || Math.abs(actual-outputDuration)>0.12)throw new Error('Durasi hasil tidak sesuai; pilih rentang atau target lain.');
  const seam=preview?Math.min(outputDuration, P-previewStart):Math.min(P,actual);
  const check=await command('ffmpeg',['-nostdin','-v','info','-ss',String(Math.max(0,seam-1)),'-i',output,'-t','2','-vf','blackdetect=d=0.04:pix_th=0.1','-f','null','-'],60000);
  const warnings=[];
  if(/black_start:/.test(check.stderr))warnings.push('Bagian gelap terdeteksi di sekitar sambungan; mungkin memang ada pada video asal. Periksa pratinjau.');
  const syncDelta=as?Math.abs(Number(as.duration)-actual):null;
  const syncStartDelta=as?Math.abs(Number(as.start_time||0)-Number(vs.start_time||0)):null;
  if(syncStartDelta>1/FPS)warnings.push('Timestamp awal audio dan gambar berbeda lebih dari satu frame; periksa sinkronisasi hasil.');
  if(syncDelta>0.08)warnings.push('Panjang trek audio dan gambar berbeda lebih dari 80 ms; periksa hasil unduhan.');
  if(!preview && o.totalFrames%o.periodFrames!==0)warnings.push('Target durasi memotong putaran terakhir. Gunakan jumlah putaran jika seluruh file akan di-loop kembali.');
  if(o.mode==='pingpong' && audio)warnings.push('Suara ikut dibalik pada bagian mundur; aktifkan Tanpa suara jika tidak sesuai.');
  return {actualDuration:actual,period:P,mode:o.mode,fps:FPS,width:vs.width,height:vs.height,hasAudio:!!as,syncDelta,syncStartDelta,warnings,seamTime:seam,
    checks:{duration:true,seamDecoded:true,blackDetected:/black_start:/.test(check.stderr)},preview};
}
