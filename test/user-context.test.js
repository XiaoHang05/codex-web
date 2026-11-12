import assert from 'node:assert/strict';
import test from 'node:test';
import {userContent} from '../public/codex/user-content.js';

const instructions='# AGENTS.md instructions for E:\\project\n\n<INSTRUCTIONS>\n# 规则\n</INSTRUCTIONS>';
const environment='<environment_context>\n  <cwd>E:\\project</cwd>\n</environment_context>';

test('image attachments never add text paragraphs and preserve intentional whitespace',()=>{
  const image={type:'image',url:'data:image/png;base64,AAAA'};
  for(const count of [1,3,8]){
    const content=[{type:'text',text:'hello\n\nworld\n'},...Array(count).fill(image)];
    assert.equal(userContent(content.map(part=>part.text||'').join('\n'),{content}).text,'hello\n\nworld\n');
    assert.equal(userContent('\n'.repeat(count-1),{content:Array(count).fill(image)}).text,'');
  }
  assert.equal(userContent('caption',{content:[image]}).text,'caption');
});

test('separates injected context parts from the actual request',()=>{
  const item={content:[{type:'input_text',text:instructions},{type:'input_text',text:environment},{type:'input_text',text:'请修复页面'}]};
  assert.deepEqual(userContent(item.content.map(part=>part.text).join('\n'),item),{
    text:'请修复页面',images:[],contexts:[{kind:'instructions',text:instructions},{kind:'environment',text:environment}]
  });
});

test('separates a flattened context envelope',()=>{
  const result=userContent(`${instructions}\n${environment}\n用户的问题`);
  assert.equal(result.text,'用户的问题');
  assert.deepEqual(result.contexts.map(part=>part.kind),['instructions','environment']);
});

test('separates a flattened envelope inside one content part',()=>{
  const value=`${instructions}\n${environment}\n用户的问题`;
  const result=userContent(value,{content:[{type:'input_text',text:value}]});
  assert.equal(result.text,'用户的问题');
  assert.deepEqual(result.contexts.map(part=>part.kind),['instructions','environment']);
});

test('keeps a user question quoting the instructions visible',()=>{
  const request=`为什么我能看见\n${instructions}\n${environment}`;
  const result=userContent(request,{content:[{type:'input_text',text:request}]});
  assert.equal(result.text,request);
  assert.deepEqual(result.contexts,[]);
});
