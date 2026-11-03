// Only owner discovery and stream following. Never starts or controls a turn.
export class DesktopWatch {
  constructor(desktop,history,{clock=Date.now,limit=32,batch=4,idleMs=120000,retryMs=120000,journal=null}={}) {
    Object.assign(this,{desktop,history,clock,limit,batch,idleMs,retryMs});
    this.watched=new Map();this.attempts=new Map();this.busy=false;this.closed=false;
    this.journal=journal;this.lastSuccess=null;this.error=null;this.candidates=0;
    this.listener=({threadId})=>{const row=this.watched.get(threadId);if(row)row.activity=this.clock();};
    desktop.on('state',this.listener);
  }
  start(){if(this.timer||this.closed)return;this.timer=setInterval(()=>void this.poll(),5000);this.timer.unref();void this.poll();}
  active(id){
    const state=this.desktop.states.get(id);if(!state)return false; // The idle grace period allows the first snapshot.
    if((state.requests||[]).some(r=>r.completed!==true&&r.request?.completed!==true))return true;
    const turns=Object.values(state.turnHistory?.history?.entitiesByKey||{});
    if(!turns.length)turns.push(...(state.turns||[]));
    return turns.some(turn=>['inProgress','in_progress','running'].includes(turn.status?.type||turn.status));
  }
  async poll(){
    if(this.busy||this.closed)return;this.busy=true;
    try{
      const now=this.clock(),rows=this.history.list(),ids=new Set(rows.map(row=>row.threadId));this.candidates=rows.length;try{this.journal?.poll(rows);}catch{this.journal.error='桌面日志游标暂时无法保存';}
      for(const [id,row]of this.watched){
        if(!this.desktop.owners.has(id)){this.watched.delete(id);this.attempts.delete(id);continue;}
        if(this.desktop.manualFollow?.has(id)||!ids.has(id)||now-row.activity>this.idleMs&&!this.active(id)){
          this.desktop.unfollowBackground(id);this.watched.delete(id);
          const attempt=this.attempts.get(id);if(attempt)attempt.at=now;
        }
      }
      for(const id of this.attempts.keys())if(!ids.has(id))this.attempts.delete(id);
      const due=rows.filter(row=>!this.watched.has(row.threadId)&&!this.desktop.manualFollow?.has(row.threadId)&&
        (!this.attempts.has(row.threadId)||this.attempts.get(row.threadId).mtime!==row.updatedAt||now-this.attempts.get(row.threadId).at>=this.retryMs));
      // Oldest attempts first prevents busy recent chats starving other loaded chats.
      due.sort((a,b)=>(this.attempts.get(a.threadId)?.at??-1)-(this.attempts.get(b.threadId)?.at??-1)||b.updatedAt-a.updatedAt);
      const chosen=due.slice(0,Math.max(0,Math.min(this.batch,this.limit-this.watched.size)));
      const results=await Promise.allSettled(chosen.map(async row=>{
        const id=row.threadId;this.attempts.set(id,{mtime:row.updatedAt,at:now});
        await this.desktop.follow(id,{background:true});
        if(this.closed){this.desktop.unfollowBackground(id);return;}
        this.watched.set(id,{activity:this.clock()});
      }));
      this.error=results.some(result=>result.status==='rejected')?'部分桌面聊天没有在线持有者，继续只读发现':null;
      this.lastSuccess=this.clock();
    }catch{this.error='桌面后台观察暂时离线，将重试只读发现';}
    finally{this.busy=false;}
  }
  status(){return {running:!!this.timer,watching:this.watched.size,candidates:this.candidates,limit:this.limit,lastSuccess:this.lastSuccess,error:this.error,journal:this.journal?.status()};}
  close(){this.closed=true;clearInterval(this.timer);this.timer=null;this.desktop.off('state',this.listener);for(const id of this.watched.keys())this.desktop.unfollowBackground(id);this.watched.clear();}
}
