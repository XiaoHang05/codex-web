import test from 'node:test';
import assert from 'node:assert/strict';
import {recordStreamReply,streamReplySnapshot} from '../src/stream-replies.js';
import {appendReplyDelta,acceptReplyItem,mergeReplyRead,discardReplyDrafts} from '../public/codex/stream-replies.js';
const delta=(text,params={})=>({method:'item/agentMessage/delta',params:{threadId:'thread',turnId:'turn',itemId:'reply',delta:text,...params}});
const thread=()=>({id:'thread',turns:[{id:'turn',status:'inProgress',items:[]}]});
const firstItem=instance=>streamReplySnapshot(instance,thread()).turns[0].items[0];

test('backend retains the complete unfinished reply and exact offsets for refresh',()=>{
 const instance={},prefix='前半段'.repeat(3000),a=delta(prefix),b=delta('后半段');
 recordStreamReply(instance,a);recordStreamReply(instance,b);
 assert.equal(b.params.textOffset,prefix.length);assert.equal(firstItem(instance).text,prefix+'后半段');
 assert.equal(firstItem(instance)._streamRevision,b.params.streamRevision);
});
test('snapshot plus newer deltas restores the prefix and appends each suffix once',()=>{
 const instance={},items=new Map(),a=delta('第一段');recordStreamReply(instance,a);
 const snapshot=firstItem(instance),b=delta('第二段');recordStreamReply(instance,b);appendReplyDelta(items,b.params,'agentMessage');
 const restored=new Map([['reply',{...snapshot,_turnStatus:'inProgress'}]]);mergeReplyRead(restored,items);
 assert.equal(restored.get('reply').text,'第一段第二段');
 appendReplyDelta(restored,b.params,'agentMessage');assert.equal(restored.get('reply').text,'第一段第二段');
});
test('a current snapshot ignores delayed deltas already included in its text',()=>{
 const instance={},a=delta('开头'),b=delta('中间');recordStreamReply(instance,a);recordStreamReply(instance,b);
 const items=new Map([['reply',firstItem(instance)]]);appendReplyDelta(items,a.params,'agentMessage');appendReplyDelta(items,b.params,'agentMessage');
 assert.equal(items.get('reply').text,'开头中间');
});
test('late empty start events never erase accumulated reply text',()=>{
 const items=new Map([['reply',{id:'reply',type:'agentMessage',text:'已有内容',_streamRevision:4}]]);
 acceptReplyItem(items,{id:'reply',type:'agentMessage',text:'',_streamRevision:5});assert.equal(items.get('reply').text,'已有内容');
});
test('stale reads cannot erase a reply or an item missing from their snapshot',()=>{
 const previous=new Map([['reply',{id:'reply',type:'agentMessage',text:'开头结尾',_running:true,_streamRevision:5}]]);
 const items=new Map([['reply',{id:'reply',type:'agentMessage',text:'开头',_streamRevision:3}]]);mergeReplyRead(items,previous);assert.equal(items.get('reply').text,'开头结尾');
 const empty=new Map();mergeReplyRead(empty,previous);assert.equal(empty.get('reply').text,'开头结尾');
});
test('detected gaps request hydration rather than concatenate unrelated text',()=>{
 const items=new Map([['reply',{id:'reply',type:'agentMessage',text:'前段',_streamRevision:1}]]);
 const item=appendReplyDelta(items,{itemId:'reply',textOffset:10,streamRevision:3,delta:'后段'},'agentMessage');
 assert.equal(item.text,'前段');assert.equal(item._replyGap,true);
 const complete=new Map([['reply',{id:'reply',type:'agentMessage',text:'完整前段与后段',_streamRevision:4}]]);mergeReplyRead(complete,items);assert.equal(complete.get('reply').text,'完整前段与后段');
});
test('reply caches isolate chats and leave completed native records authoritative',()=>{
 const instance={};recordStreamReply(instance,delta('聊天一'));recordStreamReply(instance,delta('聊天二',{threadId:'other',turnId:'other-turn'}));
 assert.equal(firstItem(instance).text,'聊天一');
 const native={id:'thread',turns:[{id:'turn',status:'completed',items:[{id:'reply',type:'agentMessage',text:'最终原生回答'}]}]};
 assert.equal(streamReplySnapshot(instance,native).turns[0].items[0].text,'最终原生回答');
});
test('delayed deltas and start events cannot change a completed canonical answer',()=>{
 const items=new Map([['reply',{id:'reply',type:'agentMessage',text:'最终回答',_turnStatus:'completed'}]]);
 appendReplyDelta(items,{itemId:'reply',delta:'迟到增量',streamRevision:4,textOffset:0},'agentMessage');
 acceptReplyItem(items,{id:'reply',type:'agentMessage',text:''});assert.equal(items.get('reply').text,'最终回答');
});

