// Store image drafts outside the small synchronous Web Storage quota.
export async function workspaceStorage(name,{notice,storage=globalThis.localStorage,indexedDB=globalThis.indexedDB}={}){
 const key='codex-workspace';let legacy=null,value=null,db=null,warned=false,tail=Promise.resolve();
 try{legacy=storage.getItem(key);value=JSON.parse(legacy);}catch{}
 const warn=()=>{if(!warned){warned=true;notice('本地草稿保存失败，内容仍保留在当前页面；请勿关闭页面，发送成功后会清空');}};
 try{
  db=await new Promise((resolve,reject)=>{
   const request=indexedDB.open(name||'codex-workspace-drafts',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(Error('Draft database blocked'));
  });
  db.onversionchange=()=>db.close();
  const saved=await transact('readonly');if(saved!==undefined)value=saved;
  // Remove the old large value only after the complete replacement commits.
  if(legacy!==null){if(saved===undefined)await transact('readwrite',value);if(storage.getItem(key)===legacy)storage.removeItem(key);}
 }catch{db=null;}
 function transact(mode,snapshot){return new Promise((resolve,reject)=>{
  const tx=db.transaction('workspace',mode),store=tx.objectStore('workspace');
  const request=mode==='readonly'?store.get(key):store.put(snapshot,key);let result;
  request.onsuccess=()=>{result=request.result;};
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}
 return {value,save(state){
  // Capture now, before a chat switch mutates the live objects.
  const snapshot=structuredClone(state);
  tail=tail.then(async()=>{
   try{if(db)await transact('readwrite',snapshot);else storage.setItem(key,JSON.stringify(snapshot));warned=false;}
   catch{warn();}
  });
  return tail;
 },flush:()=>tail};
}
