import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
export function accountPrincipal(id){return typeof id==='string'&&id?'openai:'+createHash('sha256').update(id).digest('hex').slice(0,24):null;}
// Native per-thread creator metadata is evidence; the currently logged-in account is not.
export function threadPrincipals(home){
 const result=new Map(),file=path.join(home,'state_5.sqlite');let db;
 try{if(!fs.existsSync(file))return result;db=new DatabaseSync(file,{readOnly:true});for(const row of db.prepare('SELECT id,creator_account_id FROM threads WHERE creator_account_id IS NOT NULL').all()){const identity=accountPrincipal(row.creator_account_id);if(identity)result.set(row.id,identity);}}catch{}finally{db?.close();}
 return result;
}
