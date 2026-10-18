import express from 'express';
import multer from 'multer';
import { mkdtemp, rm, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { probe } from './lib/process.js';
import { analyze } from './lib/analyze.js';
import { render } from './lib/render.js';
import { validateOptions } from './public/options.js';
import { MARKER, TTL, touchDirectory, sweepTemporary } from './lib/storage.js';
export { run } from './lib/process.js';
export { validateOptions } from './public/options.js';
const root=dirname(fileURLToPath(import.meta.url));
export const app=express();
const jobs=new Map(),assets=new Map();
let active=0;
app.disable('x-powered-by');
app.use((_req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");next();
});
app.get('/api/health',(_req,res)=>res.json({status:'ok',version:'2.1.0'}));
const upload=multer({dest:tmpdir(),limits:{fileSize:500*1024*1024,files:1,fields:16,fieldSize:1024}});
function reserve(req,res,next){
  if(active>=2)return res.status(429).json({error:'Dua proses sedang berjalan. Coba kembali setelah selesai.'});
  active++;let released=false;
  req.releaseSlot=()=>{if(!released){active--;released=true;}};next();
}
for(const kind of ['analyze','preview','export']) app.post(`/api/${kind}`,reserve,upload.single('video'),async(req,res)=>{
  let asset,dir,newAsset=false;
  try{
    if(req.file){
      const info=await probe(req.file.path),video=info.streams.find(s=>s.codec_type==='video');
      if(!video||!Number.isFinite(Number(info.format.duration)))throw new Error('Berkas tidak berisi video yang valid.');
      if(video.width*video.height>4096*2160)throw new Error('Resolusi maksimal setara 4K (4096 × 2160).');
      dir=await mkdtemp(join(tmpdir(),'loop-studio-'));const id=randomUUID(),path=join(dir,'source');
      await rename(req.file.path,path);
      asset={id,path,info,dir,created:Date.now(),users:0};assets.set(id,asset);newAsset=true;
    }else{
      if(!req.body.assetId)throw new Error('Pilih video terlebih dahulu.');
      asset=assets.get(req.body.assetId);
      if(!asset){req.releaseSlot();return res.status(404).json({error:'Video sementara kedaluwarsa. Pilih ulang video atau unggah kembali.'});}
    }
    const duration=Number(asset.info.format.duration);
    let options;
    if(kind==='analyze'){
      const start=Number(req.body.start),end=Number(req.body.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+0.1||end-start<2||end-start>300)throw new Error('Pilih rentang analisis 2 detik sampai 5 menit.');
      options={start,end:Math.min(end,duration)};
    }else options=validateOptions(req.body,duration);
    const directory=await mkdtemp(join(tmpdir(),'loop-studio-job-')),id=randomUUID();
    await touchDirectory(directory);await touchDirectory(asset.dir);
    const job={id,kind,state:'processing',stage:'Menyiapkan proses',directory,created:Date.now(),assetId:asset.id};
    jobs.set(id,job);asset.users++;asset.created=Date.now();
    res.status(202).json({id,assetId:asset.id});
    void (async()=>{
      try{
        const stage=value=>job.stage=value;
        job.result=kind==='analyze'?await analyze(asset.path,asset.info,directory,options,stage):await render(asset.path,asset.info,directory,options,stage,kind==='preview');
        job.state='done';job.stage=kind==='analyze'?'Kandidat sambungan siap':kind==='preview'?'Pratinjau sambungan siap':'Video siap diunduh';
      }catch(err){
        console.error(`${kind}:`,err.message);job.state='error';
        job.stage=/^(ffmpeg|ffprobe)/.test(err.message)?'Pemrosesan video gagal. Coba rentang lebih pendek atau format MP4 H.264.':err.message;
      }finally{
        asset.users--;asset.created=Date.now();job.created=Date.now();req.releaseSlot();
        await touchDirectory(directory);await touchDirectory(asset.dir);
        // Keep only the final output; source assets expire separately for reuse.
        for(const entry of await readdir(directory))if(entry!=='loop.mp4'&&entry!==MARKER)await rm(join(directory,entry),{force:true,recursive:true});
      }
    })().catch(err=>console.error('Job cleanup:',err.message));
  }catch(err){
    req.releaseSlot();if(req.file)await rm(req.file.path,{force:true});
    if(newAsset){assets.delete(asset.id);await rm(asset.dir,{recursive:true,force:true});}
    else if(dir)await rm(dir,{recursive:true,force:true});
    console.error('Validation:',err.message);
    res.status(400).json({error:/^(ffmpeg|ffprobe)/.test(err.message)?'Video tidak dapat dibaca. Gunakan MP4, MOV, atau WebM yang valid.':err.message});
  }
});
app.get('/api/jobs/:id',(req,res)=>{
  const job=jobs.get(req.params.id);if(!job)return res.status(404).json({error:'Hasil sudah kedaluwarsa. Proses ulang video.'});
  res.json({id:job.id,kind:job.kind,state:job.state,stage:job.stage,assetId:job.assetId,result:job.result});
});
app.get('/api/jobs/:id/:action',(req,res)=>{
  const job=jobs.get(req.params.id);
  if(!job||job.state!=='done'||job.kind==='analyze'||!['download','media'].includes(req.params.action))return res.status(404).json({error:'Video belum tersedia.'});
  if(req.params.action==='download')res.download(join(job.directory,'loop.mp4'),'loop-studio.mp4');
  else res.sendFile(join(job.directory,'loop.mp4'));
});
app.use(express.static(join(root,'public')));
app.use((err,req,res,_next)=>{req.releaseSlot?.();res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'Ukuran video maksimal 500 MB.':'Unggahan tidak valid. Pilih satu video maksimal 500 MB.'});});
void sweepTemporary().catch(err=>console.error('Temporary cleanup:',err.message));
const cleanup=setInterval(()=>{
  void (async()=>{
    for(const job of jobs.values())if(job.state==='processing')await touchDirectory(job.directory);
    for(const asset of assets.values())if(asset.users>0)await touchDirectory(asset.dir);
    await sweepTemporary();
  })().catch(err=>console.error('Temporary cleanup:',err.message));
  for(const [id,job]of jobs)if(job.state!=='processing'&&Date.now()-job.created>TTL){jobs.delete(id);void rm(job.directory,{recursive:true,force:true}).catch(console.error);}
  for(const [id,asset]of assets)if(asset.users===0&&Date.now()-asset.created>TTL){assets.delete(id);void rm(asset.dir,{recursive:true,force:true}).catch(console.error);}
},60000);cleanup.unref();
if(process.argv[1]===fileURLToPath(import.meta.url))app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Loop Studio running on port ${process.env.PORT||3000}`));
