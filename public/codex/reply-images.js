import {imageThumbnail} from './artifact-ui.js';
import {normalizeArtifactPath} from './artifact-path.js';

export function replyImageMarkup(token){
 const span=document.createElement('span');span.dataset.replyImage=token.href||'';
 span.dataset.imageAlt=token.text||'图片';span.textContent=token.text||'图片';return span.outerHTML;
}
export function mountReplyImages(root,context){
 for(const placeholder of root.querySelectorAll('span[data-reply-image]')){
  const source=placeholder.dataset.replyImage,alt=placeholder.dataset.imageAlt||'图片';
  const embedded=/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(source);
  const path=normalizeArtifactPath(source);
  const local=!/^[a-z][a-z0-9+.-]*:/i.test(path)||/^[a-z]:[\\/]/i.test(path);
  if((embedded||local&&/\.(?:png|jpe?g|webp|gif|avif)$/i.test(path))&&context){
   const button=imageThumbnail(embedded?source:path,context,{eager:true,zoom:true});button.type='button';button.classList.add('reply-image');
   button.setAttribute('aria-label','放大图片：'+alt);button.title=alt;button.querySelector('img').alt=alt;placeholder.replaceWith(button);
  }else if(/^https?:\/\//i.test(source)){
   const link=document.createElement('a');link.href=source;link.textContent=alt;link.target='_blank';link.rel='noopener noreferrer';placeholder.replaceWith(link);
  }else{placeholder.removeAttribute('data-reply-image');placeholder.textContent=alt+'（图片无法预览）';}
 }
}
