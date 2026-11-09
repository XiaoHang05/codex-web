export function paintLoad(element,text,{busy=false,retry}={}){
 element.querySelector('[data-load-text]').textContent=text;
 element.dataset.loading=String(busy);
 element.hidden=!text;
 const button=element.querySelector('button');
 if(button){button.hidden=!retry;button.onclick=retry||null;}
}

export function waitForLive(events,ready,signal,message){
 if(ready())return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const stop=()=>{
   clearTimeout(timer);
   events.removeEventListener('change',check);
   signal.removeEventListener('abort',abort);
  };
  const abort=()=>{stop();reject(signal.reason);};
  const check=()=>{if(ready()){stop();resolve();}};
  const timer=setTimeout(()=>{stop();reject(Error(message));},15000);
  events.addEventListener('change',check);
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
 });
}
