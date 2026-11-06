export function predictionTurn(items,busy=false){
 if(busy||!items.length)return null;
 const latest=items.at(-1)?._turnId;
 const reply=items.findLast(item=>item.type==='agentMessage'&&item._replyComplete&&item._turnStatus==='completed'&&item._turnId===latest);
 return reply?._turnId||null;
}

export function composerPredictions({input,settings,request,blocked=()=>false,storage=localStorage,timeoutMs=20000}){
 const styles=document.createElement('link');styles.rel='stylesheet';styles.href='/codex/composer-predictions.css';document.head.append(styles);
 const placeholder=input.placeholder,bar=document.createElement('div'),status=document.createElement('span'),accept=document.createElement('button');
 bar.className='composer-predictions';bar.hidden=true;status.id='composer-prediction-status';status.setAttribute('role','status');
 accept.type='button';accept.className='composer-prediction-accept';accept.textContent='采用预测';accept.title='Tab 采用为草稿，不会发送';accept.hidden=true;bar.append(status,accept);input.after(bar);
 const label=document.createElement('label'),toggle=document.createElement('input'),description=document.createElement('p');
 toggle.type='checkbox';try{toggle.checked=storage.getItem('codex-composer-predictions')==='on';}catch{toggle.checked=false;}
 label.className='composer-prediction-setting';label.append(toggle,document.createTextNode('显示输入预测（仅官方原生）'));
 description.className='muted';description.textContent='预测只填入草稿，需自行发送。桌面 App 的预测服务暂未开放给网页；网页实例由原生引擎与账号决定是否支持。不会调用替代模型。此开关保存在当前浏览器。';settings.append(label,description);
 let target=null,scope='',epoch=0,scopeEpoch=0,turn=null,attempted=null,suggestion='',reason='',composing=false,dismissed=false,timer=null,disabledSource=false,lastItems=[],lastBusy=true;
 const clearTimer=()=>{clearTimeout(timer);timer=null;};
 function draw(){
  const show=toggle.checked&&target&&!input.disabled&&!input.value&&!composing&&!blocked();
  const visible=show&&!dismissed&&!!suggestion;
  input.placeholder=visible?suggestion:placeholder;accept.hidden=!visible;
  bar.hidden=!show||!reason&&!visible;status.textContent=visible?'输入预测 · Tab 采用':reason;
  if(visible)input.setAttribute('aria-description','输入预测：'+suggestion+'。按 Tab 填入草稿，不会自动发送。');else input.removeAttribute('aria-description');
 }
 function cancel(){epoch++;scopeEpoch++;clearTimer();suggestion='';reason='';turn=null;attempted=null;dismissed=false;disabledSource=false;}
 function apply(result){reason=result.reason||'';disabledSource=result.status==='unavailable';draw();}
 function acceptDraft(){if(!suggestion||dismissed||input.value||input.disabled||composing||blocked())return;const text=suggestion;suggestion='';dismissed=true;reason='';clearTimer();input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus({preventScroll:true});input.setSelectionRange(text.length,text.length);draw();}
 accept.addEventListener('pointerdown',event=>event.preventDefault());accept.onclick=acceptDraft;
 input.addEventListener('input',()=>{if(input.value){suggestion='';dismissed=true;clearTimer();}draw();});
 input.addEventListener('compositionstart',()=>{composing=true;draw();});input.addEventListener('compositionend',()=>{composing=false;draw();});
 new MutationObserver(draw).observe(input,{attributes:true,attributeFilter:['disabled']});
 input.addEventListener('keydown',event=>{
  if(event.isComposing||composing||event.keyCode===229)return;
  if(event.key==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&suggestion&&!dismissed&&!input.value&&!input.disabled&&!blocked()){
   event.preventDefault();event.stopImmediatePropagation();acceptDraft();
  }else if(event.key==='Escape'&&suggestion){suggestion='';dismissed=true;reason='';draw();}
 },true);
 toggle.onchange=()=>{try{storage.setItem('codex-composer-predictions',toggle.checked?'on':'off');}catch{}const previous=target;cancel();scope='';target=null;update(previous,lastItems,lastBusy);};
 function update(next,items,busy){
  lastItems=items;lastBusy=busy;
  const key=next?JSON.stringify([next.source,next.profile,next.threadId]):'';
  const changed=key!==scope;
  if(key!==scope){cancel();scope=key;target=next;
  }
  const latest=predictionTurn(items,busy);
  if(latest!==turn){epoch++;clearTimer();turn=latest;suggestion='';reason=disabledSource?reason:'';dismissed=false;}
  if(changed&&next&&toggle.checked){const version=scopeEpoch;void request('/codex-api/v1/composer-predictions?'+new URLSearchParams(next)).then(result=>{if(version===scopeEpoch&&attempted===null)apply(result);}).catch(()=>{if(version===scopeEpoch&&attempted===null){reason='原生输入预测状态暂不可用';draw();}});}
  if(toggle.checked&&target?.source==='web'&&latest&&!disabledSource&&attempted!==latest&&!input.disabled&&!input.value&&!blocked()){
   attempted=latest;const version=epoch;const captured={...target,sourceTurnId:latest};
   void request('/codex-api/v1/composer-predictions',captured).then(result=>{
    if(version!==epoch||input.value||dismissed||!toggle.checked)return;
    apply(result);
    if(result.status==='pending'&&!suggestion){reason='正在等待原生输入预测…';draw();timer=setTimeout(()=>{if(version===epoch&&!suggestion){reason='本轮未返回原生输入预测';draw();}},timeoutMs);}
   }).catch(()=>{if(version===epoch){reason='原生输入预测暂不可用';draw();}});
  }
  draw();
 }
 function notification(params){
  if(!toggle.checked||!target||target.source!=='web'||params.threadId!==target.threadId||params.sourceTurnId!==turn||attempted!==turn||dismissed||input.value)return;
  clearTimer();const text=params.result?.text;
  suggestion=params.result?.type==='completed'&&typeof text==='string'&&text.trim()&&text.length<=4000?text:'';reason='';draw();
 }
 return {update,notification,refresh:draw,clear:()=>{cancel();target=null;scope='';draw();}};
}
