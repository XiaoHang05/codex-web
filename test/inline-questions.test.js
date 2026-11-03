import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inlineQuestionRequest,inlineQuestionReply} from '../public/codex/inline-questions.js';
import {desktopActivity} from '../public/codex/thread-activity.js';
import {inlineQuestionsRoute} from '../src/inline-questions.js';
import {CodexManager} from '../src/codex.js';
import {Desktop} from '../adapters/desktop/desktop.js';
import os from 'node:os';
import path from 'node:path';

const questionItem=()=>({id:'call-question',type:'agentMessage',delivery:'async',text:'问题摘要',questions:[{title:'选择颜色？',options:['蓝色','绿色']},{title:'还有什么要求？'}]});
const turn=()=>({id:'turn',turnId:'turn',status:'inProgress',items:[questionItem()]});
function answer(request,values=['蓝色','不要动画']){return {turnId:request.params.turnId,answers:Object.fromEntries(request.params.questions.map((q,i)=>[q.id,{answers:[values[i]]}]))};}
function fixture(source){
 const current=turn(),calls=[];const history={list:()=>source==='desktop'?[{threadId:'fixture'}]:[]};
 const desktop={states:new Map([['fixture',{turns:[current]}]]),follow:async()=>{},control:async(...args)=>{calls.push(args);return {ok:true};}};
 const codex={rpc:async(...args)=>{calls.push(args);return args[1]==='thread/read'?{thread:{turns:[current]}}:{turnId:'turn'};}};
 let csrf=0;const ctx={history,desktop,codex,auth:{csrf(){csrf++;}}},request=inlineQuestionRequest([current],'fixture');
 const req={path:source==='desktop'?'/api/inline-questions/desktop/fixture':'/api/inline-questions/web/profile/fixture',method:'POST',body:answer(request)},res={json(value){this.value=value;}};
 return {current,calls,ctx,req,res,csrf:()=>csrf};
}

test('inline question fields retain string choices and stable native question IDs',()=>{
 const current=turn(),request=inlineQuestionRequest([current],'fixture');
 assert.equal(request.params.questions.length,2);
 assert.equal(request.params.questions[0].id,JSON.stringify(['request_user_input_async','call-question',0]));
 assert.deepEqual(request.params.questions[0].options,[{label:'蓝色',description:''},{label:'绿色',description:''}]);
 assert.deepEqual(request.params.questions[1].options,[]);
 assert.equal(desktopActivity({turns:[current],requests:[]}).needsAttention,true);
});

test('accepted answers disappear while optimistic, unrelated and malformed messages do not resolve questions',()=>{
 const current=turn(),request=inlineQuestionRequest([current],'fixture'),text=inlineQuestionReply(request,answer(request));
 current.items.push({type:'steeringUserMessage',status:'pending',input:[{type:'text',text}]});
 assert(inlineQuestionRequest([current],'fixture'));
 current.items.at(-1).status='accepted';assert.equal(inlineQuestionRequest([current],'fixture'),null);
 current.items.at(-1).type='userMessage';current.items.at(-1).content=current.items.at(-1).input;
 assert.equal(inlineQuestionRequest([current],'fixture'),null);
 assert.equal(desktopActivity({turns:[current]}).needsAttention,false);
});

test('completed questions remain answerable while ambiguous turns and invalid answers cannot submit',()=>{
 const current=turn(),request=inlineQuestionRequest([current],'fixture');
 for(const body of [{...answer(request),turnId:'stale'},{turnId:'turn',answers:{}},answer(request,['','text']),answer(request,['a'.repeat(4001),'text'])])assert.throws(()=>inlineQuestionReply(request,body));
 current.status='completed';assert.equal(inlineQuestionRequest([current],'fixture').params.idle,true);
 current.status='inProgress';assert.equal(inlineQuestionRequest([current,turn()],'fixture'),null);
 assert.throws(()=>inlineQuestionReply(null,answer(request)));
});

