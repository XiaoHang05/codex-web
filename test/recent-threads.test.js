import test from 'node:test';
import assert from 'node:assert/strict';
import {recentThreadActivity,isRecentCodexMessage} from '../public/codex/recent-threads.js';

const rows=()=>Array.from({length:8},(_,i)=>({key:'account:'+i,threadId:String(i),updatedAt:100-i,sources:['desktop']}));
test('five latest across projects, promoted by messages, retaining order through history refresh',()=>{
 const activity=recentThreadActivity(()=>200),history=rows();
 assert.deepEqual(activity.latest(history).map(row=>row.threadId),['0','1','2','3','4']);
 activity.touch(history[7]);activity.touch(history[6]);
 assert.deepEqual(activity.latest(rows()).map(row=>row.threadId),['6','7','0','1','2']);
 assert.equal(history[0].threadId,'0');
 assert(!activity.latest(history.filter(row=>row.threadId!=='6')).some(row=>row.threadId==='6'));
 assert.equal(activity.latest([]).length,0);
 assert.equal(activity.latest(history.slice(0,2)).length,2);
 const other=history.map(row=>({...row,key:'other:'+row.threadId}));
 assert.equal(activity.latest(other)[0].threadId,'0');
});
test('desktop snapshots ignore initial hydration and tool/status changes, detect user input and reply changes',()=>{
 const activity=recentThreadActivity(),state={turns:[{id:'t',items:[{id:'u',type:'userMessage',content:[{type:'text',text:'开始'}]}]}]};
 assert.equal(activity.desktopChanged('a',state),false);
 state.turns[0].status='inProgress';state.turns[0].items.push({id:'tool',type:'commandExecution',text:'执行中'});
 assert.equal(activity.desktopChanged('a',state),false);
 state.turns[0].items.push({id:'reply',type:'agentMessage',text:'回复一'});
 assert.equal(activity.desktopChanged('a',state),true);
 assert.equal(activity.desktopChanged('a',state),false);
 state.turns[0].items.at(-1).text='回复二';
 assert.equal(activity.desktopChanged('a',state),true);
 state.turns[0].items.push({id:'steer',type:'steeringUserMessage',text:'继续'});
 assert.equal(activity.desktopChanged('a',state),true);
 const native={turnHistory:{history:{entitiesByKey:{t:state.turns[0]},islands:[{entries:[{value:'t'}]}]}}};
 assert.equal(activity.desktopChanged('a',native),false);
});
test('web activity includes inputs and streaming/final replies, ignoring tools, approvals and token usage',()=>{
 for(const method of ['turn/started','item/agentMessage/delta'])assert(isRecentCodexMessage({method}));
 for(const method of ['item/started','item/completed'])for(const type of ['userMessage','agentMessage'])assert(isRecentCodexMessage({method,params:{item:{type}}}));
 for(const method of ['thread/tokenUsage/updated','item/commandExecution/outputDelta','item/permissions/requestApproval','thread/name/updated'])assert(!isRecentCodexMessage({method}));
 assert(!isRecentCodexMessage({method:'item/completed',params:{item:{type:'commandExecution'}}}));
});
