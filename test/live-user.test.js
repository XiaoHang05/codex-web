import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptLocalUser,acceptNativeUser,acceptQueuedUser,acceptStartedTurn,restoreLocalUsers} from '../public/codex/live-user.js';
const native={id:'server',type:'userMessage',text:'hello',_turnId:'t'};
const input=[{type:'text',text:'hello'},{type:'image',url:'data:image/png;base64,abc'}];
test('RPC first: streamed item replaces local echo in place',()=>{
 const items=new Map();acceptLocalUser(items,{id:'t'},input,'hello',123);
 assert.deepEqual(items.get('local:t').content,input);
 items.set('work',{id:'work',type:'reasoning'});acceptNativeUser(items,native);
 assert.deepEqual([...items.keys()],['server','work']);assert.equal(items.get('server')._sentAt,123);
 acceptNativeUser(items,native);assert.equal(items.size,2);
});
test('stream first: late RPC does not add another bubble',()=>{
 const items=new Map();acceptNativeUser(items,native);acceptLocalUser(items,{id:'t'},input,'hello');
 assert.equal(items.size,1);assert.equal(items.has('local:t'),false);
});
test('RPC includes native user: no provisional duplicate',()=>{
 const items=new Map();acceptLocalUser(items,{id:'t',items:[native]},input,'hello');acceptNativeUser(items,native);
 assert.equal(items.size,1);assert.equal(items.has('server'),true);
});
test('identical messages in separate turns are preserved',()=>{
 const items=new Map();acceptNativeUser(items,{...native,id:'old',_turnId:'old'});
 acceptLocalUser(items,{id:'t'},input,'hello');acceptNativeUser(items,native);
 assert.equal(items.size,2);assert.equal(items.has('old'),true);
});
const draft={id:'queue-one',text:'hello',images:input.slice(1)};
test('dispatch echo appears before work even when turn start omits user items',()=>{
 const items=new Map();acceptQueuedUser(items,draft);acceptStartedTurn(items,{id:'t',items:[]});
 items.set('reply',{id:'reply',type:'agentMessage',text:'reply',_turnId:'t'});
 assert.deepEqual([...items.keys()],['queued:queue-one','reply']);assert.equal(items.get('queued:queue-one')._deliveryStatus,undefined);
 acceptNativeUser(items,native);assert.deepEqual([...items.keys()],['server','reply']);assert.deepEqual(items.get('server').content,input);
});
test('late turn-start user is inserted before an already streamed reply',()=>{
 const items=new Map([['reply',{id:'reply',type:'agentMessage',_turnId:'t'}]]);
 acceptStartedTurn(items,{id:'t',items:[native]});assert.deepEqual([...items.keys()],['server','reply']);
});
test('dispatch acknowledgment and repeated native events do not duplicate user messages',()=>{
 const items=new Map();acceptQueuedUser(items,draft);acceptStartedTurn(items,{id:'t',items:[native]});
 acceptNativeUser(items,native);acceptQueuedUser(items,draft);assert.equal(items.size,1);
});
test('stale history reads retain the accepted user before the matching turn reply',()=>{
 const previous=new Map();acceptQueuedUser(previous,draft);acceptStartedTurn(previous,{id:'t'});
 const items=new Map([['reply',{id:'reply',type:'agentMessage',_turnId:'t'}]]);restoreLocalUsers(items,previous);
 assert.deepEqual([...items.keys()],['queued:queue-one','reply']);
 const nativeItems=new Map([['server',native]]);restoreLocalUsers(nativeItems,previous);assert.equal(nativeItems.size,1);assert.deepEqual(nativeItems.get('server').content,input);
});
test('history reconciles a sending echo when both start and queue acknowledgments were missed',()=>{
 const previous=new Map();acceptQueuedUser(previous,draft);
 const items=new Map([['server',{id:'server',type:'userMessage',text:'hello',_turnId:'t'}]]);restoreLocalUsers(items,previous);
 assert.equal(items.size,1);assert.equal(items.get('server')._queueId,draft.id);
 assert.deepEqual(items.get('server').content,input);
 acceptQueuedUser(items,draft,'t');assert.equal(items.size,1);
});
test('history cannot bind an unacknowledged echo to a preexisting identical message',()=>{
 const recorded={id:'old-server',type:'userMessage',text:'hello',_turnId:'old-turn'};
 const previous=new Map([['old-server',recorded]]);acceptQueuedUser(previous,{...draft,images:[]});
 const items=new Map([['old-server',{...recorded}]]);restoreLocalUsers(items,previous);
 assert.equal(items.size,2);assert.equal(items.get('queued:queue-one')._turnId,undefined);
});
test('steering messages retain their position after intervening work',()=>{
 const items=new Map([['server',native],['work',{id:'work',type:'reasoning',_turnId:'t'}]]);
 acceptNativeUser(items,{id:'steer',type:'userMessage',text:'extra',_turnId:'t',_steering:true});
 assert.deepEqual([...items.keys()],['server','work','steer']);
});
test('native message preceding turn start reconciles its unbound dispatch echo',()=>{
 const items=new Map();acceptQueuedUser(items,{...draft,images:[]});acceptNativeUser(items,native);
 acceptStartedTurn(items,{id:'t',items:[]},{queueId:draft.id});assert.equal(items.size,1);assert.equal(items.get('server')._queueId,draft.id);
});
test('canonical history ID changes retain aliases and survive late dispatch events',()=>{
 const items=new Map();acceptQueuedUser(items,draft);acceptStartedTurn(items,{id:'t',items:[native]});
 const previous=new Map(items);items.clear();items.set('history-id',{...native,id:'history-id'});restoreLocalUsers(items,previous);
 acceptNativeUser(items,native);acceptQueuedUser(items,draft);assert.equal(items.size,1);assert.equal(items.has('history-id'),true);
});
test('turn-start snapshot and stream IDs are aliases of the same submitted draft',()=>{
 const items=new Map();acceptQueuedUser(items,draft);acceptStartedTurn(items,{id:'t',items:[native]});
 acceptStartedTurn(items,{id:'t',items:[{...native,id:'snapshot-id'}]},{queueId:draft.id});
 acceptNativeUser(items,{...native,id:'snapshot-id'});assert.equal(items.size,1);
});
test('a repeated start acknowledgment cannot bind the next dispatch to the previous turn',()=>{
 const items=new Map();acceptQueuedUser(items,draft);acceptStartedTurn(items,{id:'t',items:[native]});
 acceptQueuedUser(items,{...draft,id:'second'});acceptStartedTurn(items,{id:'t'});
 assert.equal(items.get('queued:second')._turnId,undefined);acceptStartedTurn(items,{id:'second-turn'});
 assert.equal(items.get('queued:second')._turnId,'second-turn');assert.equal(items.size,2);
});
test('identical legitimate submissions and same-text steering remain distinct',()=>{
 const items=new Map();for(const [id,turnId] of [['one','t1'],['two','t2']]){
  const sent={...draft,id};acceptQueuedUser(items,sent);acceptStartedTurn(items,{id:turnId,items:[{...native,id:'native-'+id}]},{queueId:id});
 }
 acceptNativeUser(items,{...native,id:'steering',_turnId:'t2',_steering:true});assert.equal(items.size,3);
});
test('image-only echo does not consume an unrelated image-only native input',()=>{
 const items=new Map();acceptQueuedUser(items,{id:'image',text:'',images:[{type:'image',url:'data:image/png;base64,AAA='}]});
 acceptNativeUser(items,{id:'unrelated',type:'userMessage',_turnId:'unrelated',content:[{type:'image',url:'data:image/png;base64,BBB='}]});
 assert.equal(items.size,2);assert.equal(items.get('queued:image')._turnId,undefined);
});
function permutations(values){return values.length?values.flatMap((value,index)=>permutations(values.filter((_,at)=>at!==index)).map(rest=>[value,...rest])):[[]];}
test('all 24 dispatch, native, turn-start and acknowledgment orders converge to one bubble',()=>{
 for(const order of permutations(['dispatch','native','start','ack'])){
  const items=new Map();const actions={dispatch:()=>acceptQueuedUser(items,draft),native:()=>acceptNativeUser(items,native),start:()=>acceptStartedTurn(items,{id:'t',items:[native]}),ack:()=>{acceptQueuedUser(items,draft,'t');acceptStartedTurn(items,{id:'t',items:[native]},{queueId:draft.id});}};
  for(const action of order)actions[action]();assert.equal(items.size,1,order.join(','));
 }
});
