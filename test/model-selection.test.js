import test from 'node:test';
import assert from 'node:assert/strict';
import {currentModelSettings,resolveModelSelection} from '../public/codex/model-selection.js';
import {modelSettings,desktopModelCatalog} from '../src/model-settings.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const models=[{model:'a',isDefault:true,defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'ultra'}]},{model:'b',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'}]}];
test('current native conversation settings override defaults and respect explicit default effort',()=>{
 assert.deepEqual(currentModelSettings({latestModel:'a',latestReasoningEffort:'ultra',latestThreadSettings:{model:'b',effort:'low'}}),{model:'b',effort:'low'});
 assert.deepEqual(currentModelSettings({latestModel:'a',latestReasoningEffort:'ultra',latestThreadSettings:{effort:null}}),{model:'a',effort:null});
 assert.deepEqual(currentModelSettings({thread:{webModelSettings:{model:'b',effort:'medium'}}}),{model:'b',effort:'medium'});
});
test('new composer resolves configuration values and model-specific default efforts',()=>{
 assert.equal(resolveModelSelection(models,{model:'b'}).model,'b');
 assert.equal(resolveModelSelection(models,{model:'b'}).effort,'medium');
 assert.equal(resolveModelSelection(models,{model:'a',effort:'ultra'}).effort,'ultra');
 assert.equal(resolveModelSelection(models,{model:'a',effort:'high'},{model:'b',effort:'low'}).effort,'low');
});
test('switching models rejects unsupported old effort and uses the target model default',()=>{
 const next=resolveModelSelection(models,{}, {model:'a',effort:'ultra'},{model:'b',effort:'ultra'});
 assert.equal(next.model,'b');assert.equal(next.effort,'medium');assert.deepEqual(next.efforts,['low','medium']);
 assert.equal(resolveModelSelection(models,{}, {},{model:'b',effort:'low'}).effort,'low');
});
test('unknown actual model stays visible without fabricated reasoning capabilities',()=>{
 const next=resolveModelSelection(models,{}, {model:'native-model',effort:'xhigh'});
 assert.equal(next.model,'native-model');assert.equal(next.effort,'xhigh');assert.deepEqual(next.efforts,[]);
 assert.equal(resolveModelSelection([],{}).model,'');
});
test('configuration endpoint reads only native config and returns no provider secrets',async()=>{
 const calls=[],instance={profile:{cwd:'E:\\fixture'}};
 const manager={async start(id){calls.push(id);return instance;},async call(i,method,params){assert.equal(i,instance);calls.push({method,params});return {config:{model:'b',model_reasoning_effort:'low',secret:'must-not-leak'}};}};
 assert.deepEqual(await modelSettings(manager,'fixture'),{model:'b',effort:'low'});
 assert.deepEqual(calls,['fixture',{method:'config/read',params:{includeLayers:false,cwd:'E:\\fixture'}}]);
});
test('desktop catalog reads its own native capability cache and exposes only menu metadata',async()=>{
 await fs.mkdir(path.resolve('.local/tests'),{recursive:true});
 const directory=await fs.mkdtemp(path.resolve('.local/tests/model-catalog-'));
 try{
  await fs.writeFile(path.join(directory,'models_cache.json'),JSON.stringify({identity:'private',models:[{slug:'a',display_name:'模型 A',default_reasoning_level:'ultra',supported_reasoning_levels:[{effort:'high'},{effort:'ultra'}],base_instructions:'private',visibility:'list'}]}));
  const result=await desktopModelCatalog(directory);assert.equal(result.data[0].defaultReasoningEffort,'ultra');assert.deepEqual(result.data[0].supportedReasoningEfforts.map(x=>x.reasoningEffort),['high','ultra']);assert.ok(!JSON.stringify(result).includes('private'));
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
