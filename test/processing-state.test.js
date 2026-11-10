import test from 'node:test';
import assert from 'node:assert/strict';
import {withProcessingStatus,retainUnpersistedTurn} from '../public/codex/processing-state.js';
import {turnItems,desktopTurnItems} from '../public/codex/message-ui.js';
test('confirmed turn retains its timing row after the user receipt removes thinking',()=>{
 const user={id:'user',type:'userMessage',_turnId:'receipt-turn',_turnStatus:'inProgress',_processingStartedAt:123};
 const items=withProcessingStatus([user],'receipt-turn');
 assert.equal(items[0],user);assert.equal(items[1].type,'processingStatus');assert.equal(items[1]._processingStartedAt,123);
 assert.equal(withProcessingStatus(items,'receipt-turn').length,2);
 assert.equal(withProcessingStatus([user,{id:'work',type:'reasoning',_turnId:user._turnId,_turnStatus:'inProgress'}],user._turnId).length,2);
});
test('start acknowledgment without items is visible and its fallback time stays stable',()=>{
 const first=withProcessingStatus([],'empty-turn'),second=withProcessingStatus([],'empty-turn');
 assert.equal(first.length,1);assert.equal(first[0]._processingStartedAt,second[0]._processingStartedAt);
 assert.equal(withProcessingStatus([],null).length,0);
});
for(const desktop of [false,true])test(`user-only history shows running timing for ${desktop?'desktop':'web'}`,()=>{
 const turn={id:'history-'+desktop,status:'inProgress',startedAt:123,items:[{id:'user',type:'userMessage',text:'hello'}]};
 const items=desktop?desktopTurnItems(turn,[]):turnItems(turn);
 assert.equal(withProcessingStatus(items,null)[1]._processingStartedAt,123);
 assert.equal(withProcessingStatus(turnItems({...turn,status:'completed'}),null).length,1);
});
test('an unrelated queued message does not start a processing timer',()=>{
 assert.equal(withProcessingStatus([{id:'queued',type:'userMessage',_deliveryStatus:'sending'}],null).length,1);
});
test('lagging history cannot erase a start that was already acknowledged',()=>{
 const previous=new Map([['user',{id:'user',type:'userMessage',_turnId:'late'}]]),items=new Map();
 assert.equal(retainUnpersistedTurn(items,previous,'late',[]),'late');assert.equal(items.size,1);
 assert.equal(retainUnpersistedTurn(new Map(),previous,'late',[{id:'late',status:'completed'}]),null);
 assert.equal(retainUnpersistedTurn(new Map(),previous,null,[]),null);
});
