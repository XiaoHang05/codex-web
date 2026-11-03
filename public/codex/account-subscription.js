export function subscriptionDate(value){
 if(!value||!Number.isFinite(Date.parse(value)))return '未提供';
 const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const get=type=>parts.find(part=>part.type===type)?.value;
 return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
export function subscriptionUI({box,api,selection,isPlan,button,refreshAccount,notice=()=>{}}){
 let epoch=0,busy=false,lastResult;
 function paintButton(){if(!button)return;button.hidden=!isPlan(selection());button.disabled=busy;button.textContent=busy?'正在更新套餐日期…':'更新套餐日期';}
 const clear=()=>{epoch++;lastResult=undefined;box.replaceChildren();paintButton();};
 const row=(label,value)=>{const div=document.createElement('div');div.className='settings-stat';const name=document.createElement('span'),detail=document.createElement('strong');name.textContent=label;detail.textContent=value;div.append(name,detail);box.append(div);};
 const note=text=>{const p=document.createElement('p');p.className='muted';p.textContent=text;box.append(p);};
 async function refresh(id=selection()){
  const current=++epoch;if(id!==selection())return;paintButton();box.replaceChildren();if(!isPlan(id))return;
  box.textContent='正在读取套餐有效期…';
  try{const result=await api('/codex-api/v1/account-subscription/'+encodeURIComponent(id));if(current!==epoch||id!==selection())return;lastResult=result;box.replaceChildren();
   if(!result.available){note('当前登录信息未提供套餐有效期，可在 ChatGPT 订阅设置中查看。');return result;}
   row('套餐激活时间（北京时间）',subscriptionDate(result.activeStart));row('当前周期截止时间（北京时间）',subscriptionDate(result.activeUntil));
   row('订阅信息更新时间（北京时间）',subscriptionDate(result.lastChecked));
   note('来自当前账号的登录信息。激活时间指当前订阅周期；点击“更新套餐日期”可刷新登录信息。日期是否更新取决于 OpenAI 返回的记录，请留意订阅信息更新时间。');
   return result;
  }catch{if(current===epoch&&id===selection()){box.replaceChildren();note('暂时无法读取套餐有效期，请稍后刷新。');}}
 }
 async function update(){
  if(busy||!refreshAccount||!isPlan(selection()))return;
  const id=selection(),current=++epoch,previous=lastResult;busy=true;paintButton();
  try{
   await refreshAccount(id);if(current!==epoch||id!==selection())return;
   const result=await refresh(id);if(!result||id!==selection())return;
   if(!result.available)notice('已刷新登录信息，但 OpenAI 未提供套餐有效期。');
   else if(previous?.lastChecked===result.lastChecked&&previous?.activeUntil===result.activeUntil)notice('已刷新登录信息，OpenAI 返回的订阅记录未变化。');
   else notice('已重新读取套餐日期，请查看订阅信息更新时间。');
  }catch(error){if(current===epoch&&id===selection())notice('套餐日期更新失败：'+error.message);}
  finally{busy=false;paintButton();}
 }
 if(button){button.onclick=update;paintButton();}
 return {refresh,clear,update};
}
