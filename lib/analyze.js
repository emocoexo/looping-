import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { run, ff } from './process.js';
const W=48,H=28,FRAME=W*H*3;
const clamp=n=>Math.max(0,Math.min(1,n));
function imageFeature(frame) {
  const color=new Float32Array(12*7*3),gray=new Float32Array(W*H);
  let luminance=0,variance=0;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
    const p=(y*W+x)*3,c=(Math.floor(y/4)*12+Math.floor(x/4))*3;
    for(let k=0;k<3;k++) color[c+k]+=frame[p+k]/(255*16);
    const value=(frame[p]*0.299+frame[p+1]*0.587+frame[p+2]*0.114)/255;
    gray[y*W+x]=value;luminance+=value;variance+=value*value;
  }
  luminance/=W*H;variance=variance/(W*H)-luminance*luminance;
  return {color,gray,luminance,variance};
}
// Local block matching estimates direction and displacement, not object identity.
function flow(a,b) {
  const vector=[];
  for(let cy=6;cy<H-5;cy+=8) for(let cx=6;cx<W-5;cx+=8) {
    let best=Infinity,bx=0,by=0;
    for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++) {
      let loss=0;
      for(let y=-2;y<=2;y++) for(let x=-2;x<=2;x++) loss+=Math.abs(a[(cy+y)*W+cx+x]-b[(cy+y+dy)*W+cx+x+dx]);
      loss+=0.002*(Math.abs(dx)+Math.abs(dy));
      if(loss<best){best=loss;bx=dx;by=dy;}
    }
    vector.push(bx/3,by/3);
  }
  return vector;
}
function distance(a,b) {let d=0;for(let i=0;i<a.length;i++) d+=Math.abs(a[i]-b[i]);return d/a.length;}
function audioFeature(samples,center) {
  const count=1024,offset=Math.max(0,Math.min(Math.max(0,samples.length-count),Math.round(center*8000)-count/2));
  let energy=0,crossings=0,previous=0;
  const window=new Float32Array(count);
  for(let i=0;i<count;i++) {
    const x=samples[offset+i]||0;
    energy+=x*x;if(i && x*previous<0)crossings++;previous=x;
    window[i]=x*(0.5-0.5*Math.cos(2*Math.PI*i/(count-1)));
  }
  const spectrum=[];
  for(const hz of [100,200,400,800,1600,3000]) {
    const coeff=2*Math.cos(2*Math.PI*hz/8000);let q1=0,q2=0;
    for(const x of window){const q=x+coeff*q1-q2;q2=q1;q1=q;}
    spectrum.push(Math.log1p(Math.max(0,q1*q1+q2*q2-coeff*q1*q2)));
  }
  const total=spectrum.reduce((a,b)=>a+b,0)||1;
  return {db:Math.max(-80,10*Math.log10(energy/count+1e-10)),zcr:crossings/count,spectrum:spectrum.map(x=>x/total)};
}
export async function analyze(input,info,directory,{start,end},stage=()=>{}) {
  const span=end-start;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>Number(info.format.duration)+0.1||span<2||span>300) throw new Error('Pilih rentang analisis 2 detik sampai 5 menit.');
  const rate=Math.min(8,480/span),hasAudio=info.streams.some(s=>s.codec_type==='audio');
  const rgb=join(directory,'analysis.rgb'),pcm=join(directory,'analysis.f32');
  try {
    stage('Membaca gambar dan suara dalam rentang pilihan');
    await run('ffmpeg',[...ff,'-ss',String(start),'-protocol_whitelist','file,pipe','-i',input,'-t',String(span),'-an','-vf',`fps=${rate},scale=${W}:${H}:flags=area,format=rgb24`,'-f','rawvideo',rgb]);
    if(hasAudio) await run('ffmpeg',[...ff,'-ss',String(start),'-protocol_whitelist','file,pipe','-i',input,'-t',String(span),'-vn','-af',`apad,atrim=duration=${span}`,'-ac','1','-ar','8000','-f','f32le',pcm]);
    const data=await readFile(rgb),count=Math.floor(data.length/FRAME),features=[];
    let samples;
    if(hasAudio){const b=await readFile(pcm);samples=new Float32Array(b.length/4);for(let i=0;i<samples.length;i++)samples[i]=b.readFloatLE(i*4);}
    for(let i=0;i<count;i++) features.push(imageFeature(data.subarray(i*FRAME,(i+1)*FRAME)));
    // Estimate the exclusive end boundary from the final two samples so a
    // single full cycle can be considered, even without a duplicated last frame.
    const sampleTimes=features.map((_,i)=>i/rate);
    if(count>=2){
      const predicted=Buffer.alloc(FRAME),factor=(span-(count-1)/rate)*rate;
      for(let p=0;p<FRAME;p++)predicted[p]=Math.max(0,Math.min(255,Math.round(data[(count-1)*FRAME+p]+factor*(data[(count-1)*FRAME+p]-data[(count-2)*FRAME+p]))));
      features.push(imageFeature(predicted));sampleTimes.push(span);
    }
    stage('Membandingkan warna, gerakan, volume, dan spektrum audio');
    const motions=features.slice(0,-1).map((f,i)=>flow(f.gray,features[i+1].gray));
    motions.push(motions.at(-1));
    const audio=hasAudio?features.map((_,i)=>audioFeature(samples,sampleTimes[i])):null;
    const scored=[];
    for(let a=0;a<features.length-2;a++) for(let b=a+Math.ceil(1.5*rate);b<features.length && sampleTimes[b]-sampleTimes[a]<=30;b++) {
      const visual=clamp(1-distance(features[a].color,features[b].color)*3);
      const motion=clamp(1-distance(motions[a],motions[b])/1.2);
      const audioScore=hasAudio?clamp(1-(Math.abs(audio[a].db-audio[b].db)/36*0.45+distance(audio[a].spectrum,audio[b].spectrum)*3*0.4+Math.abs(audio[a].zcr-audio[b].zcr)*0.3)):null;
      const uninformative=features[a].variance<0.0003 && features[b].variance<0.0003;
      let score=(hasAudio?visual*0.5+motion*0.25+audioScore*0.25:visual*0.7+motion*0.3)*100;
      if(uninformative)score=Math.min(score,55);
      scored.push({a,b,score,visual:Math.round(visual*100),motion:Math.round(motion*100),audio:audioScore===null?null:Math.round(audioScore*100),uninformative});
    }
    scored.sort((a,b)=>b.score-a.score || (b.b-b.a)-(a.b-a.a));
    const candidates=[];
    for(const c of scored) {
      const s=Math.round((start+sampleTimes[c.a])*30)/30,e=Math.round((start+sampleTimes[c.b])*30)/30;
      if(candidates.some(other=>Math.abs(s-other.start)<0.75 && Math.abs(e-other.end)<0.75))continue;
      const videoFade=Math.round(Math.min((e-s)/4,0.2+(100-c.score)/100*1.1)*30)/30;
      const audioFade=hasAudio?Math.min(videoFade,Math.round((0.08+(100-c.audio)/100*0.4)*30)/30):0;
      candidates.push({start:s,end:e,score:Math.round(c.score),visual:c.visual,motion:c.motion,audio:c.audio,videoFade,audioFade,
        endEstimated:c.b===count,note:c.uninformative?'Gambar minim detail; skor tidak cukup untuk menilai gerakan.':c.score>=80?(c.b===count?'Batas akhir diperkirakan dari frame terakhir; periksa pratinjau.':'Kandidat kuat; periksa sambungan dan suara pada pratinjau.'):c.score>=60?'Ada perbedaan; crossfade dapat membantu menyamarkan sambungan.':'Kecocokan rendah; coba rentang lain atau mode ping-pong.'});
      if(candidates.length===5)break;
    }
    if(!candidates.length)throw new Error('Belum ditemukan kandidat. Pilih bagian video yang lebih panjang.');
    return {candidates,hasAudio,sampledFrames:count,sampleInterval:1/rate,range:{start,end},method:'Membandingkan tampilan, gerakan, volume, dan karakter suara. Skor adalah perkiraan, bukan jaminan seamless.'};
  }finally{await rm(rgb,{force:true});await rm(pcm,{force:true});}
}
