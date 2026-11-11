import {imageViewer} from './image-viewer.js';
import {normalizeArtifactPath} from './artifact-path.js';
import {api,browserState} from '/codex/common.js';import {marked,renderMath} from './math-markdown.js';import DOMPurify from '/codex/vendor/purify.js';
const panel=document.createElement('aside');panel.className='artifact-panel';panel.inert=true;panel.setAttribute('aria-label','文件预览');panel.innerHTML='<header><strong class="artifact-name">文件预览</strong><a class="artifact-download" hidden>下载</a><button type="button" class="icon-button artifact-expand" aria-label="全屏预览" title="全屏预览" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button><button class="icon-button artifact-close" aria-label="关闭预览">×</button></header><div class="artifact-content" aria-live="polite"></div>';
const scrim=document.createElement('button');scrim.className='artifact-scrim';scrim.setAttribute('aria-label','关闭文件预览');scrim.hidden=true;
const standalone=document.body.classList.contains('artifact-page');
const openFile=document.createElement('details');openFile.className='artifact-open';openFile.hidden=true;
const openLabel=document.createElement('summary');openLabel.className='artifact-download';openLabel.textContent='打开';
const openOptions=document.createElement('div');openOptions.className='artifact-open-options';
const openBrowser=document.createElement('a');openBrowser.textContent='浏览器打开';openBrowser.target='_blank';openBrowser.rel='noopener noreferrer';openBrowser.onclick=()=>{openFile.open=false;};
const openNative=document.createElement('button');openNative.type='button';openNative.textContent='默认程序打开';
const openError=document.createElement('p');openError.setAttribute('role','status');openError.hidden=true;
openOptions.append(openBrowser,openNative,openError);openFile.append(openLabel,openOptions);panel.querySelector('.artifact-download').before(openFile);
document.addEventListener('pointerdown',event=>{if(!openFile.contains(event.target))openFile.open=false;});
const viewer=imageViewer();
document.body.append(scrim,panel);let request=0,lastFocus;
const expand=panel.querySelector('.artifact-expand'),wide=matchMedia('(min-width:761px)');
function setExpanded(value){
  value=Boolean(value&&wide.matches);panel.classList.toggle('expanded',value);
  expand.setAttribute('aria-pressed',String(value));expand.title=value?'退出全屏预览 (Esc)':'全屏预览';expand.setAttribute('aria-label',value?'退出全屏预览':'全屏预览');
  expand.querySelector('path').setAttribute('d',value?'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5':'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');
}
expand.onclick=()=>setExpanded(!panel.classList.contains('expanded'));
wide.addEventListener('change',()=>{if(!wide.matches){setExpanded(false);if(document.activeElement===expand)panel.querySelector('.artifact-close').focus();}});
const close=()=>{if(standalone){window.close();return;}request++;setExpanded(false);panel.classList.remove('open');panel.inert=true;scrim.hidden=true;lastFocus?.focus();};
panel.querySelector('.artifact-close').onclick=close;scrim.onclick=close;document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('.image-zoom.open,.external-preview[open]')&&panel.classList.contains('open')){event.preventDefault();if(panel.classList.contains('expanded')){setExpanded(false);expand.focus();}else close();}});
export async function preview(path,context){
  const requestedPath=path;
  path=normalizeArtifactPath(path);
  openFile.hidden=true;openFile.open=false;openError.hidden=true;openBrowser.removeAttribute('href');openNative.onclick=null;
  const version=++request;lastFocus=document.activeElement;const content=panel.querySelector('.artifact-content'),download=panel.querySelector('.artifact-download');download.hidden=true;download.removeAttribute('href');content.classList.remove('artifact-empty');content.textContent='正在读取…';panel.querySelector('.artifact-name').textContent=String(path).split(/[\\/]/).at(-1);panel.classList.add('open');panel.inert=false;scrim.hidden=false;panel.querySelector('.artifact-close').focus();
  const scope=context.mode==='desktop'?'desktop':'web:'+context.profile;const url=`/codex-api/v1/artifacts/${encodeURIComponent(scope)}/${encodeURIComponent(context.threadId)}?path=${encodeURIComponent(path)}`;
  try{const result=await api(url);if(version!==request)return;content.replaceChildren();panel.querySelector('.artifact-name').textContent=result.name;download.href=url+'&download=1';download.download=result.name;download.setAttribute('aria-label','下载 '+result.name);download.hidden=false;
    if(standalone)document.title=result.name+' · Codex';
    else{
      const target=new URL('./file.html',import.meta.url);target.search=new URLSearchParams({source:context.mode,profile:context.profile||'',thread:context.threadId,path:requestedPath}).toString();
      openBrowser.href=result.open?.browser?url+'&open=1':target.href;
      openNative.hidden=!browserState.localAccess;openNative.disabled=!result.open?.native;openNative.title=result.open?.native?'用电脑的默认程序打开原文件':'此文件暂不能用默认程序打开';
      openNative.onclick=async()=>{if(openNative.disabled)return;openNative.disabled=true;openError.hidden=true;try{const ticket=await api(url.split('?')[0]+'/open',{path});if(version!==request)return;location.assign(ticket.url);openFile.open=false;}catch(error){if(version===request){openError.textContent=error.message;openError.hidden=false;}}finally{if(version===request)openNative.disabled=!result.open?.native;}};
      openFile.hidden=false;
    }
    if(result.kind==='image'){const button=document.createElement('button');button.className='preview-image';button.title='放大查看';button.setAttribute('aria-label','放大查看 '+result.name);const image=document.createElement('img');image.src=url+'&raw=1';image.alt=result.name;image.onerror=()=>{if(version!==request)return;content.classList.add('artifact-empty');content.textContent='浏览器无法预览此图片，可点击上方按钮下载查看。';};button.append(image);button.onclick=()=>viewer.open(image.src,result.name,button);content.append(button);}
    else if(result.kind==='pdf'){const frame=document.createElement('iframe');frame.title=result.name;frame.src=url+'&raw=1';frame.className='pdf-preview';content.append(frame);}
    else if(result.kind==='markdown'||result.kind==='html'){const article=document.createElement('article');article.className='document-preview';article.innerHTML=DOMPurify.sanitize(result.kind==='markdown'?marked.parse(result.text):result.html,{FORBID_TAGS:['script','style','iframe','form','input','button','object','embed'],FORBID_ATTR:['style']});if(result.kind==='markdown')renderMath(article);for(const image of article.querySelectorAll('img'))if(!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(image.getAttribute('src')||''))image.remove();for(const anchor of article.querySelectorAll('a')){anchor.target='_blank';anchor.rel='noopener noreferrer';if(anchor.dataset.artifactPath)anchor.onclick=event=>{event.preventDefault();preview(anchor.dataset.artifactPath,context);};}if(result.note){const note=document.createElement('p');note.className='muted';note.textContent=result.note;content.append(note);}content.append(article);}
    else if(result.kind==='text'){const pre=document.createElement('pre');pre.className='text-preview';pre.textContent=result.text;content.append(pre);}
    else{content.classList.add('artifact-empty');const note=document.createElement('p');note.textContent=result.note||'暂不支持预览此格式，可点击上方按钮下载查看。';content.append(note);}
  }catch(error){if(version===request){content.classList.add('artifact-empty');content.textContent=error.message;}}
}
export function previewButton(path,context,label='预览文件'){const button=document.createElement('button');button.className='artifact-link';button.textContent=label;button.title=path;button.onclick=event=>{event.stopPropagation();preview(path,context);};return button;}
export function imageThumbnail(path,context,{eager=false,zoom:directZoom=false}={}){const button=document.createElement('button');button.className='image-thumbnail';button.title='预览图像';button.setAttribute('aria-label','预览图像');const image=document.createElement('img');image.width=96;image.height=96;image.alt=directZoom?'附加图像':'查看的图像';image.loading='lazy';const scope=context.mode==='desktop'?'desktop':'web:'+context.profile;image.dataset.previewSrc=/^data:image\/(?:png|jpeg|webp|gif|avif);base64,/.test(path)?path:`/codex-api/v1/artifacts/${encodeURIComponent(scope)}/${encodeURIComponent(context.threadId)}?path=${encodeURIComponent(path)}&raw=1`;if(eager){image.src=image.dataset.previewSrc;delete image.dataset.previewSrc;}image.onerror=()=>{button.replaceChildren();const placeholder=document.createElement('span');placeholder.textContent='图像不可用';button.append(placeholder);button.disabled=true;};button.append(image);button.onclick=event=>{event.stopPropagation();viewer.open(image.currentSrc||image.src||image.dataset.previewSrc,image.alt,button);};return button;}