test('pending async questions survive later turns and resolve only from accepted replies anywhere in the history',()=>{
 const original={...turn(),status:'completed'},later={id:'later',status:'inProgress',items:[]};
 const pending=inlineQuestionRequest([original,later],'fixture');assert.equal(pending.params.turnId,'later');assert.equal(pending.params.idle,undefined);
 later.items.push({type:'steeringUserMessage',status:'pending',input:[{type:'text',text:inlineQuestionReply(pending,answer(pending))}]});
 assert(inlineQuestionRequest([original,later],'fixture'));
 later.items[0].status='accepted';assert.equal(inlineQuestionRequest([original,later],'fixture'),null);
 later.status='completed';assert.equal(inlineQuestionRequest([original,later],'fixture'),null);
 assert.equal(desktopActivity({turns:[original,later]}).needsAttention,false);
});

test('an ordinary follow-up supersedes old questions rather than resurrecting stale prompts',()=>{
 const original={...turn(),status:'completed'},later={id:'later',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'这是后台的截图，显示未申请。'}]}]};
 assert.equal(inlineQuestionRequest([original,later],'fixture'),null);
 later.items.push({...questionItem(),id:'new-question'});
 const pending=inlineQuestionRequest([original,later],'fixture');assert.equal(pending.params.questions.length,2);
 assert(pending.params.questions.every(q=>JSON.parse(q.id)[1]==='new-question'));
});

for(const source of ['desktop','web'])test(`${source} replies after completion start a new turn and retain the native envelope`,async()=>{
 const f=fixture(source);f.current.status='completed';
 assert.equal(await inlineQuestionsRoute(f.req,f.res,f.ctx),true);
 const call=f.calls.at(-1);assert.equal(call[1],source==='desktop'?'send':'turn/start');
 const params=call[2],request=source==='desktop'?params.turnStart.request:params;
 assert.equal(request.threadId,'fixture');assert.match(request.input[0].text,/<send_user_message_question_reply>/);
 if(source==='desktop'){assert.equal(params.expectedIdleTurnId,'turn');assert.equal(params.turnStart.context.inheritThreadSettings,true);}
});

test('desktop idle reply guard refuses changed, busy and approval-pending states without dispatch',async()=>{
 const desktop=new Desktop({homeDirectory:path.join(os.tmpdir(),'missing-idle-question-home')}),calls=[];
 let current={turns:[{...turn(),status:'completed'}],requests:[],threadRuntimeStatus:{type:'idle'}};
 desktop.follow=async()=>desktop.states.set('fixture',current);
 desktop.request=async(...args)=>{calls.push(args);return {ok:true};};
 const params={expectedIdleTurnId:'turn',turnStart:{request:{threadId:'fixture',input:[{type:'text',text:'fixture answer'}]},context:{inheritThreadSettings:true}}};
 for(const changed of [
  {...current,turns:[{...turn(),id:'changed',turnId:'changed',status:'completed'}]},
  {...current,turns:[turn()]},
  {...current,threadRuntimeStatus:{type:'active'}},
  {...current,requests:[{id:1,completed:false}]}
 ]){current=changed;await assert.rejects(desktop.control('fixture','send',params),/轮次已变化/);}
 assert.equal(calls.length,0);
 current={turns:[{...turn(),status:'completed'}],requests:[],threadRuntimeStatus:{type:'idle'}};
 await desktop.control('fixture','send',params);assert.equal(calls.length,1);
 assert.equal(calls[0][0],'thread-follower-start-turn');assert.equal(calls[0][1].expectedIdleTurnId,undefined);
});

