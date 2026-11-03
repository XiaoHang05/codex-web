// Compare Windows directory spellings without changing native session paths.
export function normalizeProjectDirectory(cwd){return typeof cwd==='string'?cwd.replace(/^([a-z]):(?=[\\/])/i,(_,drive)=>drive.toUpperCase()+':'):cwd;}
export function projectIdentity(cwd){
 const value=String(cwd||'');
 if(/^[a-z]:[\\/]|^\\\\|^\/\//i.test(value))return value.replaceAll('\\','/').replace(/\/+$/,'').toLowerCase();
 return value.replace(/\/+$/,'')||value;
}
export function projectSettingKey(settings,cwd){
 if(Object.hasOwn(settings,cwd))return cwd;
 const identity=projectIdentity(cwd);
 return Object.keys(settings).find(key=>projectIdentity(key)===identity)||cwd;
}
export function projectSetting(settings,cwd){return settings[projectSettingKey(settings,cwd)];}
export function groupProjectRows(rows,preferredPaths=[]){
 const preferred=new Map();
 for(const cwd of preferredPaths)if(!preferred.has(projectIdentity(cwd)))preferred.set(projectIdentity(cwd),cwd);
 const groups=new Map(),keys=new Map();
 for(const row of rows){
  const cwd=row.cwd||'未指定项目',identity=projectIdentity(cwd);
  const key=keys.get(identity)||preferred.get(identity)||cwd;
  keys.set(identity,key);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 return groups;
}
export function orderProjectGroups(groups,savedOrder=[],pinned={}){
 const rank=new Map(savedOrder.map((cwd,index)=>[projectIdentity(cwd),index]));
 return [...groups].sort(([left],[right])=>
  Number(!!projectSetting(pinned,right))-Number(!!projectSetting(pinned,left))||
  (rank.get(projectIdentity(left))??-1)-(rank.get(projectIdentity(right))??-1));
}