test('native retry discards unfinished drafts but preserves committed commentary and other chats',()=>{
 const instance={};
 recordStreamReply(instance,{method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{id:'comment',type:'agentMessage',text:'Checking the code',phase:'commentary'}}});
 recordStreamReply(instance,delta('Discarded unfinished answer'));
 recordStreamReply(instance,delta('Other chat',{threadId:'other',turnId:'other-turn',itemId:'other-reply'}));
 const retry={method:'error',params:{threadId:'thread',turnId:'turn',willRetry:true,error:{message:'Reconnecting... 1/5'}}};
 recordStreamReply(instance,retry);
 assert.deepEqual(retry.params.discardedReplyIds,['reply']);
 const snapshot=streamReplySnapshot(instance,thread());
 assert.deepEqual(snapshot.turns[0].items.map(item=>item.id),['comment']);
 assert.deepEqual(snapshot.turns[0].webDiscardedReplyIds,['reply']);
 assert.equal(streamReplySnapshot(instance,{id:'other',turns:[{id:'other-turn',status:'inProgress',items:[]}]}).turns[0].items[0].text,'Other chat');
});

test('completed native history cannot resurrect drafts from previous sampling attempts',()=>{
 const instance={};recordStreamReply(instance,delta('First attempt'));
 recordStreamReply(instance,delta('Second attempt',{itemId:'second-draft'}));
 for(const status of ['completed','interrupted','failed']){
  const native={id:'thread',turns:[{id:'turn',status,items:[{id:'canonical',type:'agentMessage',text:'Saved answer'}]}]};
  assert.deepEqual(streamReplySnapshot(instance,native).turns[0].items,native.turns[0].items);
  const previous=new Map([['reply',{id:'reply',type:'agentMessage',text:'First attempt',_turnId:'turn',_running:true,_streamRevision:1}]]);
  const items=new Map([['canonical',{...native.turns[0].items[0],_turnId:'turn',_turnStatus:status}]]);
  mergeReplyRead(items,previous,{turns:native.turns});
  assert.deepEqual([...items.keys()],['canonical']);
 }
});

test('reconnect snapshots remove retry drafts even when an older read brings them back',()=>{
 const draft={id:'draft',type:'agentMessage',text:'Old attempt',_turnId:'turn',_running:true,_streamRevision:2};
 const items=new Map([['draft',draft]]),turns=[{id:'turn',status:'inProgress',webDiscardedReplyIds:['draft']}];
 mergeReplyRead(items,new Map(),{turns});
 assert.equal(items.has('draft'),false);
 appendReplyDelta(items,{itemId:'draft',turnId:'turn',delta:'Late text',streamRevision:3},'agentMessage');
 acceptReplyItem(items,draft);
 assert.equal(items.has('draft'),false);
 items.set('draft',draft);mergeReplyRead(items,new Map());
 assert.equal(items.has('draft'),false);
});

test('retry invalidation survives an empty cache and stale native active snapshots',()=>{
 const instance={},attempt=delta('An incomplete answer');recordStreamReply(instance,attempt);
 const retry={method:'error',params:{threadId:'thread',turnId:'turn',willRetry:true}};recordStreamReply(instance,retry);
 const native=thread();native.turns[0].items=[{id:'reply',type:'agentMessage',text:'Stale attempt'}];
 const snapshot=streamReplySnapshot(instance,native);
 assert.deepEqual(snapshot.turns[0].items,[]);assert.deepEqual(snapshot.turns[0].webDiscardedReplyIds,['reply']);
 assert.equal(native.turns[0].items.length,1);
 const items=new Map();appendReplyDelta(items,attempt.params,'agentMessage');
 discardReplyDrafts(items,retry.params);assert.equal(items.size,0);
 const later=delta('The replacement answer',{itemId:'replacement'});recordStreamReply(instance,later);appendReplyDelta(items,later.params,'agentMessage');
 assert.equal(items.get('replacement').text,'The replacement answer');
});
