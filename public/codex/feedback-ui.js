import {commandDialog} from './slash-commands.js';
import {animatedSelect} from './animated-select.js';

export async function feedbackDialog({api,selected,profile,rating,itemId,onSent}){
 if(!selected?.threadId)throw Error('请先打开需要反馈的会话');
 const target={profile,source:selected.mode,threadId:selected.threadId},form=document.createElement('form');form.className='command-form feedback-form';
 const description=document.createElement('p');description.className='muted';description.textContent='正在核对提交账号…';
 const category=document.createElement('select');category.id='feedback-category';category.setAttribute('aria-label','反馈类别');
 for(const [value,label]of [['good','好评'],['bad','差评'],['bug','功能问题'],['other','其他反馈']])category.add(new Option(label,value));category.value=rating==='like'?'good':rating==='dislike'?'bad':'bug';
 const text=document.createElement('textarea');text.placeholder='描述问题、复现步骤或评价。不填写密码、API Key 等敏感信息。';text.setAttribute('aria-label','反馈内容');text.maxLength=8000;text.required=true;text.rows=5;
 const choice=(label)=>{const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';row.className='feedback-choice';row.append(input,document.createTextNode(label));return {row,input};};
 const context=choice('附带当前网页会话上下文（可能包含消息、代码及路径）'),logs=choice('附带原生网页实例诊断日志（可能包含敏感信息）');
 const consent=choice('我确认将填写的内容、类别和会话标识发送给 OpenAI');
 const status=document.createElement('p');status.className='feedback-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const send=document.createElement('button');send.type='submit';send.textContent='提交给 OpenAI';send.disabled=true;
 form.append(description,category,text,context.row,logs.row,consent.row,status,send);const dialog=commandDialog('向 OpenAI 反馈',form);animatedSelect(category);
 let ready=false,attempted=false;const sync=()=>{send.disabled=!ready||attempted||!consent.input.checked||!text.value.trim();};form.addEventListener('input',sync);form.addEventListener('change',sync);
 try{const data=await api('/codex-api/v1/feedback?'+new URLSearchParams(target));if(!form.isConnected)return;description.textContent=`提交账号：${data.account} · 网页配置：${profile}\n会话：${data.name}\n`+(target.source==='desktop'?'此反馈通过网页账号提交，只包含填写的文字与会话标识；不附带桌面会话记录或日志。':'默认只发送填写的文字与会话标识；会话上下文和日志均需另行勾选。');context.row.hidden=!data.contextAvailable;logs.row.hidden=!data.logsAvailable;ready=true;sync();}catch(error){status.textContent=error.message;}
 form.onsubmit=async event=>{event.preventDefault();if(send.disabled)return;attempted=true;sync();send.textContent='正在提交…';status.textContent='正在等待 OpenAI 原生反馈接口返回；不会自动重试。';
  try{const result=await api('/codex-api/v1/feedback',{...target,itemId,classification:category.value,reason:text.value,includeContext:context.input.checked,includeLogs:logs.input.checked,confirmed:consent.input.checked,requestId:crypto.randomUUID()});status.textContent='已提交给 OpenAI · 反馈编号：'+result.reportId;send.textContent='已提交';onSent?.();for(const field of form.querySelectorAll('input,textarea,select'))field.disabled=true;}
  catch(error){status.textContent=error.message;send.textContent='本次提交已结束';}
 };return dialog;
}
