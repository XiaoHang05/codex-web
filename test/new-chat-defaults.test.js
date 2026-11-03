import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultModelSettings,defaultSpeed} from '../public/codex/new-chat-defaults.js';
import {resolveModelSelection} from '../public/codex/model-selection.js';
test('new model defaults resolve supported effort and native inheritance',()=>{
 const native={model:'a',effort:'high'},models=[{model:'b',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'}]}];
 assert.deepEqual(defaultModelSettings(native,{}),native);
 assert.deepEqual(defaultModelSettings(native,{model:'b',effort:null}),{model:'b',effort:null});
 assert.equal(resolveModelSelection(models,defaultModelSettings(native,{model:'b',effort:'ultra'})).effort,'medium');
});
test('fast defaults use model capabilities and fall back to standard',()=>{
 assert.equal(defaultSpeed({speed:'fast'},{additionalSpeedTiers:['priority']}),'priority');
 assert.equal(defaultSpeed({speed:'fast'},{serviceTiers:[{id:'fast'}]}),'fast');
 assert.equal(defaultSpeed({speed:'fast'},{}),'default');
 assert.equal(defaultSpeed({speed:'default'},{}),'default');
 assert.equal(defaultSpeed({speed:'inherit'},{}),undefined);
});
