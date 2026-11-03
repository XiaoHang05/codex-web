import {fault} from './storage.js';
import {unifiedSessions} from './preferences.js';

export async function listInteractiveThreads(codex, instance) {
  const threads = new Map(), cursors = new Set(); let cursor;
  for (let page=0; page<100; page++) {
    const result = await codex.call(instance, 'thread/list', {limit:100,sortKey:'updated_at',sortDirection:'desc',modelProviders:[],sourceKinds:['appServer','cli','vscode'],...(cursor?{cursor}:{})});
    if (!Array.isArray(result.data)) throw fault('Codex 历史返回格式无效',502);
    for (const thread of result.data) if (!threads.has(thread.id)) threads.set(thread.id,thread);
    cursor=result.nextCursor;
    if (!cursor) return [...threads.values()];
    if (typeof cursor!=='string'||cursors.has(cursor)) throw fault('Codex 历史分页游标重复',502);
    cursors.add(cursor);
  }
  throw fault('历史超过当前一次读取上限',413);
}
export async function historyList(ctx) {
  const {codex,config} = ctx;
  const rows = ctx.desktopAdapter ? await ctx.desktopAdapter.list(ctx) : [];
  for (const profile of config.profiles) {
    const instance=codex.instances.get(profile.id),identity=codex.profileIdentity(profile.id),index=codex.profileHistory(profile.id);
    if(instance?.ready){
      const threads=await listInteractiveThreads(codex,instance),seen=new Set(threads.map(thread=>thread.id));
      for(const id of instance.unmaterialized||[]){const thread=instance.threadMetadata?.get(id);if(thread&&!seen.has(id))threads.push(thread);}
      index.capture(threads,identity,{complete:true});
    }
    for(const row of index.rows()) rows.push({...row,source:`web:${profile.id}`,verifiedPrincipal:row.principal,offline:!instance?.ready,accountMismatch:!!row.principal&&row.principal!==identity,liveOwner:instance?.ready&&instance.loaded.has(row.threadId)?`web:${profile.id}`:null,running:!!instance?.active.has(row.threadId),needsAttention:[...instance?.approvals.values()||[]].some(request=>request.params?.threadId===row.threadId)});
  }
  return unifiedSessions(rows);
}
export async function codexRoute(req,res,ctx) {
  const {method,params={}}=req.body||{};
  if (!params || typeof params!=='object' || Array.isArray(params)) throw fault('无效请求参数');
  if (ctx.history.list().some(thread=>thread.threadId===params.threadId)) throw fault('桌面会话必须通过桌面连接操作',409);
  res.json(await ctx.codex.rpc(req.params.id,method,params));
}
