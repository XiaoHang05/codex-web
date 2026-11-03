import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeProjectDirectory} from '../public/codex/project-path.js';
export async function projectDirectories(directory){
 if(directory===undefined||directory===''){
  const candidates=process.platform==='win32'?Array.from({length:26},(_,index)=>String.fromCharCode(65+index)+':\\'):['/'];
  const roots=await Promise.all(candidates.map(async root=>{try{return (await fs.stat(root)).isDirectory()?{name:root,path:root}:null;}catch{return null;}}));
  return {path:'',parent:null,directories:roots.filter(Boolean)};
 }
 if(typeof directory!=='string'||directory.length>2048||directory.includes('\0')||!path.isAbsolute(directory))throw Object.assign(Error('请输入服务器上的完整目录路径'),{status:400});
 try{
  const resolved=normalizeProjectDirectory(path.resolve(directory));
  if(!(await fs.stat(resolved)).isDirectory())throw Object.assign(Error('该路径不是文件夹'),{status:400});
  const entries=await fs.readdir(resolved,{withFileTypes:true});
  const directories=(await Promise.all(entries.map(async entry=>{
   const target=path.join(resolved,entry.name);
   if(entry.isDirectory())return {name:entry.name,path:target};
   if(entry.isSymbolicLink())try{if((await fs.stat(target)).isDirectory())return {name:entry.name,path:target};}catch{}
   return null;
  }))).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  const parent=path.dirname(resolved);return {path:resolved,parent:parent===resolved?'':parent,directories};
 }catch(error){
  if(error.status)throw error;
  throw Object.assign(Error(error.code==='ENOENT'?'目录不存在':error.code==='ENOTDIR'?'该路径不是文件夹':'无法读取此目录，请检查访问权限'),{status:error.code==='ENOENT'?404:403});
 }
}
