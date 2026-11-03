// Shared by the message renderer and the server's file access checks.
const pattern=()=>/:codex-file-citation\{((?:[^"{}]|"(?:\\.|[^"\\])*")*)\}/g;
export function fileCitations(text){
  const references=[];
  for(const match of String(text||'').matchAll(pattern())){
    const attribute=match[1].match(/\bpath\s*=\s*"((?:\\.|[^"\\])*)"/);
    if(!attribute)continue;
    const path=attribute[1].replace(/\\([\\"])/g,'$1');
    if(!path||/[\0\r\n]/.test(path))continue;
    references.push({raw:match[0],index:match.index,path,name:path.split(/[\\/]/).at(-1)||path});
  }
  return references;
}
const escape=text=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const fileCitationExtension={name:'fileCitation',level:'inline',
  start:source=>source.indexOf(':codex-file-citation{'),
  tokenizer(source){if(!source.startsWith(':codex-file-citation{'))return;const citation=fileCitations(source)[0];if(citation?.index===0)return {type:'fileCitation',...citation};},
  renderer:token=>`<a class="file-citation" href="#" data-artifact-path="${escape(token.path)}" title="${escape(token.path)}">${escape(token.name)}</a>`};
