import {approvalSummary} from '../../src/notification-format.js';
export class DesktopNotifications {
  constructor(notifications) { this.notifications=notifications;this.seen=new Map(); }
  observe({threadId,state}) {
    if(!state)return;
    this.requestSeen ||= new Map();
    const requestIds=this.requestSeen.get(threadId)||new Set();
    const previous=this.seen.get(threadId), statuses=new Map();
    const turns=Object.values(state.turnHistory?.history?.entitiesByKey || {});
    if(!turns.length)turns.push(...(state.turns||[]));
    const items=turns.flatMap(turn=>turn.items||[]);
    const link=`/codex/?source=desktop&thread=${encodeURIComponent(threadId)}`;
    for(const request of (state.requests||[]).slice(-512)) {
      if(request.completed===true||request.request?.completed===true)continue;
      const data=request.params || request.request?.params || request;
      const method=request.method || request.request?.method || '';
      const id=request.id ?? request.requestId;if(id===undefined)continue;
      const key=String(id);if(requestIds.has(key))continue;requestIds.add(key);
      if(requestIds.size>512)requestIds.delete(requestIds.values().next().value);
      const item=items.find(x=>x.id===data.itemId);
      this.notifications.enqueue({source:'codex',cwd:state.cwd,threadName:state.title||state.fallbackSearchTitle,id:`desktop:${threadId}:request:${id}`,kind:method.includes('requestUserInput')?'question':'approval',summary:approvalSummary(data,method,item),path:link});
    }
    for(const turn of turns) {
      const id=turn.turnId || turn.id; const status=turn.status?.type || turn.status;statuses.set(id,status);
      if(!previous || previous.get(id)===status || !['completed','failed'].includes(status))continue;
      this.notifications.enqueue({source:'codex',cwd:state.cwd,threadName:state.title||state.fallbackSearchTitle,id:`desktop:${threadId}:turn:${id}:${status}`,kind:status==='completed'?'completed':'failed',summary:status==='completed'?(turn.items||[]).filter(i=>i.type==='agentMessage').at(-1)?.text || '任务已完成，打开会话查看回复':turn.error?.message || '任务执行失败，打开会话查看详情',path:link});
    }
    this.seen.delete(threadId);this.seen.set(threadId,statuses);
    this.requestSeen.delete(threadId);this.requestSeen.set(threadId,requestIds);
    while(this.seen.size>256){const oldest=this.seen.keys().next().value;this.seen.delete(oldest);this.requestSeen.delete(oldest);}
  }
}
