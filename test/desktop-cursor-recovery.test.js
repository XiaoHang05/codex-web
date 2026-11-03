import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DesktopCompletions} from '../adapters/desktop/desktop-completions.js';

test('a corrupt cursor is backed up exactly and historical notifications are not replayed',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-cursor-recovery-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const journalFile=path.join(directory,'desktop-notification-cursors.json'),log=path.join(directory,'fixture.jsonl'),damaged=Buffer.alloc(4096),sent=[];
  let now=2000;const event=(id,time)=>JSON.stringify({timestamp:new Date(time).toISOString(),type:'event_msg',payload:{type:'task_complete',turn_id:id,last_agent_message:'Fixture'}})+'\n';
  fs.writeFileSync(journalFile,damaged);fs.writeFileSync(log,event('old',1000));
  const history={files:new Map([['fixture',log]])},row={threadId:'fixture',cwd:'/work/fixture',name:'Fixture'},notifications={enqueue:event=>sent.push(event)};
  const journal=new DesktopCompletions(history,notifications,{directory,clock:()=>now});
  const backups=fs.readdirSync(directory).filter(name=>name.includes('.corrupt-'));assert.equal(backups.length,1);assert.deepEqual(fs.readFileSync(path.join(directory,backups[0])),damaged);
  assert.equal(JSON.parse(fs.readFileSync(journalFile,'utf8')).initialized,false);journal.poll([row]);assert.equal(sent.length,0);
  now=3000;fs.appendFileSync(log,event('new',now));journal.poll([row]);assert.equal(sent.length,1);assert.match(sent[0].id,/turn:new:completed/);
  const restarted=new DesktopCompletions(history,notifications,{directory,clock:()=>now});restarted.poll([row]);assert.equal(sent.length,1);assert.equal(restarted.status().recoveredAt,2000);
});

test('invalid cursor structure is recovered while other filesystem errors are not swallowed',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-cursor-shape-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const file=path.join(directory,'desktop-notification-cursors.json');fs.writeFileSync(file,'{"initialized":true,"since":0,"files":null}');
  const journal=new DesktopCompletions({files:new Map()},{enqueue(){throw Error('No events allowed');}},{directory,clock:()=>1000});assert.equal(journal.state.initialized,false);journal.poll([]);
  fs.unlinkSync(file);fs.mkdirSync(file);assert.throws(()=>new DesktopCompletions({files:new Map()},{},{directory}));
});
