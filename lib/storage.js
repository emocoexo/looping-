import { readdir,stat,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export const MARKER='.loop-studio-owned-v2';
export const TTL=60*60*1000;
export async function touchDirectory(directory){await writeFile(join(directory,MARKER),'Loop Studio temporary workspace v2\n');}
// Only remove folders explicitly created by this version, including abandoned
// work after a restart. Symlinked directories and unrelated temp files are skipped.
export async function sweepTemporary(root=tmpdir(),now=Date.now()){
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!/^loop-studio-(?:job-)?[A-Za-z0-9]{6}$/.test(entry.name))continue;
    const directory=join(root,entry.name);
    try{const marker=await stat(join(directory,MARKER));if(now-marker.mtimeMs>TTL)await rm(directory,{recursive:true,force:true});}
    catch(err){if(err.code!=='ENOENT'&&err.code!=='EACCES'&&err.code!=='EPERM')throw err;}
  }
}
