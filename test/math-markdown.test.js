import test from 'node:test';
import assert from 'node:assert/strict';
import {marked} from '../public/codex/math-markdown.js';
import katex from '../public/codex/vendor/katex/katex.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const boxed=String.raw`\boxed{
\int_0^1(1-x)^2(h')^2
=
\frac14\int_0^1h^2
+\int_0^1\left((1-x)h'-\frac h2\right)^2.
}`;

test('display math after prose preserves a standalone equals line instead of becoming a setext heading',()=>{
  for(const [open,close] of [['\\[','\\]'],['$$','$$']]){
    const html=marked.parse(`甚至可以写成一个精确的“勾股关系”：\n${open}\n${boxed}\n${close}\n右边非负。`);
    assert.doesNotMatch(html,/<h[12]>/);
    assert.match(html,/<p>甚至可以写成一个精确的“勾股关系”：<\/p>/);
    assert.match(html,/<div class="math-block"><span class="math-source" data-math-display="true">/);
    assert.match(html,/\n=\n/);
    assert.match(html,/<p>右边非负。<\/p>/);
    const tex=html.match(/data-math-display="true">([\s\S]*?)<\/span>/)[1].replaceAll('&#39;',"'");
    assert.equal(tex.trim(),boxed);
    assert.match(katex.renderToString(tex,{displayMode:true,throwOnError:true}),/class="katex"/);
  }
});

test('display formulas retain precedence in indented, quoted and list content',()=>{
  const lines=['解释：','\\[','a','=', 'b','\\]'];
  for(const input of [lines.map(line=>'   '+line).join('\n'),lines.map(line=>'> '+line).join('\n'),'- '+lines.join('\n  ')]){
    const html=marked.parse(input);
    assert.doesNotMatch(html,/<h[12]>/);
    assert.match(html,/data-math-display="true">\n *a\n *=\n *b\n/);
  }
});

test('ordinary setext headings and literal code keep their Markdown meaning',()=>{
  assert.match(marked.parse('Title\n===\n\nSubtitle\n---'),/<h1>Title<\/h1>\n<h2>Subtitle<\/h2>/);
  assert.match(marked.parse('Title\n===\n\\[a=b\\]'),/<h1>Title<\/h1>/);
  for(const input of ['```latex\n\\[\na\n=\nb\n\\]\n```','    \\[\n    a\n    =\n    b\n    \\]','`\\[a=b\\]`']){
    const html=marked.parse(input);
    assert.match(html,/<code/);
    assert.doesNotMatch(html,/math-source|math-block/);
  }
  assert.match(marked.parse('说明 \\(a=b\\)。'),/data-math-display="false">a=b<\/span>/);
  assert.match(marked.parse('unfinished\n\\[\na\n='),/<h1>/);
});

const browserAvailable=process.env.PLAYWRIGHT_MODULE&&process.env.CHROMIUM_BIN;
test('display equations render through sanitization and KaTeX in desktop and narrow browsers',{
  skip:!browserAvailable&&'Set PLAYWRIGHT_MODULE and CHROMIUM_BIN for the real browser regression',timeout:60000,
},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  const assets=path.resolve(process.env.CODEX_MATH_ASSETS||fileURLToPath(new URL('../public/codex/',import.meta.url)));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN,headless:true});
  const content=`勾股关系：\n\\[\n${boxed}\n\\]\n右边非负。\n\nDollar display:\n$$\n${boxed}\n$$\n\nTitle\n===\n\n\`\\[literal\\]\`\n\nInline \\(a=b\\) and $c=d$.`;
  try{
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:850}}),errors=[],failed=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('requestfailed',request=>failed.push(request.url()));
      page.on('response',response=>{if(response.status()>=400)failed.push(response.url());});
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.hostname!=='math.test')return route.abort();
        if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:16px}#reply{min-width:0;max-width:100%}</style><article id="reply"></article>'});
        if(!url.pathname.startsWith('/codex/'))return route.abort();
        const file=path.resolve(assets,'.'+url.pathname.slice('/codex'.length));
        if(!file.startsWith(assets+path.sep)||!fs.existsSync(file))return route.abort();
        const ext=path.extname(file),contentType={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'}[ext];
        return route.fulfill({contentType,body:fs.readFileSync(file)});
      });
      await page.goto('http://math.test/');
      await page.evaluate(async content=>{
        const {marked,renderMath}=await import('/codex/math-markdown.js');
        const {default:DOMPurify}=await import('/codex/vendor/purify.js');
        const root=document.querySelector('#reply');
        root.innerHTML=DOMPurify.sanitize(marked.parse(content),{USE_PROFILES:{html:true},FORBID_TAGS:['img','style','form','input','button','iframe'],FORBID_ATTR:['style']});
        renderMath(root);
      },content);
      await page.waitForFunction(()=>document.querySelector('.katex')&&getComputedStyle(document.querySelector('.katex')).fontFamily.includes('KaTeX'));
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('.math-rendered .katex').count(),4);
      assert.equal(await page.locator('.math-rendered[data-math-display=true] .katex').count(),2);
      assert.equal(await page.locator('.math-error,.math-source').count(),0);
      assert.equal(await page.locator('h1').textContent(),'Title');
      assert.equal(await page.locator('code').textContent(),'\\[literal\\]');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.katex .fbox')].length),2);
      if(width===390){
        assert.equal(await page.evaluate(()=>{
          const math=document.querySelector('.math-rendered[data-math-display=true]');
          math.scrollLeft=math.scrollWidth;
          return math.scrollLeft>0;
        }),true);
      }
      assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
      console.log(JSON.stringify({width,formulas:4,boxed:2,pageErrors:errors,failedRequests:failed}));
      await page.close();
    }
  }finally{await browser.close();}
});
