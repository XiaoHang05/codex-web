import {userContent} from './user-content.js';

export function lastMessageEdit(turns=[]){
 const turn=turns.at(-1),turnId=turn?.turnId||turn?.id;
 if(!turnId)return {editable:false,reason:'没有可修改的消息'};
 const users=(turn.items||[]).filter(item=>['userMessage','steeringUserMessage','steered'].includes(item.type));
 if(users.length!==1||users[0].type!=='userMessage'||users[0]._steering||users[0]._questionReply)return {editable:false,reason:'只能修改最后一轮的原始用户消息'};
 const item=users[0],input=turn.params?.input||item.content||[{type:'text',text:item.text||''}];
 const raw=input.map(part=>part.text||part.inputText||'').filter(Boolean).join('\n');
 const parsed=userContent(raw,{content:input});
 if(!['completed','interrupted','failed'].includes(turn.status?.type||turn.status))return {editable:false,turnId,reason:'请等待当前任务结束'};
 return {editable:true,turnId,itemId:item.id,text:parsed.text,attachmentCount:input.filter(part=>part.type!=='text').length};
}

export function replaceMessageText(input,message){
 let replaced=false;
 const result=input.map(part=>{
  if(part.type!=='text')return part;
  const visible=userContent(part.text||'').text;
  if(!visible)return part;
  const at=part.text.lastIndexOf(visible);
  if(at<0)throw Error('原始消息文本无法安全定位');
  const text=part.text.slice(0,at)+(replaced?'':message)+part.text.slice(at+visible.length);
  replaced=true;return {...part,text,text_elements:[]};
 });
 if(!replaced)result.push({type:'text',text:message,text_elements:[]});
 return result;
}
