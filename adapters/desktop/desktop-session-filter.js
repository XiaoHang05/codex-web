import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export function internalSessionSource(source){
 if(typeof source==='string'){
  if(source==='subagent')return true;
  try{source=JSON.parse(source);}catch{return false;}
 }
 return !!source&&typeof source==='object'&&Object.hasOwn(source,'subagent');
}
// Internal approvals and agent tasks are engine records, not sidebar chats.
// Use native provenance rather than names, which users can freely rename.
export function internalDesktopThreads(home){
 const ids=new Set(),file=path.join(home,'state_5.sqlite');let db;
 try{
  if(!fs.existsSync(file))return ids;
  db=new DatabaseSync(file,{readOnly:true});
  for(const row of db.prepare('SELECT id,source FROM threads').all())if(internalSessionSource(row.source))ids.add(row.id);
 }catch{}finally{db?.close();}
 return ids;
}
