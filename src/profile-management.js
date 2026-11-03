import {randomUUID} from 'node:crypto';
import {fault,safeId} from './storage.js';
import {historyList} from './history-list.js';
export async function profileManagement(req,res,ctx){
 if(req.method==='GET')return mutateProfile(req,res,ctx);
 if(ctx.codex.profileMutationBusy)throw fault('正在修改账号配置，请稍后重试',409);
 ctx.codex.profileMutationBusy=true;try{return await mutateProfile(req,res,ctx);}finally{ctx.codex.profileMutationBusy=false;}
}
async function mutateProfile(req,res,ctx){
 if(req.path==='/api/profile-management'&&req.method==='GET'){res.json({active:ctx.config.profiles,removed:ctx.config.removedProfiles||[]});return true;}
 if(req.path==='/api/profile-management/create'&&req.method==='POST'){
  const patch={...req.body,id:'account-'+randomUUID().slice(0,12)};if(typeof patch.name!=='string'||!patch.name.trim())throw fault('请填写配置名称');
  const row=ctx.codex.validateProfile(patch),before=[...ctx.config.profiles];
  ctx.codex.saveProfile(patch);try{ctx.save();}catch(error){ctx.config.profiles=before;throw error;}res.status(201).json(row);return true;
 }
 const match=req.path.match(/^\/api\/profile-management\/([a-zA-Z0-9_-]+)\/(remove|restore)$/);if(!match||req.method!=='POST')return false;
 const id=safeId(match[1]),action=match[2];ctx.config.removedProfiles??=[];
 if(action==='remove'){
  if(req.body?.confirmation!=='remove-profile-keep-data')throw fault('请确认移除配置并保留数据');
  const row=ctx.codex.profile(id);if(id==='default'||ctx.config.profiles.length<=1)throw fault('主配置必须保留',409);
  const instance=ctx.codex.instances.get(id);if(instance?.active.size||instance?.approvals.size)throw fault('此配置仍有任务或审批，完成后再移除',409);
  await historyList(ctx);await ctx.codex.stop(id);
  const before=[...ctx.config.profiles],removed=[...ctx.config.removedProfiles];ctx.config.profiles=before.filter(profile=>profile.id!==id);ctx.config.removedProfiles.push({...row,removedAt:Date.now()});
  try{ctx.save();}catch(error){ctx.config.profiles=before;ctx.config.removedProfiles=removed;throw error;}
  res.json({ok:true,dataPreserved:true});return true;
 }
 const row=ctx.config.removedProfiles.find(profile=>profile.id===id);if(!row)throw fault('找不到已移除的配置',404);if(ctx.config.profiles.some(profile=>profile.id===id))throw fault('配置 ID 已被占用',409);
 const restored=ctx.codex.validateProfile(row),before=[...ctx.config.removedProfiles];ctx.config.profiles.push(restored);ctx.config.removedProfiles=before.filter(profile=>profile.id!==id);
 try{ctx.save();}catch(error){ctx.config.profiles=ctx.config.profiles.filter(profile=>profile.id!==id);ctx.config.removedProfiles=before;throw error;}res.json(restored);return true;
}
