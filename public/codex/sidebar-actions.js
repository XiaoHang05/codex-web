const icons={
  folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1M3 9h18l-3 11H2L3 9Z"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  compose:'<path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6M14 5l5 5M10 14l-1 4 4-1 9-9a2.1 2.1 0 0 0-3-3l-9 9Z"/>',
  archive:'<rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M5 8v10a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8M10 12h4"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1"/><path d="M3 5 1 8m20-3 2 3"/>',
  bellOff:'<path d="m3 3 18 18M10.6 2.2A6 6 0 0 1 18 8c0 1.9.2 3.3.6 4.4M6 6c-.1.6 0 1.3 0 2 0 7-3 7-3 9h14M10 21h4"/>'
};

export function sidebarIcon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+icons[name]+'</svg>';}

export function sidebarActionButton({label,icon,action,notice=()=>{},disabled=false,pressed,lock=true}){
  const button=document.createElement('button');button.type='button';button.className='sidebar-row-action';
  button.setAttribute('aria-label',label);button.title=label;button.disabled=disabled;button.innerHTML=sidebarIcon(icon);
  if(pressed!==undefined)button.setAttribute('aria-pressed',String(pressed));
  button.addEventListener('pointerdown',event=>event.stopPropagation());
  button.addEventListener('keydown',event=>event.stopPropagation());
  button.onclick=async event=>{
    event.preventDefault();event.stopPropagation();if(button.disabled)return;
    if(lock){button.disabled=true;button.setAttribute('aria-busy','true');}
    try{await action(button);}catch(error){notice(error.message);}
    finally{if(lock){button.disabled=disabled;button.removeAttribute('aria-busy');}}
  };
  return button;
}
