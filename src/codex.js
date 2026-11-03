import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { outboundProxyEnv } from './outbound-proxy.js';
import { dataRoot, projectRoot, packageRoot, safeId, fault, readJson, writeJson } from './storage.js';
import { nativePolicy } from './preferences.js';
import { approvalSummary, excerpt } from './notification-format.js';
import {validatePermissions,validateElicitation} from '../public/codex/request-protocol.js';
import {ProfileHistory} from './profile-history.js';
import {principal} from './account.js';
import {createHash} from 'node:crypto';
import {listInteractiveThreads} from './history-list.js';
import {normalizeProjectDirectory} from '../public/codex/project-path.js';
import {recordStreamReply,streamReplySnapshot} from './stream-replies.js?v=retry-cleanup-1';
import {chatgptHttpParams,chatgptHttpProvider,ensureChatgptHttp} from './codex-transport.js?v=http-transport-2';

export function findCodex(config) {
  const selected = config.codexBinary || process.env.CODEX_WEB_CODEX_BIN;
  if (selected) {
    if (!path.isAbsolute(selected) || !fs.existsSync(selected) || !fs.statSync(selected).isFile()) throw fault('Codex 引擎路径不存在或不是完整文件路径',503);
    return selected;
  }
  // The desktop installation is an explicit compatibility option.
  if (config.discoverDesktopBinary === true) {
  const desktopRoot = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (fs.existsSync(desktopRoot)) {
    const candidates = fs.readdirSync(desktopRoot).map(name => path.join(desktopRoot, name, 'codex.exe')).filter(file => fs.existsSync(file));
    candidates.sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (candidates.length) return candidates[0];
  }
  }
  // PATH discovery accepts executable files, never a shell command or .cmd shim.
  const names = process.platform==='win32' ? ['codex.exe'] : ['codex'];
  for (const directory of (process.env.PATH||'').split(path.delimiter).filter(Boolean)) for(const name of names) {
    const file=path.join(directory,name); if(fs.existsSync(file)&&fs.statSync(file).isFile()) return file;
  }
  throw fault('请安装 Codex 引擎并配置 CODEX_WEB_CODEX_BIN', 503);
}
export class CodexManager {
  constructor(config, emit, notifications, preferences) { this.config = config; this.emit = emit; this.notifications = notifications; this.preferences = preferences; this.instances = new Map(); }
  profile(id) { const p = this.config.profiles.find(p => p.id === safeId(id)); if (!p) throw fault('找不到账号配置', 404); return p; }
  home(id) { return path.join(dataRoot, 'codex', safeId(id)); }
  profileHistory(id){this.historyIndexes??=new Map();if(!this.historyIndexes.has(id))this.historyIndexes.set(id,new (this.ProfileHistoryClass||ProfileHistory)(this.home(id)));return this.historyIndexes.get(id);}
  profileIdentity(id){const profile=this.profile(id);if(profile.provider==='chatgpt')return principal(this.home(id));const key=readJson(path.join(this.home(id),'provider-secret.json'),{}).apiKey;return key?'api:'+createHash('sha256').update(profile.provider+'\0'+(profile.baseUrl||'https://api.openai.com/v1')+'\0'+key).digest('hex').slice(0,24):null;}
  async start(id) {
    if(this.lifecycleBusy?.has(id))throw fault('此实例正在停止或重启，请稍后重试',409);
    if(this.instances.get(id)?.sandboxSetupPending)throw fault('Windows 沙箱仍在初始化，请完成或取消系统设置窗口',409);
    return this.startUnchecked(id);
  }
  async startUnchecked(id) {
    if(this.profileMutationBusy)throw fault('正在修改账号配置，请稍后重试',409);
    const profile = this.profile(id);
    const existing = this.instances.get(id);
    if (existing?.ready) return existing;
    if (existing?.starting) return existing.starting;
    const instance = { id, profile, requests: new Map(), approvals: new Map(), active: new Map(), loaded: new Set(), logs: [], sequence: 1, ready: false, startedAt: new Date().toISOString() };
    this.instances.set(id, instance);
    instance.starting = this.launch(instance);
    try { await instance.starting; return instance; } catch (e) { instance.process?.kill(); this.instances.delete(id); throw e; } finally { delete instance.starting; }
  }
  async launch(i) {
    const p = i.profile, home = this.home(i.id); fs.mkdirSync(home, { recursive: true });
    const native = findCodex(this.config);
    const prefix = this.config.codexArguments || [];
    if(!Array.isArray(prefix)||prefix.some(value=>typeof value!=='string'))throw fault('Invalid Codex executable arguments');
    const args = [...prefix, 'app-server', '--listen', 'stdio://', '-c', 'cli_auth_credentials_store="file"'];
    if (p.provider === 'custom') {
      if (!p.baseUrl || !p.model) throw fault('自定义服务需要地址和模型');
      args.push('-c', 'model_provider="web_custom"', '-c', `model_providers.web_custom.name=${JSON.stringify(p.name)}`, '-c', `model_providers.web_custom.base_url=${JSON.stringify(p.baseUrl)}`, '-c', 'model_providers.web_custom.env_key="CODEX_WEB_PROVIDER_KEY"', '-c', 'model_providers.web_custom.wire_api="responses"', '-c', 'model_providers.web_custom.requires_openai_auth=false');
    }
    if (p.model) args.push('-c', `model=${JSON.stringify(p.model)}`);
    const secret = readJson(path.join(home, 'provider-secret.json'), {});
    const env = { ...outboundProxyEnv(), CODEX_HOME: home, CODEX_WEB_PROVIDER_KEY: secret.apiKey || '' };
    for (const key of ['OPENAI_API_KEY', 'CODEX_ACCESS_TOKEN', 'CODEX_API_KEY']) delete env[key];
    const proc = spawn(native, args, { cwd: p.cwd || projectRoot, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    i.process = proc;
    proc.once('error', e => this.finish(i, e.message));
    proc.once('exit', () => this.finish(i, 'Codex 实例已停止'));
    const lines = readline.createInterface({ input: proc.stdout });
    lines.on('line', line => { try { this.receive(i, JSON.parse(line)); } catch { /* Non-protocol stdout is never relayed. */ } });
    proc.stderr.on('data', chunk => { i.logs.push(String(chunk).replace(/(?:sk-[\w-]+|Bearer\s+[\w.-]+)/g, '[redacted]').slice(0, 2000)); if (i.logs.length > 80) i.logs.shift(); });
    await this.call(i, 'initialize', { clientInfo: { name: 'codex_web', title: 'Codex Web', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.send(i, { method: 'initialized' });
    if (p.provider === 'api' && secret.apiKey) await this.call(i, 'account/login/start', { type: 'apiKey', apiKey: secret.apiKey });
    i.ready = true; this.emit('instances', this.status());
  }
  finish(i, error) {
    i.ready = false; i.error = error;
    i.sandboxSetupWait?.reject(fault(error,503));delete i.sandboxSetupWait;i.sandboxSetupPending=false;
    if(i.authPending){const loginId=i.loginId;i.authPending=false;i.loginId=null;this.emit('codex',{profile:i.id,method:'account/login/completed',params:{loginId,success:false,error}});}
    for (const row of i.requests.values()) { clearTimeout(row.timer); row.reject(fault(error, 503)); } i.requests.clear();
    i.approvals.clear(); i.active.clear();
    this.emit('instances', this.status());
  }
  send(i, message) { if (!i.process?.stdin.writable) throw fault('Codex 未运行', 503); i.process.stdin.write(JSON.stringify(message) + '\n'); }
  call(i, method, params = {}, timeout = 30000) {
    const id = i.sequence++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { i.requests.delete(id); reject(fault('Codex 请求超时，请查看实例状态', 504)); }, timeout);
      i.requests.set(id, { resolve, reject, timer });
      try { this.send(i, { id, method, params }); } catch (e) { clearTimeout(timer); i.requests.delete(id); reject(e); }
    });
  }
  receive(i, msg) {
    i.threadMetadata ||= new Map(); i.turnSummaries ||= new Map(); i.itemMetadata ||= new Map();
    if (msg.id !== undefined && !msg.method) {
      const row = i.requests.get(msg.id);
      if (row) { clearTimeout(row.timer); i.requests.delete(msg.id); if (msg.error) row.reject(fault(msg.error.message || 'Codex request failed', 400)); else row.resolve(msg.result); } return;
    }
    if (!msg.method) return;
    if(msg.method==='thread/settings/updated'&&msg.params?.threadId&&msg.params.threadSettings)this.rememberModelSettings(i,msg.params.threadId,msg.params.threadSettings);
    recordStreamReply(i,msg);
    if(msg.method==='windowsSandbox/setupCompleted'){i.sandboxSetupPending=false;i.sandboxNeedsRestart=msg.params?.success===true;i.sandboxSetupWait?.resolve(msg.params);delete i.sandboxSetupWait;}
    if(msg.method==='account/login/completed'){if(i.retiredLoginIds?.has(msg.params?.loginId))return;i.authPending=false;i.loginId=null;}
    if (msg.id !== undefined) {
      i.approvals.set(String(msg.id), msg);
      const threadId = msg.params?.threadId;
      this.notifications.enqueue({ source: 'codex', threadName:i.threadMetadata.get(threadId)?.name, cwd:i.threadMetadata.get(threadId)?.cwd || i.profile.cwd, id: `codex:${i.id}:${i.startedAt}:request:${msg.id}`, kind: msg.method.includes('requestUserInput') ? 'question' : 'approval', summary:approvalSummary(msg.params,msg.method,i.itemMetadata.get(msg.params?.itemId)), path: `/codex/?profile=${encodeURIComponent(i.id)}${threadId ? '&thread=' + encodeURIComponent(threadId) : ''}` });
    }
    if (msg.method === 'serverRequest/resolved') i.approvals.delete(String(msg.params?.requestId));
    if (msg.method === 'thread/started' && msg.params?.thread?.id) {i.loaded.add(msg.params.thread.id);i.threadMetadata.set(msg.params.thread.id,msg.params.thread);}
    if (['item/started','item/completed'].includes(msg.method) && msg.params?.item) { const item=msg.params.item;i.itemMetadata.set(item.id,item);if(['agentMessage','plan'].includes(item.type))i.turnSummaries.set(msg.params.turnId,excerpt(item.text));if(i.itemMetadata.size>500)i.itemMetadata.delete(i.itemMetadata.keys().next().value); }
    if(msg.method==='item/completed'&&msg.params?.item?.type==='agentMessage'&&msg.params.item.questions?.length){const {threadId,item}=msg.params;this.notifications.enqueue({source:'codex',cwd:i.threadMetadata.get(threadId)?.cwd||i.profile.cwd,threadName:i.threadMetadata.get(threadId)?.name,id:`codex:${i.id}:${i.startedAt}:question:${item.id}`,kind:'question',summary:approvalSummary({questions:item.questions},'requestUserInput'),path:`/codex/?profile=${encodeURIComponent(i.id)}&thread=${encodeURIComponent(threadId)}`});}
    if (['item/agentMessage/delta','item/plan/delta'].includes(msg.method)) i.turnSummaries.set(msg.params.turnId,excerpt((i.turnSummaries.get(msg.params.turnId)||'')+msg.params.delta));
    if (msg.method === 'turn/started') i.active.set(msg.params.threadId, msg.params.turn?.id);
    if (msg.method === 'turn/completed') {
      const { threadId, turn } = msg.params; i.active.delete(threadId);
      for (const [key, pending] of i.approvals) if (pending.params?.threadId === threadId) i.approvals.delete(key);
      if (turn?.status !== 'interrupted') this.notifications.enqueue({ source: 'codex', threadName:i.threadMetadata.get(threadId)?.name, cwd:i.threadMetadata.get(threadId)?.cwd || i.profile.cwd, id: `codex:${i.id}:${turn?.id}`, kind: turn?.status === 'completed' ? 'completed' : 'failed', summary:turn?.status==='completed' ? i.turnSummaries.get(turn?.id) || (turn.items||[]).filter(x=>['agentMessage','plan'].includes(x.type)).at(-1)?.text || '任务已完成，打开会话查看回复' : turn?.error?.message || '任务执行失败，打开会话查看详情', path: `/codex/?profile=${encodeURIComponent(i.id)}&thread=${encodeURIComponent(threadId)}` });
      i.turnSummaries.delete(turn?.id);
    }
    this.emit('codex', { profile: i.id, ...msg });
  }
  rememberModelSettings(i,threadId,settings) {
    i.threadMetadata ||= new Map();
    const thread=i.threadMetadata.get(threadId)||{id:threadId},patch={};
    const model=settings.model||settings.collaborationMode?.settings?.model;
    if(model)patch.model=model;
    if(Object.hasOwn(settings,'effort'))patch.effort=settings.effort;
    else if(Object.hasOwn(settings.collaborationMode?.settings||{},'reasoning_effort'))patch.effort=settings.collaborationMode.settings.reasoning_effort;
    if(!Object.keys(patch).length)return;
    i.threadMetadata.set(threadId,{...thread,webModelSettings:{...thread.webModelSettings,...patch}});
  }
  async rpc(id, method, params) {
    const accountChange=['account/login/start','account/login/cancel','account/logout'].includes(method),newTurn=['turn/start','review/start','thread/compact/start'].includes(method);
    if(!accountChange&&!newTurn)return this.rpcUnlocked(id,method,params);
    const i=await this.start(id);
    if(this.lifecycleBusy?.has(id)||this.profileMutationBusy)throw fault('正在修改实例或配置，请稍后重试',409);
    if(i.accountOperationBusy)throw fault('正在处理账号操作，请稍后重试',409);
    if(newTurn&&i.authPending)throw fault('正在登录账号，请完成或取消登录后再发送',409);
    if(newTurn&&i.sandboxNeedsRestart)throw fault('Windows 沙箱已配置，请先重启此网页实例再发送',409);
    if(accountChange){
      if(i.active.size||i.turnStarting)throw fault('实例有运行中或正在启动的任务，完成后再切换账号',409);
      if(method!=='account/login/cancel'&&i.authPending)throw fault('已有登录正在进行，请先完成或取消登录',409);
      if(method==='account/login/cancel'&&(!i.authPending||!i.loginId||params.loginId!==i.loginId))throw fault('登录已结束或验证码不属于此配置',409);
      i.accountOperationBusy=true;
    }else i.turnStarting=(i.turnStarting||0)+1;
    try{
      if(method==='account/login/start')i.authPending=true;
      const result=await this.rpcUnlocked(id,method,params);
      if(method==='account/login/start'&&i.authPending){i.loginId=result.loginId;if(!i.loginId)i.authPending=false;}
      if(method==='account/login/cancel'){i.retiredLoginIds??=new Set();i.retiredLoginIds.add(params.loginId);if(i.retiredLoginIds.size>100)i.retiredLoginIds.delete(i.retiredLoginIds.values().next().value);i.authPending=false;i.loginId=null;}
      return result;
    }catch(error){if(method==='account/login/start'&&error.status!==504){i.authPending=false;i.loginId=null;}throw error;}
    finally{if(accountChange)i.accountOperationBusy=false;else i.turnStarting--;}
  }
  async rpcUnlocked(id, method, params) {
    const allowed = new Set(['account/read', 'account/rateLimits/read', 'account/usage/read', 'account/login/start', 'account/login/cancel', 'account/logout', 'windowsSandbox/readiness', 'model/list', 'skills/list', 'mcpServerStatus/list', 'thread/list', 'thread/read', 'thread/start', 'thread/resume', 'thread/fork', 'thread/name/set', 'thread/archive', 'thread/compact/start', 'thread/goal/get', 'thread/loaded/list', 'turn/start', 'turn/steer', 'turn/interrupt', 'review/start']);
    if (!allowed.has(method)) throw fault('不支持的 Codex 操作', 403);
    const i = await this.start(id);
    const identity=this.profileIdentity(id),known=params.threadId&&this.profileHistory(id).get(params.threadId);
    if(['turn/start','turn/steer','review/start','thread/compact/start'].includes(method)&&known?.principal&&identity&&known.principal!==identity)throw fault('这个会话属于之前的账号，请切换回原账号后发送',409);
    if(['review/start','thread/compact/start'].includes(method)){if(i.active.has(params.threadId))throw fault('请等待当前轮次完成',409);if(i.profile.provider==='chatgpt'){const account=await this.call(i,'account/read',{refreshToken:false});if(account.account?.type!=='chatgpt')throw fault('此配置使用 ChatGPT 套餐，请先登录 ChatGPT 账号',409);}}
    const selected = this.preferences ? (params.threadId ? this.preferences.registerSession(`web:${id}:${params.threadId}`) : this.preferences.snapshot().defaults) : { access: 'workspace-write', approval: 'manual' };
    const policy = nativePolicy(selected);
    if (method === 'thread/start') params = { ...params, cwd: normalizeProjectDirectory(params.cwd || i.profile.cwd || projectRoot), ...policy };
    if (['thread/resume', 'thread/fork'].includes(method)) params = { ...params, ...policy };
    if (method === 'turn/start') {
      if(i.profile.provider==='chatgpt'){const account=await this.call(i,'account/read',{refreshToken:false});if(account.account?.type!=='chatgpt')throw fault('此配置使用 ChatGPT 套餐，请先在设置中登录 ChatGPT 账号',409);}
      if(known&&!known.principal&&known.identityEvidence==='created-with-account'&&identity){known.principal=identity;this.profileHistory(id).save();}
      const cwd = i.threadMetadata?.get(params.threadId)?.cwd || i.profile.cwd || projectRoot;
      const sandboxPolicy = selected.access === 'full-access' ? { type: 'dangerFullAccess' } : selected.access === 'read-only' ? { type: 'readOnly', networkAccess: false } : { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false };
      params = { ...params, approvalPolicy: policy.approvalPolicy, approvalsReviewer: policy.approvalsReviewer, sandboxPolicy };
      if (i.active.has(params.threadId)) throw fault('这个会话正在执行，请用追加指令或中断');
    }
    if (['account/logout', 'account/login/start'].includes(method) && i.active.size) throw fault('实例有运行中的任务，完成后再切换账号', 409);
    if (method === 'account/login/start' && (i.profile.provider!=='chatgpt'||!['chatgpt','chatgptDeviceCode'].includes(params.type))) throw fault('此处只管理 ChatGPT 登录；API Key 请在模型提供方设置中保存');
    if (['thread/read','thread/resume'].includes(method)&&i.unmaterialized?.has(params.threadId)&&i.threadMetadata?.has(params.threadId)) return {thread:i.threadMetadata.get(params.threadId)};
    if(['account/logout','account/login/start'].includes(method))this.profileHistory(id).capture(await listInteractiveThreads(this,i),identity,{complete:true});
    if(this.config.chatgptHttpCompatibility===true&&i.profile.provider==='chatgpt'&&['thread/start','thread/resume','thread/fork'].includes(method))params=chatgptHttpParams(params);
    if(['turn/start','review/start','thread/compact/start'].includes(method)){
      if(this.config.chatgptHttpCompatibility===true)await ensureChatgptHttp(this,i,params.threadId,policy);
      if(i.active.has(params.threadId))throw fault('请等待当前轮次完成',409);
    }
    const previousModelSettings=i.threadMetadata?.get(params.threadId)?.webModelSettings;
    let result;
    for(let attempt=0;;attempt++)try{result=await this.call(i,method,params,method==='account/login/start'?90000:30000);break;}catch(error){if(attempt>=5||!['thread/read','thread/resume'].includes(method)||!i.loaded.has(params.threadId)||!/rollout.*(?:empty|no rollout)|no rollout found/i.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,100));}
    if(result.thread?.id&&result.modelProvider===chatgptHttpProvider){i.httpThreads??=new Set();i.httpThreads.add(result.thread.id);}
    if(['thread/start','thread/fork'].includes(method)&&result.thread?.id)this.profileHistory(id).capture([result.thread],i.authPending?null:identity,{created:true});
    if(method==='thread/name/set')this.profileHistory(id).rename(params.threadId,params.name);
    if(method==='thread/archive')this.profileHistory(id).archive(params.threadId);
    if(method==='thread/start'&&result.thread?.id){i.unmaterialized ||= new Set();i.unmaterialized.add(result.thread.id);}
    if(['turn/start','review/start','thread/compact/start'].includes(method))i.unmaterialized?.delete(params.threadId);
    if(method==='thread/archive'){i.loaded.delete(params.threadId);i.httpThreads?.delete(params.threadId);i.unmaterialized?.delete(params.threadId);i.threadMetadata?.delete(params.threadId);}
    if(['thread/read','thread/resume'].includes(method)&&result.thread?.id)result.thread=streamReplySnapshot(i,result.thread);
    // Older engines may not emit thread/settings/updated. Remember an accepted
    // turn's explicit values, but let a newer native notification take precedence.
    if(method==='turn/start'&&result.turn?.id&&i.threadMetadata.get(params.threadId)?.webModelSettings===previousModelSettings)this.rememberModelSettings(i,params.threadId,params);
    if(result.thread?.id){
      i.threadMetadata ||= new Map();
      const current=i.threadMetadata.get(result.thread.id)?.webModelSettings;
      const nativeModel=result.thread.model||result.model;
      const nativeEffort=Object.hasOwn(result.thread,'reasoningEffort')?result.thread.reasoningEffort:result.reasoningEffort??null;
      const settings=nativeModel&&current===previousModelSettings?{model:nativeModel,effort:nativeEffort}:current;
      if(settings)result.thread.webModelSettings=settings;
      i.threadMetadata.set(result.thread.id,result.thread);
    }
    if(['thread/read','thread/resume'].includes(method)&&result.thread){const stamp=fs.statSync(path.join(packageRoot,'src','question-history.js')).mtimeMs;const {enrichQuestions}=await import(`./question-history.js?v=${stamp}`);await enrichQuestions(result.thread,this.home(id));}
    if (['thread/start', 'thread/resume', 'thread/fork'].includes(method) && result.thread?.id) { i.loaded.add(result.thread.id); this.preferences?.registerSession(`web:${id}:${result.thread.id}`); }
    if (['turn/start','review/start'].includes(method) && result.turn?.id) i.active.set(result.reviewThreadId||params.threadId, result.turn.id);
    return result;
  }
  answer(id, requestId, result) {
    const i = this.instances.get(id); const msg = i?.approvals.get(String(requestId));
    if (!msg) throw fault('审批已处理或过期', 409);
    if(msg.method==='item/permissions/requestApproval')validatePermissions(msg.params,result);
    else if(msg.method==='mcpServer/elicitation/request')validateElicitation(msg.params,result);
    else if (msg.method.endsWith('/requestApproval')) {
      if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(result?.decision)) throw fault('无效的审批决定');
    } else if (msg.method === 'item/tool/requestUserInput' || msg.method === 'tool/requestUserInput') {
      if (!result?.answers || typeof result.answers !== 'object') throw fault('缺少回答');
    } else throw fault('此请求类型还不支持，已保留待处理状态', 409);
    this.send(i, { id: msg.id, result }); i.approvals.delete(String(requestId));
    this.emit('approval/resolved', { profile: id, requestId: msg.id }); return { ok: true };
  }
  status() { return this.config.profiles.map(p => { const i = this.instances.get(p.id); return { id: p.id, name: p.name, provider: p.provider, model: p.model, cwd: p.cwd, pid: i?.ready ? i.process.pid : null, running: !!i?.ready, active: i?.active.size || 0, approvals: i?.approvals.size || 0, sandboxSetupPending: !!i?.sandboxSetupPending, sandboxNeedsRestart: !!i?.sandboxNeedsRestart, authPending: !!i?.authPending, loginId: i?.authPending ? i.loginId || null : null, error: i?.error, startedAt: i?.startedAt }; }); }
  pending(id) { return [...(this.instances.get(id)?.approvals.values() || [])]; }
  async stop(id, force = false) {
    return this.lifecycle(id,()=>this.stopUnchecked(id,force));
  }
  async lifecycle(id,operation){
    safeId(id);this.lifecycleBusy??=new Set();
    if(this.lifecycleBusy.has(id))throw fault('此实例已有停止或重启操作，请稍后重试',409);
    this.lifecycleBusy.add(id);try{return await operation();}finally{this.lifecycleBusy.delete(id);}
  }
  async stopUnchecked(id, force = false) {
    const i = this.instances.get(id); if (!i) return { ok: true };
    if(i.starting)try{await i.starting;}catch{/* Failed launch is still stopped below. */}
    if ((i.active.size || i.approvals.size || i.turnStarting || i.accountOperationBusy || i.sandboxSetupPending) && !force) throw fault('实例还有任务、审批或账号/沙箱操作，请先完成后再停止', 409);
    if (i.process && i.process.exitCode === null && i.process.signalCode === null) { await new Promise((resolve,reject)=>{const proc=i.process;const done=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{proc.removeListener('exit',done);reject(fault('原实例尚未确认退出，未启动替代实例，请稍后检查',409));},5000);proc.once('exit',done);if(!proc.kill()){clearTimeout(timer);proc.removeListener('exit',done);reject(fault('无法停止原实例，请检查运行状态',409));}}); }
    this.instances.delete(id); this.emit('instances', this.status()); return { ok: true };
  }
  async restart(id) { return this.lifecycle(id,async()=>{if(this.profileMutationBusy)throw fault('正在修改账号配置，请稍后重试',409);await this.stopUnchecked(id);await this.startUnchecked(id);return {ok:true};}); }
  async setupSandbox(id,mode){
    if(!['elevated','unelevated'].includes(mode))throw fault('无效 Windows 沙箱模式');
    return this.lifecycle(id,async()=>{
      const i=await this.startUnchecked(id);
      if(i.active.size||i.approvals.size||i.turnStarting||i.accountOperationBusy||i.authPending||i.sandboxSetupPending)throw fault('请先完成任务、审批与账号操作，再配置 Windows 沙箱',409);
      i.sandboxSetupPending=true;
      let timer;const completion=new Promise((resolve,reject)=>{i.sandboxSetupWait={resolve,reject};timer=setTimeout(()=>reject(fault('等待 Windows 沙箱设置超时，请完成或取消系统窗口；此实例暂不可运行任务',504)),180000);});
      // Attach the rejection handler before native setup can emit a completion.
      const outcome=completion.then(value=>({value}),error=>({error}));
      try{
        const started=await this.call(i,'windowsSandbox/setupStart',{mode,cwd:i.profile.cwd});
        if(!started.started){i.sandboxSetupPending=false;throw fault('原生沙箱初始化没有启动，请查看运行状态',409);}
        const result=await outcome;if(result.error)throw result.error;
        if(!result.value?.success)throw fault('Windows 沙箱初始化失败：'+String(result.value?.error||'请检查系统设置').slice(0,600),409);
        await this.stopUnchecked(id);const replacement=await this.startUnchecked(id);const readiness=await this.call(replacement,'windowsSandbox/readiness',{});
        if(readiness.status!=='ready')throw fault('独立内核已重启，但沙箱仍未就绪，请检查运行设置',409);
        return {ok:true,mode,status:readiness.status,restarted:true};
      }catch(error){if(error.status!==504){i.sandboxSetupPending=false;delete i.sandboxSetupWait;}throw error;}finally{clearTimeout(timer);if(!i.sandboxSetupPending)delete i.sandboxSetupWait;}
    });
  }
  async updateProfile(patch,save){
    if(this.profileMutationBusy)throw fault('正在修改账号配置，请稍后重试',409);
    this.profileMutationBusy=true;
    let before,secretFile,secretBefore,secretTouched=false;
    try{
      this.validateProfile(patch);
      before=this.config.profiles.map(row=>({...row}));secretFile=path.join(this.home(patch.id),'provider-secret.json');secretBefore=fs.existsSync(secretFile)?fs.readFileSync(secretFile):null;
      await this.stop(patch.id);
      secretTouched=!!patch.apiKey;
      const row=this.saveProfile(patch);save();return row;
    }catch(error){
      if(before)this.config.profiles=before;
      if(secretTouched)try{if(secretBefore===null)fs.rmSync(secretFile,{force:true});else{fs.writeFileSync(secretFile+'.restore',secretBefore,{mode:0o600});fs.renameSync(secretFile+'.restore',secretFile);}}catch{throw fault('配置保存失败，密钥文件回退也未完成，请检查数据目录后重试',500);}
      throw error;
    }finally{this.profileMutationBusy=false;}
  }
  validateProfile(patch) {
    const id = safeId(patch.id); const current = this.config.profiles.find(p => p.id === id);
    if (!['chatgpt', 'api', 'custom'].includes(patch.provider)) throw fault('无效的模型来源');
    const cwd = normalizeProjectDirectory(path.resolve(patch.cwd || projectRoot)); if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw fault('工作目录不存在');
    const row = { id, name: String(patch.name || id).slice(0, 80), provider: patch.provider, model: String(patch.model || '').slice(0, 150), cwd };
    if (patch.provider === 'custom') { let url;try{url=new URL(patch.baseUrl);}catch{throw fault('自定义服务地址无效');} if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw fault('自定义服务需要 HTTPS 或本机地址'); if (url.username || url.password || url.search || url.hash) throw fault('服务地址不应包含凭据或查询参数'); row.baseUrl = url.href.replace(/\/$/, ''); }
    if (!current && this.config.profiles.length >= 20) throw fault('最多支持 20 个账号配置');
    if(patch.apiKey!==undefined&&(typeof patch.apiKey!=='string'||patch.apiKey.length>16384))throw fault('无效 API Key');
    if(patch.provider==='api'&&!patch.apiKey&&!readJson(path.join(this.home(id),'provider-secret.json'),{}).apiKey)throw fault('OpenAI API 配置需要 API Key');
    if(patch.provider==='custom'&&!row.model.trim())throw fault('自定义服务需要填写默认模型');
    return row;
  }
  saveProfile(patch) {
    const row=this.validateProfile(patch),id=row.id,current=this.config.profiles.find(p=>p.id===id);
    if (this.instances.get(id)?.ready) throw fault('请先停止此账号的实例再改配置',409);
    if (patch.apiKey) writeJson(path.join(this.home(id), 'provider-secret.json'), { apiKey: String(patch.apiKey) });
    if (current) Object.assign(current, row); else { if (this.config.profiles.length >= 20) throw fault('最多支持 20 个账号配置'); this.config.profiles.push(row); }
    return row;
  }
}
