import {fileCitations} from './file-citations.js';
import {preview} from './artifact-ui.js';

export function mountFileCitations(root,context){
  // User messages use plain text; turn only explicit citations into links.
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())if(!walker.currentNode.parentElement.closest('pre,code,a,script,style'))nodes.push(walker.currentNode);
  for(const node of nodes){
    const citations=fileCitations(node.textContent);if(!citations.length)continue;
    const fragment=document.createDocumentFragment();let offset=0;
    for(const citation of citations){
      fragment.append(node.textContent.slice(offset,citation.index));
      const link=document.createElement('a');link.className='file-citation';link.href='#';link.dataset.artifactPath=citation.path;link.title=citation.path;link.textContent=citation.name;fragment.append(link);
      offset=citation.index+citation.raw.length;
    }
    fragment.append(node.textContent.slice(offset));node.replaceWith(fragment);
  }
  for(const link of root.querySelectorAll('a.file-citation')){
    link.onclick=event=>{event.preventDefault();event.stopPropagation();if(context)preview(link.dataset.artifactPath,context);};
  }
}
