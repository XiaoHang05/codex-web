// Use canonical turns, including empty failed turns, rather than rendered items.
export function taskControlState({turns=[],activeTurn,ready=false,blocked=false,pending=false}={}){
 const latest=turns.at(-1);
 const resume=!activeTurn&&['interrupted','failed'].includes(latest?.status);
 return {action:resume?'continue':'interrupt',turnId:resume?(latest.turnId||latest.id):activeTurn,
  disabled:blocked||!ready||(!activeTurn&&!resume)||(resume&&pending)};
}

export function paintTaskControl(button,state){
 const resume=state.action==='continue',label=resume?'继续任务':'中断当前任务';
 if(button.dataset.action!==state.action){
  button.dataset.action=state.action;
  button.innerHTML=resume?'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
 }
 button.classList.toggle('danger-text',!resume);
 button.title=resume?'继续处理中断的任务':label;
 button.setAttribute('aria-label',label);button.disabled=state.disabled;
}
