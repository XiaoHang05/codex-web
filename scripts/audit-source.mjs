import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const allowedRoots=new Set(['src','adapters','public','scripts','test','docs']);
const allowedFiles=new Set(['package.json','package-lock.json','README.md','.gitignore','.env.example','NOTICE.md']);
const findings=[];let files=0;
const patterns={
  privateKey:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  accessToken:/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  apiKey:/\bsk-(?:proj-)?[A-Za-z0-9_-]{25,}/,
  privatePath:/[A-Z]:[\\/](?:Users[\\/][^\\/\s'"<>]+|hm_projects)[\\/]/i,
  personalHost:/https?:\/\/[a-z0-9-]+\.(?:myddns\.me|ddns\.net|duckdns\.org)\b/i,
};
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(['node_modules','.git','.local'].includes(entry.name))continue;
  const file=path.join(directory,entry.name),relative=path.relative(root,file).replaceAll('\\','/');
  if(entry.isSymbolicLink()){findings.push({file:relative,kind:'symlink'});continue;}
  if(entry.isDirectory()){
    if(directory===root&&!allowedRoots.has(entry.name)){findings.push({file:relative,kind:'unexpected-directory'});continue;}
    walk(file);continue;
  }
  files++;
  if(directory===root&&!allowedFiles.has(entry.name))findings.push({file:relative,kind:'unexpected-file'});
  if(/\.(?:p12|pfx|pem|key|keystore|sqlite|db|log|hap|zip)$/i.test(entry.name))findings.push({file:relative,kind:'private-or-generated-file'});
  if(!/\.(?:js|mjs|cjs|json|md|html|css|webmanifest|example)$/.test(entry.name)&&!entry.name.startsWith('.'))continue;
  const text=fs.readFileSync(file,'utf8');
  for(const [kind,pattern]of Object.entries(patterns))if(pattern.test(text))findings.push({file:relative,kind});
}}
walk(root);
console.log(JSON.stringify({filesScanned:files,findings},null,2));process.exitCode=findings.length?1:0;