for(const source of ['desktop','web'])test(`${source} answers use native question reply text and the expected active turn`,async()=>{
 const f=fixture(source);assert.equal(await inlineQuestionsRoute(f.req,f.res,f.ctx),true);assert.equal(f.csrf(),1);assert.equal(f.res.value.ok,true);
 const call=f.calls.at(-1),params=call[2];assert.equal(call[1],source==='desktop'?'steer':'turn/steer');assert.equal(params.expectedTurnId,'turn');
 assert.match(params.input[0].text,/<send_user_message_question_reply>/);
 const replies=JSON.parse(params.input[0].text.slice(34,-35));assert.equal(replies[0].answer,'蓝色');assert.equal(replies[1].answer,'不要动画');
 assert.equal(replies[0].questionItemId,JSON.stringify(['request_user_input_async','call-question',0]));
 f.current.items.push({type:'steeringUserMessage',status:'accepted',input:params.input});
 await assert.rejects(inlineQuestionsRoute(f.req,f.res,f.ctx),/过期/);
 assert.equal(f.calls.filter(call=>['steer','turn/steer'].includes(call[1])).length,1);
});

test('inline reply endpoint enforces CSRF, origin mode, read-only, ownership and request freshness',async()=>{
 for(const flag of ['protected','accountMismatch','conflict']){
  const f=fixture('desktop');f.ctx.history.list=()=>[{threadId:'fixture',[flag]:true}];
  await assert.rejects(inlineQuestionsRoute(f.req,f.res,f.ctx));assert.equal(f.calls.length,0);
 }
 let f=fixture('desktop');f.ctx.auth.csrf=()=>{throw Error('Invalid CSRF token');};await assert.rejects(inlineQuestionsRoute(f.req,f.res,f.ctx),/CSRF/);assert.equal(f.calls.length,0);
 f=fixture('web');f.ctx.history.list=()=>[{threadId:'fixture'}];await assert.rejects(inlineQuestionsRoute(f.req,f.res,f.ctx),/桌面连接/);assert.equal(f.calls.length,0);
 f=fixture('desktop');f.req.body.turnId='old';await assert.rejects(inlineQuestionsRoute(f.req,f.res,f.ctx),/过期/);assert.equal(f.calls.length,0);
 f=fixture('desktop');f.req.method='GET';await assert.rejects(inlineQuestionsRoute(f.req,f.res,f.ctx),/POST/);
});

test('web instance notifies inline questions and preserves native request questions',()=>{
 const sent=[],manager=new CodexManager({profiles:[]},()=>{},{enqueue:event=>sent.push(event)});
 const i={id:'profile',startedAt:'fixture',profile:{cwd:'E:/fixture'},requests:new Map(),approvals:new Map(),loaded:new Set(),active:new Map()};
 manager.receive(i,{method:'item/completed',params:{threadId:'fixture',turnId:'turn',item:questionItem()}});
 assert.equal(sent[0].kind,'question');assert.match(sent[0].summary,/选择颜色/);assert.match(sent[0].path,/profile=profile&thread=fixture/);
 manager.receive(i,{id:7,method:'item/tool/requestUserInput',params:{threadId:'fixture',questions:[{id:'q',question:'原生提问？'}]}});
 assert.equal(sent[1].kind,'question');assert.equal(i.approvals.get('7').id,7);
});

test('desktop checks the expected turn again after following and before native dispatch',async()=>{
 const desktop=new Desktop({homeDirectory:path.join(os.tmpdir(),'missing-inline-question-home')});
 const calls=[];desktop.follow=async()=>{desktop.states.set('fixture',{turns:[{...turn(),id:'new-turn',turnId:'new-turn'}]});};
 desktop.request=async(...args)=>{calls.push(args);return {ok:true};};
 await assert.rejects(desktop.control('fixture','steer',{expectedTurnId:'turn',input:[]}),/轮次已变化/);assert.equal(calls.length,0);
 await desktop.control('fixture','steer',{expectedTurnId:'new-turn',input:[{type:'text',text:'fixture'}]});
 assert.equal(calls.length,1);assert.equal(calls[0][0],'thread-follower-steer-turn');
 assert.deepEqual(calls[0][1].input[0].text_elements,[]);
});
