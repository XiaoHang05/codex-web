import {openDownPopover,closeDownPopover} from './popover-motion.js';

export function mountDetailsMenu(details){
 const summary=details.querySelector(':scope>summary'),panel=details.querySelector(':scope>.menu-panel');
 let expanded=details.open;
 const open=()=>{expanded=true;details.open=true;summary.setAttribute('aria-expanded','true');openDownPopover(panel);};
 const close=(restoreFocus=false)=>{
  if(!expanded)return;
  expanded=false;summary.setAttribute('aria-expanded','false');
  closeDownPopover(panel,()=>{if(!expanded)details.open=false;});
  if(restoreFocus)summary.focus({preventScroll:true});
 };
 summary.setAttribute('aria-expanded',String(expanded));
 summary.addEventListener('click',event=>{event.preventDefault();expanded?close():open();});
 panel.addEventListener('click',event=>{if(event.target.closest('button:not(:disabled),a[href]'))close();});
 document.addEventListener('pointerdown',event=>{if(expanded&&!details.contains(event.target))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded){event.preventDefault();close(true);}});
 details.addEventListener('toggle',()=>{if(details.open&&!expanded&&panel.inert!==true)open();});
 return {open,close,isOpen:()=>expanded};
}
