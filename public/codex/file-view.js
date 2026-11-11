import {session} from './common.js';
import {preview} from './artifact-ui.js';

const status=document.getElementById('file-status');
try{
 await session();
 const query=new URLSearchParams(location.search),mode=query.get('source'),profile=query.get('profile'),threadId=query.get('thread'),path=query.get('path');
 if(!['web','desktop'].includes(mode)||!/^[-a-zA-Z0-9_]{1,80}$/.test(threadId||'')||mode==='web'&&!/^[-a-zA-Z0-9_]{1,80}$/.test(profile||'')||!path||path.length>2048)throw Error('文件链接无效，请从聊天中重新打开。');
 status.hidden=true;
 await preview(path,{mode,profile,threadId});
}catch(error){status.textContent=error.message;}
