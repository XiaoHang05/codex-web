import {api,browserState} from '/codex/common.js';
let databasePromise;
function database(){
 if(!databasePromise)databasePromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(browserState.queueDatabase,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('messages');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('无法打开待发送队列'));
 });
 return databasePromise;
}
async function transaction(key,value){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('messages',value===undefined?'readonly':'readwrite');
  const store=tx.objectStore('messages'),request=value===undefined?store.get(key):value.length?store.put(value,key):store.delete(key);
  request.onsuccess=()=>{if(value===undefined)resolve(Array.isArray(request.result)?request.result:[]);};
  tx.oncomplete=()=>{if(value!==undefined)resolve();};
  tx.onerror=()=>reject(tx.error||Error('无法保存待发送队列'));
  tx.onabort=()=>reject(tx.error||Error('无法保存待发送队列'));
 });
}
const snapshots=new Map(),migrated=new Set();
const endpoint=scope=>'/codex-api/v1/composer-queue?scope='+encodeURIComponent(scope);
const remember=(scope,state)=>{snapshots.set(scope,state);return state.items;};
export const queuedMessages={
 async read(scope){
  const cached=snapshots.get(scope);let state=await api(endpoint(scope)+(cached?'&since='+cached.revision:''));if(state.unchanged)state=cached;
  if(!migrated.has(scope)){
   // Import legacy browser entries once. Clear them only after server storage
   // succeeds. IDs retained by the server make interrupted imports idempotent.
   let local=[];try{local=await transaction(scope);}catch{/* IndexedDB may be unavailable. */}
   if(local.length){state=await api(endpoint(scope),{action:'import',items:local},'PUT');try{await transaction(scope,[]);}catch{/* Server IDs prevent duplicate imports if local cleanup fails. */}}
   migrated.add(scope);
  }
  return remember(scope,state);
 },
 async write(scope,items){const state=snapshots.get(scope);if(!state)throw Error('队列尚未同步，请稍后重试');return remember(scope,await api(endpoint(scope),{revision:state.revision,items},'PUT'));},
 async retry(scope,id){return remember(scope,await api(endpoint(scope),{action:'retry',id},'PUT'));},
 async steer(scope,id){return remember(scope,await api(endpoint(scope),{action:'steer',id},'PUT'));},
 snapshot:scope=>snapshots.get(scope),
};

const accepted=/^image\/(?:png|jpeg|webp)$/;
function asDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||Error('无法读取图片'));reader.readAsDataURL(file);});}
export async function imageInput(file){
 if(!file?.type?.startsWith('image/'))throw Error('剪贴板中没有图片');
 if(accepted.test(file.type)&&file.size<1050000){const url=await asDataUrl(file);if(url.length<1500000)return {type:'image',url};}
 const bitmap=await createImageBitmap(file);
 try{
  for(const maxSide of [2048,1600,1280,1024,800]){
   const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.86,.72,.58]){const url=canvas.toDataURL('image/webp',quality);if(url.length<1500000)return {type:'image',url};}
  }
  throw Error('图片过大，无法作为消息附件');
 }finally{bitmap.close?.();}
}
