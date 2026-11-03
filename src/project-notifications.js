import path from 'node:path';
import {readJson,writeJson,fault} from './storage.js';
import {projectIdentity,projectSetting} from '../public/codex/project-path.js';

export function notificationProjectKey(cwd){
  if(cwd===undefined||cwd===null||cwd==='')return 'unassigned';
  if(typeof cwd!=='string'||cwd.length>4096||cwd.includes('\0'))throw fault('无效项目目录');
  return 'path:'+projectIdentity(cwd);
}
export class ProjectNotifications{
  constructor(directory){
    this.file=path.join(directory,'project-notifications.json');
    this.value=readJson(this.file,{version:1,revision:0,newProjectEnabled:true,initialized:false,projects:{}});
    if(this.value.version!==1||typeof this.value.newProjectEnabled!=='boolean'||!Number.isSafeInteger(this.value.revision)||!this.value.projects||Array.isArray(this.value.projects))throw Error('Invalid project notification configuration');
  }
  save(){writeJson(this.file,this.value);}
  sync(cwds,{initial=false}={}){
    let changed=false;
    for(const cwd of cwds){const key=notificationProjectKey(cwd);if(Object.hasOwn(this.value.projects,key))continue;
      const enabled=initial?true:this.value.newProjectEnabled;
      this.value.projects[key]={cwd:cwd||'',enabled,...(!enabled?{blockedThrough:this.value.revision+1}:{})};changed=true;
    }
    if(!this.value.initialized){this.value.initialized=true;changed=true;}
    if(changed){this.value.revision++;this.save();}return changed;
  }
  key(cwd){const key=notificationProjectKey(cwd);if(!Object.hasOwn(this.value.projects,key))this.sync([cwd]);return key;}
  allowedKey(key,revision){const row=this.value.projects[key];return row?row.enabled===true&&(revision===undefined||row.blockedThrough===undefined||revision>row.blockedThrough):this.value.newProjectEnabled;}
  allowed(cwd){return this.allowedKey(this.key(cwd));}
  snapshot({masterEnabled=false,codexEnabled=false,names={}}={}){
    return {revision:this.value.revision,newProjectEnabled:this.value.newProjectEnabled,masterEnabled:masterEnabled===true,codexEnabled:codexEnabled===true,
      projects:Object.entries(this.value.projects).map(([key,row])=>({key,cwd:row.cwd,enabled:row.enabled===true,name:row.cwd?(projectSetting(names,row.cwd)||row.cwd.split(/[\\/]/).filter(Boolean).at(-1)||row.cwd):'未指定项目'})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}))};
  }
  update(body){
    if(!body||body.revision!==this.value.revision)throw fault('项目通知设置已更新，请刷新后重试',409);
    if(typeof body.enabled!=='boolean'||!['project','all','default'].includes(body.action))throw fault('无效项目通知设置');
    const next=structuredClone(this.value);
    if(body.action==='default')next.newProjectEnabled=body.enabled;
    else if(body.action==='all')for(const row of Object.values(next.projects)){row.enabled=body.enabled;if(!body.enabled)row.blockedThrough=next.revision+1;}
    else{if(typeof body.key!=='string'||!Object.hasOwn(next.projects,body.key))throw fault('项目不存在',404);next.projects[body.key].enabled=body.enabled;if(!body.enabled)next.projects[body.key].blockedThrough=next.revision+1;}
    next.revision++;const previous=this.value;this.value=next;
    try{this.save();}catch(error){this.value=previous;throw error;}
  }
}

export async function projectNotificationsRoute(req,res,{policy,auth,discover=()=>[],status=()=>({}),changed=()=>{}}){
  auth.requireSession(req);if(!['GET','PUT'].includes(req.method))throw fault('项目通知仅支持 GET 和 PUT',405);
  if(req.method==='PUT')auth.csrf(req);
  const known=await discover();policy.sync(known,{initial:!policy.value.initialized});
  if(req.method==='PUT'){policy.update(req.body);await changed();}
  res.set('Cache-Control','no-store');res.json(policy.snapshot(status()));return true;
}
