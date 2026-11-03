export let csrf='';
export const browserState={queueDatabase:'codex-web-composer-queue'};
function login(){location.href='/login?next='+encodeURIComponent(location.pathname+location.search+location.hash);}
export function notice(message){const box=document.getElementById('notice');if(!box)return;box.textContent=message;box.style.display='block';clearTimeout(box.timer);box.timer=setTimeout(()=>box.style.display='none',7000);}
export async function session(){const response=await fetch('/codex-api/v1/auth/status');if(!response.ok)throw Error('无法读取登录状态');const info=await response.json();if(!info.authenticated){login();throw Error('请登录');}csrf=info.csrf;return info;}
export async function api(url,body,method='POST'){
  if(!url.startsWith('/codex-api/v1/'))throw Error('请求超出 Codex Web 接口边界');
  const response=await fetch(url,body===undefined?{}:{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});
  if(response.status===401){login();throw Error('请重新登录');}
  const result=await response.json();if(!response.ok)throw Error(result.error||'请求失败');return result;
}
export function bind(id,callback){document.getElementById(id).onclick=async()=>{const button=document.getElementById(id);button.disabled=true;try{await callback();}catch(error){notice(error.message);}finally{button.disabled=false;}};}
export const $=id=>document.getElementById(id);
