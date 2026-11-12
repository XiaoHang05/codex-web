import {commandDialog} from './slash-commands.js';

export async function editMessageDialog({api,scope,turnId,isCurrent=()=>true,onBusy=()=>{},onEdited=async()=>{}}){
 const preview=await api('/codex-api/v1/message-edit?scope='+encodeURIComponent(scope));
 if(!isCurrent()||preview.turnId!==turnId)throw Error('消息已变化，请重新打开修改');
 const form=document.createElement('form');form.className='message-edit-form command-form';
 const label=document.createElement('label');label.textContent='修改消息';
 const text=document.createElement('textarea');text.value=preview.text;text.maxLength=200000;text.setAttribute('aria-label','修改最后一条消息');label.append(text);
 const hint=document.createElement('p');hint.className='muted';hint.textContent=(preview.running?'确认后将先停止当前生成，再替换消息并重新生成。':'确认后将替换本轮回答并重新生成。')+(preview.attachmentCount?'原附件会保留。':'')+'此前执行的文件修改等操作不会撤销。';
 const error=document.createElement('p');error.className='message-edit-error';error.setAttribute('role','alert');
 const actions=document.createElement('div');actions.className='message-edit-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
 const save=document.createElement('button');save.type='submit';save.textContent=preview.running?'停止并重新生成':'保存并重新生成';
 let busy=false,submitted=false;
 const paint=()=>{save.disabled=busy||submitted||!text.value.trim()||text.value===preview.text;};
 form.append(label,hint,error,actions);actions.append(cancel,save);
 const dialog=commandDialog('修改最后一条消息',form,{canClose:()=>!busy});cancel.onclick=dialog.leave;
 text.oninput=paint;paint();text.focus();text.setSelectionRange(text.value.length,text.value.length);
 form.onsubmit=async event=>{
  event.preventDefault();if(save.disabled)return;
  if(!isCurrent()){error.textContent='会话状态已变化，请取消后重新修改';return;}
  busy=true;submitted=true;onBusy(true);paint();cancel.disabled=true;error.textContent='';
  try{
   const result=await api('/codex-api/v1/message-edit',{scope,turnId,revision:preview.revision,requestId:crypto.randomUUID(),message:text.value,...(preview.running?{interruptRunning:true}:{})});
   busy=false;dialog.leave();await onEdited(result);
  }catch(failure){error.textContent=failure.message+'。草稿已保留；请先核对聊天记录，再重新打开修改。';}
  finally{busy=false;onBusy(false);cancel.disabled=false;paint();}
 };
 return dialog;
}
