// App inline questions live on agent messages, separately from server requests.
const messageText=item=>(Array.isArray(item.content||item.input)?(item.content||item.input).filter(part=>['text','input_text'].includes(part.type)).map(part=>part.text||'').join('\n'):'')||item.text||'';
export function inlineQuestionRequest(turns,threadId){
 const history=turns||[],status=turn=>turn.status?.type||turn.status;
 const active=history.filter(turn=>['inProgress','in_progress','running'].includes(status(turn)));
 if(active.length>1)return null;
 const latest=history.at(-1),turn=active[0]||latest,turnId=turn?.turnId||turn?.id;
 if(typeof turnId!=='string'||!['inProgress','in_progress','running','completed'].includes(status(turn)))return null;
 const answered=new Set();
 for(const item of history.flatMap(turn=>turn.items||[])){
  if(item.type!=='userMessage'&&(item.type!=='steeringUserMessage'||item.status!=='accepted'))continue;
  const text=messageText(item);
  const start=text.indexOf('<send_user_message_question_reply>'),end=text.lastIndexOf('</send_user_message_question_reply>');
  if(start<0||end<start)continue;
  try{const replies=JSON.parse(text.slice(start+34,end).trim());for(const reply of Array.isArray(replies)?replies:[replies])if(typeof reply?.questionItemId==='string')answered.add(reply.questionItemId);}catch{}
 }
 const questions=[];
 // App questions survive a final response. Their replies may be in a later
 // turn, so resolve IDs across the conversation before collecting pending ones.
 for(const item of history.filter(turn=>['inProgress','in_progress','running','completed'].includes(status(turn))).flatMap(turn=>turn.items||[])){
  // A new ordinary user message supersedes older prompts. Keep remaining
  // questions when the new message is a structured answer to just some of them.
  if(item.type==='userMessage'&&!messageText(item).includes('<send_user_message_question_reply>'))questions.length=0;
  if(item.type!=='agentMessage'||typeof item.id!=='string'||!Array.isArray(item.questions))continue;
  for(const [index,question]of item.questions.entries()){
   const id=JSON.stringify(['request_user_input_async',item.id,index]);
   if(answered.has(id)||typeof question?.title!=='string'||!question.title.trim())continue;
   questions.push({id,question:question.title,options:(Array.isArray(question.options)?question.options:[]).filter(option=>typeof option==='string').map(label=>({label,description:''}))});
  }
 }
 return questions.length?{id:'inline:'+turnId,inline:true,method:'app/requestUserInputAsync',params:{threadId,turnId,...(!active.length?{idle:true}:{}),questions}}:null;
}

export function inlineQuestionReply(request,body){
 if(!request||body?.turnId!==request.params.turnId)throw Error('问题已过期，请刷新聊天');
 const answers=body.answers;
 if(!answers||typeof answers!=='object'||Array.isArray(answers))throw Error('回答格式不正确');
 const questions=request.params.questions;
 if(Object.keys(answers).length!==questions.length)throw Error('问题已变化，请刷新后回答');
 const replies=questions.map(question=>{
  const values=Object.hasOwn(answers,question.id)?answers[question.id]?.answers:null;
  if(!Array.isArray(values)||values.length!==1||typeof values[0]!=='string'||!values[0].trim()||values[0].length>4000)throw Error('请回答每个问题，单个回答不超过 4000 字');
  return {questionItemId:question.id,question:question.question,answer:values[0].trim()};
 });
 return '<send_user_message_question_reply>\n'+JSON.stringify(replies).replace(/</g,'\\u003c')+'\n</send_user_message_question_reply>';
}
