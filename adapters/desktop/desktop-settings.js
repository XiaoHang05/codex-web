import path from 'node:path';
import {fault} from '../../src/storage.js';
import {nativePolicy} from '../../src/preferences.js';
export function desktopThreadSettings(body,state={}){
 if(!body||typeof body!=='object'||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(key=>!['model','effort','serviceTier','collaborationMode','policy'].includes(key)))throw fault('无效桌面设置');
 const settings={};
 for(const key of ['model','effort','serviceTier'])if(Object.hasOwn(body,key)){
  const value=body[key];if(value!==null&&(typeof value!=='string'||!value.trim()||value.length>200))throw fault('无效 '+key);
  if(key==='effort'&&value!==null&&!['none','minimal','low','medium','high','xhigh','max','ultra'].includes(value))throw fault('无效推理等级');settings[key]=value;
 }
 const previous=state.latestCollaborationMode||state.latestThreadSettings?.collaborationMode;
 const mode=body.collaborationMode;
 if(mode!==undefined||Object.hasOwn(body,'model')||Object.hasOwn(body,'effort')){
  const nextMode=mode??previous?.mode??'default';if(!['plan','default'].includes(nextMode))throw fault('无效协作模式');
  const model=body.model||state.latestThreadSettings?.model||state.latestModel||previous?.settings?.model;if(!model)throw fault('等待桌面模型同步后再切换模式',409);
  const effort=Object.hasOwn(body,'effort')?body.effort:state.latestThreadSettings?.effort??state.latestReasoningEffort??previous?.settings?.reasoning_effort??null;
  settings.collaborationMode={mode:nextMode,settings:{...previous?.settings,model,reasoning_effort:effort,developer_instructions:previous?.settings?.developer_instructions??null}};
 }
 if(body.policy!==undefined){const policy=body.policy;if(!policy||!['read-only','workspace-write','full-access'].includes(policy.access)||!['manual','automatic','never'].includes(policy.approval)||Object.keys(policy).some(key=>!['access','approval'].includes(key)))throw fault('无效桌面权限策略');const native=nativePolicy(policy),cwd=state.cwd;if(policy.access==='workspace-write'&&(!cwd||!path.isAbsolute(cwd)))throw fault('等待桌面项目路径同步',409);Object.assign(settings,{approvalPolicy:native.approvalPolicy,approvalsReviewer:native.approvalsReviewer,permissions:null,sandboxPolicy:policy.access==='read-only'?{type:'readOnly',networkAccess:false}:policy.access==='workspace-write'?{type:'workspaceWrite',writableRoots:[cwd],networkAccess:false}:{type:'dangerFullAccess'}});}
 return settings;
}
