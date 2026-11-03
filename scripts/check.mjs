import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
export function sourceFiles(directory=root){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isDirectory()&&['node_modules','.git','.local'].includes(entry.name))return [];
    const file=path.join(directory,entry.name);return entry.isDirectory()?sourceFiles(file):[file];
  });
}
let failures=0,checked=0,imports=0;
for(const file of sourceFiles()){
  if(!/\.(?:js|mjs|cjs)$/.test(file)||file.includes(path.sep+'vendor'+path.sep))continue;
  checked++;const result=spawnSync(process.execPath,['--check',file],{windowsHide:true,encoding:'utf8'});
  if(result.status!==0){failures++;process.stderr.write(path.relative(root,file)+'\n'+result.stderr);}
  const text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/(?:from\s*|import\s*\()(['"`])(\.\.?\/[^'"`\n]+)\1/g)){
    const spec=match[2].split('?')[0];if(spec.includes('${'))continue;
    const target=path.resolve(path.dirname(file),spec),relative=path.relative(root,target);imports++;
    if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(target)){failures++;process.stderr.write('Invalid local import: '+path.relative(root,file)+' -> '+spec+'\n');}
  }
  if(file.startsWith(path.join(root,'src')+path.sep)&&/from\s*['"][^'"]*adapters\/desktop/.test(text)){failures++;process.stderr.write('Core statically imports optional desktop code: '+path.relative(root,file)+'\n');}
}
console.log(JSON.stringify({javascriptFilesChecked:checked,localImportsChecked:imports,failures}));process.exitCode=failures?1:0;
