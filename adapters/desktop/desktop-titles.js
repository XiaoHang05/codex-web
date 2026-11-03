import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
// Desktop owns these files. Open the database read-only and close every snapshot.
export function desktopTitles(home){
 const titles=new Map();const index=path.join(home,'session_index.jsonl');
 if(fs.existsSync(index))for(const line of fs.readFileSync(index,'utf8').split('\n'))try{const row=JSON.parse(line);if(row.id&&row.thread_name)titles.set(row.id,row.thread_name);}catch{}
 let database;try{const file=path.join(home,'state_5.sqlite');if(fs.existsSync(file)){database=new DatabaseSync(file,{readOnly:true});for(const row of database.prepare('SELECT id,name,title FROM threads WHERE archived=0').all()){if(row.name?.trim())titles.set(row.id,row.name);else if(!titles.has(row.id)&&row.title?.trim())titles.set(row.id,row.title.slice(0,160));}}}catch{}finally{database?.close();}return titles;
}
