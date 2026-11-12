import {Marked} from './vendor/marked.js';
import katex from './vendor/katex/katex.mjs';
import {fileCitationExtension} from './file-citations.js';

// Tokenize before Markdown consumes formula backslashes and underscores.
// Code spans and fenced blocks stay under Marked's normal code tokenizers.
function formula(source) {
  const open=['\\[','$$','\\(','$'].find(value=>source.startsWith(value));
  if(!open)return;
  const display=open==='\\['||open==='$$',close=open==='\\['?'\\]':open==='\\('?'\\)':open;
  if(open==='$'&&(/\s/.test(source[1]||'')||!source[1]))return;
  for(let i=open.length;i<source.length;i++){
    if(!display&&source[i]==='\n')return;
    if(source.startsWith(close,i)){
      if(open==='$'&&(/\s/.test(source[i-1])||/\d/.test(source[i+1]||'')||source[i+1]==='$'))return;
      const text=source.slice(open.length,i);
      if(!text.trim())return;
      return {raw:source.slice(0,i+close.length),text,display};
    }
    if(source[i]==='\\')i++;
  }
}
const escape=text=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const placeholder=token=>`<span class="math-source" data-math-display="${token.display}">${escape(token.text)}</span>`;
export const marked=new Marked({tokenizer:{
  lheading(source){
    // Marked checks setext headings before it applies block-extension starts.
    // A standalone '=' inside display math must not turn preceding text into a heading.
    const heading=this.rules.block.lheading.exec(source);
    if(heading)for(const open of heading[1].matchAll(/^ {0,3}(?:\\\[|\$\$)/gm)){
      if(formula(source.slice(open.index).replace(/^ {0,3}/,''))?.display)return;
    }
    return false;
  }
},extensions:[
  fileCitationExtension,
  {name:'blockMath',level:'block',start:source=>{const index=source.search(/\n {0,3}(?:\\\[|\$\$)/);return index<0?undefined:index+1;},
    tokenizer(source){const leading=source.match(/^ {0,3}/)[0],token=formula(source.slice(leading.length));if(token?.display)return {type:'blockMath',...token,raw:leading+token.raw};},
    renderer:token=>`<div class="math-block">${placeholder(token)}</div>\n`},
  {name:'inlineMath',level:'inline',start:source=>source.search(/\\[([]|\$/),
    tokenizer(source){const token=formula(source);if(token)return {type:'inlineMath',...token};},renderer:placeholder}
]});

// Sanitize Markdown first. KaTeX then creates its own layout, including styles,
// SVG and MathML, without allowing untrusted HTML or external resource commands.
export function renderMath(root) {
  for(const node of root.querySelectorAll('.math-source')){
    if(node.closest('pre,code,kbd,samp'))continue;
    const text=node.textContent;
    try{katex.render(text,node,{displayMode:node.dataset.mathDisplay==='true',throwOnError:true,trust:false,strict:'ignore',maxSize:20,maxExpand:1000});}
    catch{node.textContent=text;node.classList.add('math-error');node.title='公式不完整或包含暂不支持的语法';}
    node.classList.remove('math-source');node.classList.add('math-rendered');
  }
}

if(typeof document!=='undefined'){
  for(const href of ['/codex/vendor/katex/katex.min.css','/codex/math-markdown.css']){
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
  }
}
