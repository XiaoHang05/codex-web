import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProjectNotifications,notificationProjectKey,projectNotificationsRoute} from '../src/project-notifications.js';
const root=fileURLToPath(new URL('../.local/project-notification-tests/',import.meta.url));fs.mkdirSync(root,{recursive:true});
function fixture(t){const directory=fs.mkdtempSync(path.join(root,'run-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return new ProjectNotifications(directory);}
const update=(policy,action,enabled,key)=>policy.update({revision:policy.value.revision,action,enabled,...key?{key}:{}});
test('migration preserves existing project behavior and canonicalizes directory spellings',t=>{
  const p=fixture(t);p.sync(['E:\\Work\\Alpha','e:/work/alpha/','/work/Beta'],{initial:true});assert.equal(p.snapshot().projects.length,2);
  update(p,'project',false,notificationProjectKey('E:/work/alpha'));assert.equal(p.allowed('e:\\WORK\\ALPHA\\'),false);
  assert.equal(p.snapshot({names:{'e:/work/alpha':'Renamed'}}).projects.find(row=>!row.enabled).name,'Renamed');
  assert.equal(new ProjectNotifications(path.dirname(p.file)).allowed('E:/Work/Alpha'),false);
});
test('new-project default affects future projects only; bulk changes leave the default unchanged',t=>{
  const p=fixture(t);p.sync(['/work/a','/work/b'],{initial:true});update(p,'default',false);assert.equal(p.allowed('/work/a'),true);
  assert.equal(p.allowed('/work/new'),false);update(p,'all',true);assert.equal(p.value.newProjectEnabled,false);assert.equal(p.allowed('/work/new'),true);
  assert.equal(p.allowed('/work/later'),false);update(p,'all',false);update(p,'default',true);assert.equal(p.allowed('/work/a'),false);assert.equal(p.allowed('/work/final'),true);
});
test('revisions reject stale bulk and single-project writes without overwriting another client',t=>{
  const p=fixture(t);p.sync(['/work/a'],{initial:true});const revision=p.value.revision;update(p,'default',false);
  assert.throws(()=>p.update({revision,action:'all',enabled:false}),error=>error.status===409);assert.equal(p.allowed('/work/a'),true);
  const before=JSON.stringify(p.value);assert.throws(()=>update(p,'project',false,'missing'));assert.equal(JSON.stringify(p.value),before);
});
test('unassigned projects have their own policy and cannot create prototype keys',t=>{
  const p=fixture(t);p.sync([undefined],{initial:true});update(p,'project',false,'unassigned');assert.equal(p.allowed(''),false);assert.equal(p.allowed('/work/a'),true);
  assert.throws(()=>update(p,'project',true,'__proto__'));assert.equal({}.enabled,undefined);assert.throws(()=>p.allowed('/bad\0path'));
});
test('authenticated settings remain editable with the master off and never alter master or source flags',async t=>{
  const p=fixture(t),flags={masterEnabled:false,codexEnabled:false};let reply,changes=0;
  const auth={requireSession:req=>{if(!req.loggedIn)throw Error('login');},csrf:req=>{if(!req.csrf)throw Error('csrf');}};
  const ctx={policy:p,auth,discover:()=>['/work/a'],status:()=>flags,changed:()=>changes++};const res={set(){},json(value){reply=value;}};
  await assert.rejects(projectNotificationsRoute({method:'GET'},res,ctx),/login/);assert.equal(p.value.initialized,false);
  await projectNotificationsRoute({method:'GET',loggedIn:true},res,ctx);assert.equal(reply.masterEnabled,false);
  const req={method:'PUT',loggedIn:true,body:{revision:reply.revision,action:'all',enabled:false}};
  await assert.rejects(projectNotificationsRoute(req,res,ctx),/csrf/);await projectNotificationsRoute({...req,csrf:true},res,ctx);
  assert.equal(reply.projects[0].enabled,false);assert.deepEqual(flags,{masterEnabled:false,codexEnabled:false});assert.equal(changes,1);
});
