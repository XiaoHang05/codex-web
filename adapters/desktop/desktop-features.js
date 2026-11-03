import fs from 'node:fs';
import {fault} from '../../src/storage.js';
export async function desktopFeatureRoute(req,res,ctx){
 const match=req.path.match(/^\/api\/desktop-features\/([-a-zA-Z0-9_]{1,80})\/(settings|skills|mcp|limits|usage|account|providers)$/);if(!match)return false;
 const [,threadId,feature]=match,row=ctx.history.list().find(row=>row.threadId===threadId);if(!row)throw fault('找不到桌面聊天',404);if(row.accountMismatch||row.conflict)throw fault('桌面聊天所属账号或持有者不匹配',409);
 if(feature==='settings'){
  if(req.method!=='POST')throw fault('设置接口仅支持 POST',405);
  if(row.protected)throw fault('此聊天只读',403);res.json(await ctx.desktop.control(threadId,'settings',req.body));return true;
 }
 if(req.method!=='GET')throw fault('目录接口只读',405);
 const {desktopCatalog}=await import('./desktop-catalog.js?v='+fs.statSync(new URL('./desktop-catalog.js',import.meta.url)).mtimeMs);res.json(await desktopCatalog(feature,{home:ctx.desktop.accountHome,cwd:row.cwd,config:ctx.config,cursor:req.query?.cursor}));return true;
}
