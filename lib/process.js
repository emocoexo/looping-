import { spawn } from 'node:child_process';
export function command(binary, args, timeout = 15*60*1000) {
  return new Promise((resolve,reject) => {
    const executable = binary === 'ffmpeg' ? (process.env.FFMPEG_PATH || binary) : binary === 'ffprobe' ? (process.env.FFPROBE_PATH || binary) : binary;
    const child = spawn(executable,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='',timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
    child.stdout.on('data',d=>stdout=(stdout+d).slice(-200000));
    child.stderr.on('data',d=>stderr=(stderr+d).slice(-32000));
    child.once('error',err=>{clearTimeout(timer);reject(err);});
    child.once('close',code=>{clearTimeout(timer);code===0?resolve({stdout,stderr}):reject(new Error(`${binary} gagal${timedOut?' (batas waktu)':''}: ${stderr.slice(-3000)}`));});
  });
}
export async function run(binary,args,timeout) {return (await command(binary,args,timeout)).stdout;}
export async function probe(input) {
  return JSON.parse(await run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',input],30000));
}
export const ff = ['-nostdin','-y','-v','error','-filter_complex_threads','1','-filter_threads','1'];
