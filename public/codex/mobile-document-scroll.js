// Keep existing chat scroll consumers working while native document scrolling
// owns mobile gestures. The adapter is scoped to this one message element.
export function mountMobileDocumentScroll(){
  const query=new URLSearchParams(location.search);
  if(query.has('pane'))return;
  const preference=query.get('mobileScroll');
  let mode='document';
  try{
    if(['internal','document'].includes(preference))localStorage.setItem('codex-mobile-scroll',preference);
    mode=localStorage.getItem('codex-mobile-scroll')||mode;
  }catch{mode=preference||mode;}
  if(mode==='internal')return;
  const messages=document.getElementById('messages'),composer=document.querySelector('.composer-wrap'),header=document.querySelector('.mobile-topbar'),input=document.getElementById('input');
  if(!messages||!composer||!header)return;
  const root=document.documentElement,mobile=matchMedia('(max-width:760px)'),viewport=window.visualViewport;
  const nativeRect=messages.getBoundingClientRect.bind(messages),nativeScrollTo=messages.scrollTo.bind(messages);
  const descriptor=name=>{for(let node=messages;node;node=Object.getPrototypeOf(node)){const found=Object.getOwnPropertyDescriptor(node,name);if(found)return found;}};
  const nativeTop=descriptor('scrollTop'),nativeHeight=descriptor('clientHeight'),nativeScrollHeight=descriptor('scrollHeight');
  let active=false,loaded=false,frame=0,focusHeight=0,focusLayoutHeight=0,focusInnerHeight=0;
  const rootScroller=()=>document.scrollingElement||root;
  // Root clientHeight can retain the toolbar-visible height after browser UI
  // retracts. Use the live viewport; preserve layout height under the keyboard.
  const layoutHeight=()=>{
    const current=Math.max(innerHeight||root.clientHeight,(viewport?.scale||1)===1?(viewport?.height||0)+(viewport?.offsetTop||0):0);
    const visualKeyboard=document.activeElement===input&&focusHeight-(viewport?.height||innerHeight)>80&&Math.abs(innerHeight-focusInnerHeight)<2;
    return visualKeyboard?Math.max(current,focusLayoutHeight):current;
  };
  const maxScroll=()=>Math.max(0,rootScroller().scrollHeight-layoutHeight());
  const composerHeight=()=>composer.getBoundingClientRect().height;
  const headerHeight=()=>header.classList.contains('is-retracted')?0:header.offsetHeight;
  const bounds=()=>{
    const rect=nativeRect(),top=(viewport?.offsetTop||0)+headerHeight();
    const bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-composerHeight();
    return new DOMRect(rect.x,top,rect.width,Math.max(0,bottom-top));
  };
  Object.defineProperties(messages,{
    scrollTop:{configurable:true,get:()=>active?rootScroller().scrollTop:nativeTop.get.call(messages),set:value=>{if(active)rootScroller().scrollTop=value;else nativeTop.set.call(messages,value);}},
    clientHeight:{configurable:true,get:()=>active?bounds().height:nativeHeight.get.call(messages)},
    scrollHeight:{configurable:true,get:()=>active?maxScroll()+bounds().height:nativeScrollHeight.get.call(messages)},
  });
  messages.getBoundingClientRect=()=>active?bounds():nativeRect();
  messages.scrollTo=(options,y)=>{
    if(!active)return nativeScrollTo(options,y);
    if(typeof options==='number')window.scrollTo(options,y);else window.scrollTo({...options,left:0});
  };
  function layout(){
    if(!active)return;
    const css=root.style;
    const keyboard=document.activeElement===input&&focusHeight-(viewport?.height||innerHeight)>80;
    const offset=keyboard?Math.max(0,layoutHeight()-(viewport?.height||innerHeight)-(viewport?.offsetTop||0)):0;
    for(const [name,value]of [['--document-composer-height',composerHeight()],['--document-header-height',headerHeight()],['--document-keyboard-offset',offset]]){
      const text=`${value}px`;if(css.getPropertyValue(name)!==text)css.setProperty(name,text);
    }
  }
  const refresh=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{layout();if(active)messages.dispatchEvent(new Event('scroll'));});};
  function enable(){
    if(!loaded)return;
    const next=mobile.matches;
    if(next===active){refresh();return;}
    const top=messages.scrollTop,atBottom=messages.scrollHeight-top-messages.clientHeight<=2;
    if(next){
      root.classList.add('mobile-document-scroll');active=true;layout();
      rootScroller().scrollTop=atBottom?maxScroll():top;
    }else{
      active=false;root.classList.remove('mobile-document-scroll');rootScroller().scrollTop=0;
      nativeTop.set.call(messages,atBottom?nativeScrollHeight.get.call(messages):top);
    }
    messages.dispatchEvent(new Event('scroll'));
  }
  const focus=()=>{if(!focusHeight){focusLayoutHeight=layoutHeight();focusInnerHeight=innerHeight;focusHeight=viewport?.height||innerHeight;}};
  input?.addEventListener('pointerdown',focus,{passive:true});input?.addEventListener('focus',focus);
  input?.addEventListener('blur',()=>{focusHeight=0;focusLayoutHeight=0;focusInnerHeight=0;refresh();});
  // Native root scroll events do not fire on the old internal scroller.
  window.addEventListener('scroll',()=>{if(active){layout();messages.dispatchEvent(new Event('scroll'));}},{passive:true});
  window.addEventListener('resize',refresh);viewport?.addEventListener('resize',refresh);viewport?.addEventListener('scroll',refresh);
  mobile.addEventListener('change',enable);
  const observer=new ResizeObserver(refresh);observer.observe(composer);observer.observe(header);
  new MutationObserver(refresh).observe(header,{attributes:true,attributeFilter:['class']});
  const styles=document.createElement('link');styles.rel='stylesheet';styles.href='/codex/mobile-document-scroll.css';styles.onload=()=>{loaded=true;enable();};document.head.append(styles);
  return {active:()=>active};
}
