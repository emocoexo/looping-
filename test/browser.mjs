import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exerciseUI } from './ui-flow.mjs';
import { app } from '../server.js';
const directory = await mkdtemp(join(tmpdir(),'loop-browser-'));
const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await exerciseUI(page, directory, { saveVideo: async output => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    await download.saveAs(output);
  }});
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); await rm(directory,{recursive:true,force:true}); }
