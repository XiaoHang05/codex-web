import test from 'node:test';
import assert from 'node:assert/strict';
import {fileCitations,fileCitationExtension} from '../public/codex/file-citations.js';
import {isArtifactLink,normalizeArtifactPath} from '../public/codex/artifact-path.js';
import {Marked} from '../public/codex/vendor/marked.js';
import {citedFile,webFileCitation,desktopFileCitation} from '../src/artifact-references.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('file citations preserve Unicode paths, spaces, braces and Windows separators',()=>{
  const file='E:/学习/综合课程设计（刘超）/第四讲思考题.pdf';
  const text=`来源 :codex-file-citation{path="${file}" purpose="source"}。`;
  assert.deepEqual(fileCitations(text),[{raw:text.slice(3,-1),index:3,path:file,name:'第四讲思考题.pdf'}]);
  assert.equal(fileCitations(String.raw`:codex-file-citation{path="E:\temp\test_file.pdf"}`)[0].path,String.raw`E:\temp\test_file.pdf`);
  assert.equal(fileCitations(':codex-file-citation{path="a{b}.pdf"}')[0].path,'a{b}.pdf');
  assert.deepEqual(fileCitations(':codex-file-citation{purpose="source"}'),[]);
  assert.deepEqual(fileCitations(':codex-file-citation{path="unfinished'),[]);
});
test('citation Markdown escapes attributes and leaves code examples literal',()=>{
  const marked=new Marked({extensions:[fileCitationExtension]});
  const citation=':codex-file-citation{path="E:/学习/第四讲.pdf" purpose="source"}';
  assert.match(marked.parse(citation),/class="file-citation"/);
  assert.match(marked.parse(citation),/>第四讲.pdf<\/a>/);
  assert.doesNotMatch(marked.parse('`'+citation+'`\n\n```\n'+citation+'\n```'),/<a /);
  const html=marked.parse(':codex-file-citation{path="x\\\" onmouseover=\\\"alert(1).txt"}');
  assert.match(html,/&quot;/);assert.doesNotMatch(html,/title="[^"]*" onmouseover=/);
});
test('ordinary local links include arbitrary formats without intercepting web or mail links',()=>{
  for(const file of ['archive.zip','README','report.xlsx','/E:/学习/file.pdf','E:\\files\\data.bin','file:///E:/files/image.png'])assert.equal(isArtifactLink(file),true,file);
  for(const link of ['https://example.com/x.pdf','mailto:a@example.com','#section','?page=2','javascript:alert(1)','data:text/plain,a',''])assert.equal(isArtifactLink(link),false,link);
});

test('ordinary Markdown file links authorize exactly their local destination',()=>{
  const cwd=path.resolve('fixture-workspace'),file=path.resolve(cwd,'../fixture-logs/report (draft).jsonl');
  const links=[`[日志](<${file}>)`,`[日志](${encodeURI(file)}:12:3)`,`[日志](<file://${file}>)`,`[日志][record]\n\n[record]: <${file}>`];
  for(const text of links){
    for(const item of [{type:'agentMessage',text},{type:'userMessage',content:[{type:'text',text}]}])assert.equal(citedFile(item,cwd,file),true,text);
    assert.equal(citedFile({text},cwd,file+'.other'),false,'a link grants no sibling file access');
  }
  assert.equal(citedFile({text:'[日志](../fixture-logs/relative.jsonl)'},cwd,path.resolve(cwd,'../fixture-logs/relative.jsonl')),true);
  assert.equal(citedFile({text:`:codex-file-citation{path="${file}"}`},cwd,file),true);
});
test('file authorization ignores code examples, images, bare paths and external links',()=>{
  const cwd=path.resolve('fixture-workspace'),file=path.resolve(cwd,'../fixture-logs/report.txt'),link=`[日志](${file})`;
  for(const text of [file,`\`${link}\``,`\`\`\`md\n${link}\n\`\`\``,`    ${link}`,`!${link}`,`[日志](https://example.invalid${file})`,`[日志](mailto:operator@example.invalid)`,`[日志](#${file})`])assert.equal(citedFile({text},cwd,file),false,text);
});
test('ordinary links are found in the matching live reply and refreshed native history',async()=>{
  const cwd=path.resolve('fixture-workspace'),file=path.resolve(cwd,'../fixture-logs/report.txt'),item={type:'agentMessage',text:`[日志](${file})`};
  const instance={ready:true,streamReplies:new Map([['turn',{threadId:'other',items:new Map([['reply',item]])}]])};
  const codex={instances:new Map([['default',instance]]),call:async(_instance,method,params)=>{assert.equal(method,'thread/read');return {thread:{id:params.threadId,turns:[]}};}};
  assert.equal(await webFileCitation(codex,'default','thread',cwd,file),false);
  instance.streamReplies.get('turn').threadId='thread';
  assert.equal(await webFileCitation(codex,'default','thread',cwd,file),true);
  instance.streamReplies.clear();
  codex.call=async()=>({thread:{id:'thread',turns:[{items:[item]}]}});
  assert.equal(await webFileCitation(codex,'default','thread',cwd,file),true);
  codex.call=async()=>({thread:{id:'other',turns:[{items:[item]}]}});
  assert.equal(await webFileCitation(codex,'default','thread',cwd,file),false);
  codex.call=async()=>{throw Error('fixture disconnected');};
  await assert.rejects(webFileCitation(codex,'default','thread',cwd,file),/fixture disconnected/);
  codex.call=async()=>({thread:{id:'thread',turns:[{items:[item]}]}});
  assert.equal(await webFileCitation(codex,'default','thread',cwd,file),true);
});
test('desktop history accepts ordinary local links only from user or assistant messages',async(t)=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'file-citations-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const file=path.join(directory,'report.txt'),historyFile=path.join(directory,'history.jsonl'),text=`[日志](${file})`;
  const history={list(){},files:new Map([['thread',historyFile]])};
  fs.writeFileSync(historyFile,JSON.stringify({type:'response_item',payload:{type:'message',role:'tool',content:[{text}]}})+'\n');
  assert.equal(await desktopFileCitation(history,'thread',directory,file),false);
  fs.appendFileSync(historyFile,JSON.stringify({type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text}]}})+'\n');
  assert.equal(await desktopFileCitation(history,'thread',directory,file),true);
});

test('file URL normalization keeps Unix roots and Windows drive paths',()=>{
  assert.equal(normalizeArtifactPath('file:///var/log/report%20one.txt:12:3'),'/var/log/report one.txt');
  assert.equal(normalizeArtifactPath('file:///E:/reports/report%20one.txt:12'),'E:/reports/report one.txt');
  assert.equal(normalizeArtifactPath('file://E:/reports/report.txt'),'E:/reports/report.txt');
});
