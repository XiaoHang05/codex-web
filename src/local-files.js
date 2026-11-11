import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fault} from './storage.js';
import {nativeFileExtensions} from '../public/codex/local-file-kinds.js';

export function localClient(req,auth){const info=auth.info(req);return info.accessKind==='local'||info.accessKind===undefined&&info.local===true;}
export class LocalFileTickets{
 constructor(directory,{platform=process.platform,now=Date.now}={}){this.directory=directory;this.platform=platform;this.now=now;this.tickets=new Map();}
 available(){try{const record=JSON.parse(fs.readFileSync(path.join(this.directory,'local-file-open.json'),'utf8'));return this.platform==='win32'&&record.version===1&&record.protocol==='codex-local-file';}catch{return false;}}
 allowed(file){return this.available()&&nativeFileExtensions.has(path.extname(file).toLowerCase());}
 issue(reference,file,stat){
  if(!this.allowed(file))throw fault('此文件不能用默认程序打开',415);
  for(const [token,row]of this.tickets)if(row.expires<=this.now())this.tickets.delete(token);
  if(this.tickets.size>=128)throw fault('打开请求过多，请稍后再试',429);
  const token=randomBytes(32).toString('hex');
  this.tickets.set(token,{...reference,file,identity:[stat.dev,stat.ino,stat.size,stat.mtimeMs].join(':'),expires:this.now()+60000});
  return {url:'codex-local-file://open/'+token,expiresIn:60};
 }
 async consume(token,resolve){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fault('打开凭据无效',400);
  const record=this.tickets.get(token);this.tickets.delete(token);
  if(!record||record.expires<=this.now())throw fault('打开凭据已失效，请重新点击打开',410);
  const {real,stat}=await resolve(record);
  if(!this.allowed(real)||record.file!==real||record.identity!==[stat.dev,stat.ino,stat.size,stat.mtimeMs].join(':'))throw fault('文件已变化，请重新点击打开',409);
  return {path:real,action:'open'};
 }
}
