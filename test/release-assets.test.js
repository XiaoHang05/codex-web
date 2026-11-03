import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import {createReleaseAssets} from '../src/release-assets.js';

test('release assets pin absolute references and preserve relative imports, navigation and APIs', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-release-assets-'));
  fs.writeFileSync(path.join(directory,'index.html'),'<script src="/codex/app.js"></script><a href="/codex/">Home</a>');
  fs.writeFileSync(path.join(directory,'app.js'),"import '/codex/common.js';import './local.js';fetch('/codex-api/v1/status');const style='/codex/style.css?theme=dark';");
  fs.writeFileSync(path.join(directory,'common.js'),'export const value=1;');
  fs.writeFileSync(path.join(directory,'style.css'),'body { color: gray; }');
  fs.writeFileSync(path.join(directory,'.private.js'),'SECRET');
  const version='a'.repeat(40),prefix=`/codex/_releases/${version}`;
  const app=express();app.use('/codex',createReleaseAssets(directory,version));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
  const get=url=>fetch(`http://127.0.0.1:${server.address().port}`+url);
  const html=await (await get('/codex/')).text();assert.ok(html.includes(`${prefix}/app.js`));assert.ok(html.includes('href="/codex/"'));
  const js=await (await get(prefix+'/app.js')).text();assert.ok(js.includes(prefix+'/common.js'));assert.ok(js.includes(prefix+'/style.css?theme=dark'));assert.ok(js.includes("'./local.js'"));assert.ok(js.includes('/codex-api/v1/status'));
  assert.equal((await get(`/codex/_releases/${'b'.repeat(40)}/app.js`)).status,404);
  assert.equal((await get(prefix+'/.private.js')).status,404);
});

test('release identifiers cannot introduce arbitrary paths',()=>{
  assert.throws(()=>createReleaseAssets('.', '../outside'));
});
