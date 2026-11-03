import path from 'node:path';
import {readJson,writeJson} from './storage.js';
import {threadPrincipals} from './account-identity.js';
import {normalizeProjectDirectory} from '../public/codex/project-path.js';

// Account ownership is fixed when first indexed; later login changes cannot relabel it.
export class ProfileHistory{
 constructor(home){this.home=home;this.file=path.join(home,'history-index.json');this.value=readJson(this.file,{version:1,threads:{}});}
 capture(threads,identity,{created=false,complete=false}={}){
  let changed=false;const identities=threadPrincipals(this.home||path.dirname(this.file));
  for(const thread of threads){if(!thread.id||['__proto__','constructor','prototype'].includes(thread.id))continue;const old=this.get(thread.id);const row={threadId:thread.id,name:thread.name||thread.preview||old?.name||'新聊天',cwd:normalizeProjectDirectory(thread.cwd)||old?.cwd,updatedAt:(thread.updatedAt||thread.createdAt||0)*1000,archived:false,principal:created?identity:identities.get(thread.id)||(old?.identityEvidence==='created-with-account'?old.principal:null),identityEvidence:created?'created-with-account':identities.has(thread.id)?'native-creator-account':old?.identityEvidence==='created-with-account'?'created-with-account':'unknown-native-history'};
   if(JSON.stringify(old)!==JSON.stringify(row)){this.value.threads[thread.id]=row;changed=true;}
  }
  if(complete){const ids=new Set(threads.map(thread=>thread.id));for(const row of this.rows())if(!ids.has(row.threadId)){row.archived=true;changed=true;}}
  if(changed)this.save();return this.rows();
 }
 rows(){return Object.values(this.value.threads).filter(row=>!row.archived);}
 get(id){return Object.hasOwn(this.value.threads,id)?this.value.threads[id]:undefined;}
 rename(id,name){const row=this.get(id);if(row){row.name=name;this.save();}}
 archive(id){const row=this.get(id);if(row){row.archived=true;this.save();}}
 save(){writeJson(this.file,this.value);}
}
