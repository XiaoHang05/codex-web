import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// The App can keep a rollout file unchanged while its chat keeps running.
// Its database records the actual last activity, independently of that file.
export function desktopUpdated(home){
 const times=new Map(),file=path.join(home,'state_5.sqlite');let db;
 try{
  if(!fs.existsSync(file))return times;
  db=new DatabaseSync(file,{readOnly:true});
  const columns=new Set(db.prepare('PRAGMA table_info(threads)').all().map(row=>row.name));
  const expression=columns.has('updated_at_ms')?'COALESCE(updated_at_ms, updated_at * 1000)':'updated_at * 1000';
  for(const row of db.prepare(`SELECT id, ${expression} AS updated FROM threads`).all())if(Number(row.updated)>0)times.set(row.id,Number(row.updated));
 }catch{}finally{db?.close();}
 return times;
}
