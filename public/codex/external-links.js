// Only user-clicked public web links enter this viewer. Local artifacts keep their own handlers.
export function externalLinkURL(value,base=location.href){
  try{const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.origin!==new URL(base).origin?url:null;}catch{return null;}
}
export function mountExternalLinkPreviews(root=document){
  const styles=document.createElement('link');styles.rel='stylesheet';styles.href='/codex/external-links.css';document.head.append(styles);
  let dialog=null;
  function show(url,label,anchor){
    dialog?.close();
    const node=document.createElement('dialog');node.className='external-preview';node.setAttribute('aria-label','网页预览');
    const header=document.createElement('header'),title=document.createElement('strong'),open=document.createElement('a'),close=document.createElement('button');
    title.textContent=label.trim()||url.hostname;title.title=url.href;
    open.textContent='用浏览器打开';open.href=url.href;open.target='_blank';open.rel='noopener noreferrer';open.dataset.externalBrowser='true';
    close.type='button';close.textContent='×';close.className='icon-button';close.setAttribute('aria-label','关闭网页预览');
    header.append(title,open,close);
    const address=document.createElement('div');address.className='external-address';address.textContent=url.href;
    const note=document.createElement('p');note.className='external-note';note.textContent='如网页空白、拒绝连接或需要登录，请点“用浏览器打开”。';note.setAttribute('role','status');
    node.append(header,address,note);
    if(url.protocol==='http:'&&location.protocol==='https:')note.textContent='此网页使用 HTTP，请点“用浏览器打开”。';
    else{
      const frame=document.createElement('iframe');frame.title='网页预览：'+(label||url.hostname);frame.referrerPolicy='no-referrer';
      frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
      frame.src=url.href;node.append(frame);
    }
    const leave=()=>node.close();close.onclick=leave;node.addEventListener('click',event=>{if(event.target===node){const rect=node.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)leave();}});
    node.addEventListener('close',()=>{node.remove();if(dialog===node)dialog=null;if(anchor.isConnected)anchor.focus();},{once:true});
    document.body.append(node);dialog=node;node.showModal();close.focus();
  }
  root.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
    if(!anchor||anchor.dataset.externalBrowser||anchor.hasAttribute('download')||anchor.dataset.artifactPath||!anchor.closest('#messages,.artifact-content'))return;
    const url=externalLinkURL(anchor.getAttribute('href'));if(!url)return;
    event.preventDefault();show(url,anchor.textContent||'',anchor);
  });
}