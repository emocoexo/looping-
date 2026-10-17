import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,utimes,access,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MARKER,TTL,touchDirectory,sweepTemporary } from '../lib/storage.js';
test('restart cleanup removes only expired marked workspaces, preserving fresh and unrelated folders',async()=>{
  const root=await mkdtemp(join(tmpdir(),'loop-cleanup-test-'));
  try{
    const stale=join(root,'loop-studio-job-abc123'),fresh=join(root,'loop-studio-new123'),unrelated=join(root,'loop-studio-own123');
    for(const path of [stale,fresh,unrelated])await mkdir(path);
    await touchDirectory(stale);await touchDirectory(fresh);
    const old=new Date(Date.now()-TTL-5000);await utimes(join(stale,MARKER),old,old);
    await sweepTemporary(root);
    await assert.rejects(access(stale),{code:'ENOENT'});await access(fresh);await access(unrelated);
  }finally{await rm(root,{recursive:true,force:true});}
});
