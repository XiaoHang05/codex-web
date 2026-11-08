import test from 'node:test';
import assert from 'node:assert/strict';
import {taskControlState} from '../public/codex/task-control.js';
import {createDesktopAdapter} from '../adapters/desktop/index.js';

test('only the latest stopped canonical turn offers continuation, including empty turns',()=>{
 for(const status of ['interrupted','failed']){
  const turns=[{id:'old',status:'completed'},{id:'stopped',status,items:[]}];
  assert.deepEqual(taskControlState({turns,ready:true}),{action:'continue',turnId:'stopped',disabled:false});
  assert.equal(taskControlState({turns:[...turns,{id:'new',status:'completed'}],ready:true}).disabled,true);
  for(const gate of [{blocked:true},{ready:false},{pending:true}])assert.equal(taskControlState({turns,ready:true,...gate}).disabled,true);
 }
 assert.equal(taskControlState({turns:[{turnId:'desktop',status:'interrupted'}],ready:true}).turnId,'desktop');
 assert.deepEqual(taskControlState({activeTurn:'running',ready:true}),{action:'interrupt',turnId:'running',disabled:false});
 assert.equal(taskControlState({ready:true}).disabled,true);
});

async function fixture(state){
 const calls=[],desktop={follow:async()=>state,control:async(...args)=>{calls.push(args);return {ok:true};}};
 const adapter=await createDesktopAdapter({}, {}, {desktop,history:{list:()=>[]}});
 const context={preferences:{registerSession:()=>({access:'workspace-write',approval:'manual'})}};
 const send=body=>adapter.handle({path:'/api/desktop/fixture/send',method:'POST',body},{json(){}},context);
 return {send,calls};
}
test('desktop continuation forwards an empty native turn with the recovery trigger',async()=>{
 const f=await fixture({turns:[{turnId:'stopped',status:'interrupted'}],threadRuntimeStatus:{type:'idle'}});
 await f.send({input:[],turnTrigger:'resume_interrupted_task',expectedTurnId:'stopped'});
 const [id,action,params]=f.calls[0];assert.equal(id,'fixture');assert.equal(action,'send');
 assert.deepEqual(params.turnStart.request.input,[]);
 assert.equal(params.turnStart.request.turnTrigger,'resume_interrupted_task');
 assert.equal(params.turnStart.context.inheritThreadSettings,true);
});
test('desktop continuation refuses stale, active and approval-blocked states',async()=>{
 for(const patch of [{turns:[{id:'new',status:'completed'}]},{threadRuntimeStatus:{type:'active'}},{requests:[{id:'approval',completed:false}]}]){
  const f=await fixture({turns:[{id:'stopped',status:'interrupted'}],...patch});
  await assert.rejects(f.send({input:[],turnTrigger:'resume_interrupted_task',expectedTurnId:'stopped'}));assert.equal(f.calls.length,0);
 }
 const f=await fixture({turns:[{id:'stopped',status:'interrupted'}]});
 await assert.rejects(f.send({input:[{type:'text',text:'continue'}],turnTrigger:'resume_interrupted_task',expectedTurnId:'stopped'}));
 await assert.rejects(f.send({input:[],turnTrigger:'resume_interrupted_task'}));assert.equal(f.calls.length,0);
});
test('ordinary desktop sends retain their existing shape',async()=>{
 const f=await fixture({}),input=[{type:'text',text:'hello'}];await f.send({input});
 assert.deepEqual(f.calls[0][2].turnStart.request.input,input);assert.equal(f.calls[0][2].turnStart.request.turnTrigger,undefined);
});
