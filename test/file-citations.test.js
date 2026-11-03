import test from 'node:test';
import assert from 'node:assert/strict';
import {fileCitations,fileCitationExtension} from '../public/codex/file-citations.js';
import {isArtifactLink} from '../public/codex/artifact-path.js';
import {Marked} from '../public/codex/vendor/marked.js';

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
