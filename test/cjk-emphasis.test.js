import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marked} from '../public/codex/math-markdown.js';
import {Marked} from '../public/codex/vendor/marked.js';

const original=fs.readFileSync(new URL('./fixtures/cjk-emphasis.md',import.meta.url),'utf8');
test('the original Chinese answer retains all three bold spans including punctuation before following prose',()=>{
  const html=marked.parse(original);
  assert.equal([...html.matchAll(/<strong>/g)].length,3);
  assert.match(html,/<strong>而你求出的和函数在 [\s\S]*? 确实有右导数。<\/strong>所以/);
  assert.equal([...html.matchAll(/class="math-source"/g)].length,6);
  assert.doesNotMatch(html,/\*\*/);
});

test('CJK punctuation and adjacent text support strong, emphasis, nesting and multiple spans',()=>{
  for(const punctuation of ['。','，','！','？','；','：','）','”','」','》']){
    assert.equal(marked.parseInline(`**正文${punctuation}**后文`),`<strong>正文${punctuation}</strong>后文`);
    assert.equal(marked.parseInline(`前文**（正文${punctuation}**后文`),`前文<strong>（正文${punctuation}</strong>后文`);
  }
  assert.equal(marked.parseInline('**甲。**乙**丙！**丁'),'<strong>甲。</strong>乙<strong>丙！</strong>丁');
  assert.equal(marked.parseInline('***正文。***后文'),'<em><strong>正文。</strong></em>后文');
  assert.equal(marked.parseInline('**外层*内层。*外层。**后文'),'<strong>外层<em>内层。</em>外层。</strong>后文');
  for(const source of ['**中文。**后文','**日本語。**続き','**한국어。**다음','**𠀀。**𠀁'])assert.match(marked.parseInline(source),/^<strong>.*<\/strong>/);
});

test('native Latin delimiter, code, escaped markers, links and strikethrough rules remain intact',()=>{
  const baseline=new Marked();
  for(const source of [
    '**English.**next','**English.** next','a**b**c','a_b_c','** bold**','**bold **','**unclosed',
    '*a**b***','***nested***','**outer *inner* outer**','**[link](https://example.invalid/)**',
    '`**正文。**后文`','```md\n**正文。**后文\n```','    **正文。**后文',
    String.raw`\*\*正文。\*\*后文`,'~~deleted~~','~~删除~~后文','a~~b~~c',
  ])assert.equal(marked.parse(source),baseline.parse(source),source);
  assert.match(marked.parseInline('**[中文。](https://example.invalid/)**后文'),/<strong><a href="https:\/\/example.invalid\/">中文。<\/a><\/strong>后文/);
});
