import {desktopTurns} from './desktop-turn-state.js';
import {inlineQuestionRequest} from './inline-questions.js';
export function threadActivity(row,hasFeedback){
 const indicator=document.createElement('span');indicator.className='thread-activity';indicator.setAttribute('aria-hidden','true');
 if(row.running){const spinner=document.createElement('span');spinner.className='thread-spinner';indicator.append(spinner);}
 if(row.needsAttention||hasFeedback){const dot=document.createElement('span');dot.className='thread-feedback '+(row.needsAttention?'attention':'new-reply');indicator.append(dot);}
 indicator.hidden=!indicator.childElementCount;
 return indicator;
}

export function desktopActivity(state){
 const turns=desktopTurns(state);
 const running=turns.some(turn=>['inProgress','in_progress','running'].includes(turn.status?.type||turn.status));
 const needsAttention=(state?.requests||[]).some(request=>request.completed!==true&&request.request?.completed!==true)||!!inlineQuestionRequest(turns);
 const feedback=turns.flatMap(turn=>(turn.items||[]).filter(item=>item.type==='agentMessage').map(item=>`${item.id}:${String(item.text||'').length}`)).join('|');
 return {running,needsAttention,feedback};
}
