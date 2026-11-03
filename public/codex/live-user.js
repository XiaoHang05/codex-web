// The RPC response and streamed user item can arrive in either order.
const receipts=new WeakMap();
function receiptMap(items){let map=receipts.get(items);if(!map){map=new Map();receipts.set(items,map);}return map;}
function remember(items,user){
 if(!user._queueId)return;
 const map=receiptMap(items),old=map.get(user._queueId)||{aliases:new Set()};
 if(user._turnId)old.turnId=user._turnId;
 if(!user._localUser){old.nativeId=user.id;old.aliases.add(user.id);}
 map.set(user._queueId,old);
 if(map.size>256)map.delete(map.keys().next().value);
}
function initialUser(items,turnId){return [...items.values()].find(item=>item.type==='userMessage'&&!item._localUser&&!item._steering&&item._turnId===turnId);}
function messageText(item){return (item.text??item.content?.map(part=>part.text||part.inputText||'').filter(Boolean).join('\n')??'').trim();}
function sameDraftContent(local,native){
 if(messageText(local)!==messageText(native))return false;
 const images=item=>(item.content||[]).filter(part=>['image','input_image','localImage'].includes(part.type)).map(part=>part.url||part.path||(typeof part.image_url==='string'?part.image_url:part.image_url?.url));
 const left=images(local),right=images(native);
 return right.length?JSON.stringify(left)===JSON.stringify(right):!!messageText(local)||!left.length;
}
export function acceptLocalUser(items,turn,input,text,sentAt=Date.now()){
 const turnId=turn.id;
 const native=(turn.items||[]).find(item=>item.type==='userMessage');
 if(native){acceptNativeUser(items,{...native,_turnId:turnId,_sentAt:sentAt});return;}
 if([...items.values()].some(item=>item.type==='userMessage'&&item._turnId===turnId&&!item._localUser))return;
 const id='local:'+turnId;
 items.set(id,{id,type:'userMessage',text,content:input,_sentAt:sentAt,_turnId:turnId,_localUser:true});
}
export function acceptQueuedUser(items,draft,turnId){
 const id='queued:'+draft.id;if([...items.values()].some(item=>item._queueId===draft.id))return;
 const receipt=receiptMap(items).get(draft.id),knownTurn=turnId||receipt?.turnId;
 const native=knownTurn&&initialUser(items,knownTurn);
 if(native){native._queueId=draft.id;remember(items,native);return;}
 const content=[{type:'text',text:draft.text},...(draft.skill?[{type:'skill',...draft.skill}]:[]),...(draft.images||[])];
 const user={id,type:'userMessage',text:draft.text,content,_localUser:true,_queueId:draft.id,_turnId:knownTurn,_queueBaseline:[...new Set([...items.values()].map(item=>item._turnId).filter(Boolean))],_deliveryStatus:knownTurn?undefined:'sending',_sentAt:Date.now()};
 items.set(id,user);remember(items,user);
}
export function acceptStartedTurn(items,turn,{queueId}={}){
 const known=[...receiptMap(items)].find(([,receipt])=>receipt.turnId===turn.id);
 const pending=[...items.values()].find(item=>item._localUser&&item._queueId&&(queueId?item._queueId===queueId:known?item._queueId===known[0]:!item._turnId&&!item._queueBaseline?.includes(turn.id)));
 if(pending){pending._turnId=turn.id;delete pending._deliveryStatus;remember(items,pending);}
 const native=initialUser(items,turn.id);if(native&&pending)acceptNativeUser(items,native);
 let users=0;for(const item of turn.items||[])if(item.type==='userMessage'){
  const steering=item._steering||users++>0;
  const receipt=[...receiptMap(items).values()].find(receipt=>receipt.turnId===turn.id);
  if(!steering&&receipt?.nativeId)receipt.aliases.add(item.id);
  acceptNativeUser(items,{...item,_turnId:turn.id,_steering:steering});
 }
 if(queueId){const canonical=initialUser(items,turn.id);if(canonical){canonical._queueId=queueId;remember(items,canonical);}}
 orderTurnUsers(items,turn.id);
}
function orderTurnUsers(items,turnId){
 // A delayed user item must appear before the turn's work and reply.
 const users=[...items].filter(([,item])=>item.type==='userMessage'&&item._turnId===turnId).slice(0,1);
 if(users.length){const entries=[...items];items.clear();let inserted=false;
  for(const [key,item]of entries){if(item._turnId===turnId&&!inserted){for(const entry of users)items.set(...entry);inserted=true;}if(!users.some(([userKey])=>userKey===key))items.set(key,item);}
 }
}
export function restoreLocalUsers(items,previous){
 for(const local of previous.values())if(local._localUser||local._queueId){
  const native=local._turnId&&initialUser(items,local._turnId);
  if(native){if(!native.content?.length)native.content=local.content;native._queueId=local._queueId;remember(items,local);remember(items,native);continue;}
  if(!items.has(local.id))items.set(local.id,local);
  if(local._turnId)orderTurnUsers(items,local._turnId);
 }
}
export function acceptNativeUser(items,item){
 // History and streamed items can use different IDs. Only IDs confirmed to
 // belong to the same submitted draft become aliases; never dedupe by text.
 const receipt=[...receiptMap(items).values()].find(receipt=>receipt.turnId===item._turnId&&receipt.aliases.has(item.id));
 if(receipt?.nativeId&&items.has(receipt.nativeId))item={...item,id:receipt.nativeId};
 const existing=items.get(item.id);if(existing?._queueId)item={...item,_queueId:existing._queueId,content:item.content?.length?item.content:existing.content};
 const local=[...items].find(([,value])=>value._localUser&&!item._steering&&(value._turnId?value._turnId===item._turnId:item._turnId&&!value._queueBaseline?.includes(item._turnId)&&sameDraftContent(value,item)));
 if(local){
  const entries=[...items];items.clear();
  for(const [key,value]of entries){if(key===local[0])items.set(item.id,{...item,content:item.content?.length?item.content:local[1].content,_queueId:local[1]._queueId,_sentAt:local[1]._sentAt});else if(key!==item.id)items.set(key,value);}
 }else items.set(item.id,item);
 remember(items,items.get(item.id));
 if(item._turnId)orderTurnUsers(items,item._turnId);
}
