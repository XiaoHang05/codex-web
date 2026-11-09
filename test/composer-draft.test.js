import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual selection transition before its asynchronous history load.
const source=fs.readFileSync(new URL('../public/codex/app.js',import.meta.url),'utf8');
const transition=source.slice(source.indexOf('async function open(row,'),source.indexOf('  const scope=inputScope();restoreView='))+'\n}';
const image={type:'image',url:'data:image/png;base64,fixture'};
function fixture(pane=false){
 const elements=new Map(),saved=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',title:''});return elements.get(id);};
 $('input').value='  message with image  ';
 const noop=()=>{};
 const context={$,pendingSkill:{name:'skill',path:'fixture'},pendingImages:[image],selected:null,profile:'fixture',
  predictions:{clear:noop},stopViewSettling:null,restoreView:null,saveView:noop,clearTimeout:noop,viewTimer:0,
  workspace:{matchesSelection:()=>true,saveDraft(){saved.push({text:$('input').value,images:[...context.pendingImages]});},selected(){if(!pane)$('input').value='';}},
  beginViewLoad:noop,webQuestionTurns:[],modelSelection:{reset:noop},chatStateReady:true,awaitingDesktopStart:false,
  feedbackThreads:new Set(),desktopPages:{reset:noop},commandMenu:{close:noop},conversationUI:{goal:noop},turnId:null,liveItems:new Map(),
  loadQueue:noop,restoreCommandOptions(){context.pendingImages=[];context.pendingSkill=null;},paintCommandOptions:noop,refreshGoal:noop};
 vm.createContext(context);vm.runInContext(transition+';this.open=open;',context);
 return {context,$,saved};
}
for(const pane of [false,true])test(`new chat carries text and attachments together (pane=${pane})`,async()=>{
 const f=fixture(pane);
 await f.context.open({key:'web:fixture:new',threadId:'new',sources:['web:fixture']},{carryDraft:true});
 assert.equal(f.$('input').value,'  message with image  ');
 assert.equal(f.context.pendingImages[0],image);
 assert.equal(f.context.pendingSkill.name,'skill');
 assert.equal(f.saved.at(-1).text,'  message with image  ');
 assert.equal(f.saved.at(-1).images[0],image);
});
test('ordinary chat selection does not carry another chat draft',async()=>{
 const f=fixture();await f.context.open({key:'other',threadId:'other',sources:['web:fixture']});
 assert.equal(f.$('input').value,'');assert.equal(f.context.pendingImages.length,0);
});
