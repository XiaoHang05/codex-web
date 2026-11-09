import {paintLoad} from './chat-load.js';

try{
 await import('./app.js');
}catch(error){
 paintLoad(document.getElementById('chat-load'),'页面加载失败 · '+error.message,{retry:()=>location.reload()});
 console.error(error);
}
