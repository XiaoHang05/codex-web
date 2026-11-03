import {createHash} from 'node:crypto';
import {readJson,writeJson,fault} from './storage.js';
const digest=token=>createHash('sha256').update(token).digest('hex');
const valid=row=>row&&/^[a-f0-9]{32}$/.test(row.id||'')&&/^[a-f0-9]{48}$/.test(row.csrf||'')&&Number.isFinite(row.expires)&&row.expires>Date.now();

// Only token hashes go on disk. A copied session file cannot supply a login cookie.
export class LoginSessions{
 constructor(file,live,credentials){
  this.file=file;this.live=live;this.credentials=credentials;this.saved=new Map();this.dirty=false;
  const stored=readJson(file,{version:1,sessions:[]});
  if(stored.version!==1||!Array.isArray(stored.sessions))throw fault('登录会话存储格式无效',500);
  for(const entry of stored.sessions)if(/^[a-f0-9]{64}$/.test(entry.tokenHash||'')&&this.valid(entry.session))this.saved.set(entry.tokenHash,entry.session);
  for(const [token,row]of live)if(this.valid(row))this.saved.set(digest(token),row);
  // Capture sessions from an older in-memory implementation during hot upgrade.
  this.flush();
 }
 valid(row){return valid(row)&&(!row.passkeyId||this.credentials().some(key=>key.id===row.passkeyId));}
 get(token){if(!/^[a-f0-9]{64}$/.test(token))return null;const row=this.live.get(token)||this.saved.get(digest(token));return this.valid(row)?row:null;}
 remember(token,row,{immediate=false}={}){this.live.set(token,row);this.saved.set(digest(token),row);this.dirty=true;if(immediate)this.flush();}
 remove(token){this.live.delete(token);this.saved.delete(digest(token));this.dirty=true;this.flush();}
 removeId(id){for(const [token,row]of this.live)if(row.id===id)this.live.delete(token);for(const [key,row]of this.saved)if(row.id===id)this.saved.delete(key);this.dirty=true;this.flush();}
 prune(){for(const [token,row]of this.live)if(!this.valid(row)){this.live.delete(token);this.dirty=true;}for(const [key,row]of this.saved)if(!this.valid(row)){this.saved.delete(key);this.dirty=true;}}
 rows(){this.prune();return [...this.saved.values()];}
 flush(){this.prune();writeJson(this.file,{version:1,sessions:[...this.saved].map(([tokenHash,session])=>({tokenHash,session}))});this.dirty=false;}
 flushIfDirty(){if(this.dirty)this.flush();}
}
