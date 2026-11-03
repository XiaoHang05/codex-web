import path from 'node:path';
import { readJson, writeJson, fault } from './storage.js';

const accessValues = ['read-only', 'workspace-write', 'full-access'];
const approvalValues = ['manual', 'automatic', 'never'];
function policy(value) {
  if (!value || !accessValues.includes(value.access) || !approvalValues.includes(value.approval)) throw fault('无效的权限或审批策略');
  return { access: value.access, approval: value.approval };
}
export class Preferences {
  constructor(directory) {
    this.file = path.join(directory, 'preferences.json');
    this.value = readJson(this.file, {
      version: 1, defaults: { access: 'workspace-write', approval: 'manual' },
      notifications: Object.fromEntries(['codex'].map(engine => [engine, { enabled: false, completed: true, failed: true, approval: true, question: true }])),
      sessions: {}, desktopOffline: 'show-offline', history: 'unified-index',
    });
  }
  save() { writeJson(this.file, this.value); }
  snapshot() { const value=structuredClone(this.value);value.notifications.codex.guardian??=false;return value; }
  updateDefaults(value) {
    const next = { ...this.value.defaults, ...policy(value) };
    for (const key of ['model','effort','speed']) if (Object.hasOwn(value,key)) {
      const v=value[key];
      if(key==='model' && v!==null && (typeof v!=='string'||!v.trim()||v.length>200)) throw fault('无效默认模型');
      if(key==='effort' && v!==null && !['none','minimal','low','medium','high','xhigh','max','ultra'].includes(v)) throw fault('无效默认推理强度');
      if(key==='speed' && !['inherit','default','fast'].includes(v)) throw fault('无效默认速度');
      next[key]=key==='model'&&v!==null?v.trim():v;
    }
    this.value.defaults = next; this.save();
  }
  updateNotification(engine, value) {
    if (!['codex'].includes(engine)) throw fault('未知通知来源');
    const next = { ...(engine==='codex'?{guardian:false}:{}), ...this.value.notifications[engine] };
    for (const key of Object.keys(next)) {
      if (value[key] !== undefined) {
        if (typeof value[key] !== 'boolean') throw fault('通知开关必须为布尔值');
        next[key] = value[key];
      }
    }
    this.value.notifications[engine] = next; this.save();
  }
  registerSession(key) {
    if (!/^[a-zA-Z0-9:_-]{1,180}$/.test(key)) throw fault('无效会话标识');
    if (!Object.hasOwn(this.value.sessions, key)) {
      this.value.sessions[key] = { inheritedAtCreation: structuredClone(this.value.defaults), override: null };
      this.save();
    }
    return this.session(key);
  }
  session(key) {
    const row = this.value.sessions[key];
    if (!row) throw fault('会话尚未注册', 404);
    return structuredClone(row.override || row.inheritedAtCreation);
  }
  overrideSession(key, value) {
    this.registerSession(key); this.value.sessions[key].override = value === null ? null : policy(value); this.save();
    return this.session(key);
  }
  notificationAllowed(engine, kind) {
    const settings = this.value.notifications[engine];
    return !!settings?.enabled && settings[kind] === true;
  }
}

// Map UI intent to the native API. Never implement automatic review as accept-all.
export function nativePolicy(value) {
  const selected = policy(value);
  return {
    sandbox: { 'read-only': 'read-only', 'workspace-write': 'workspace-write', 'full-access': 'danger-full-access' }[selected.access],
    approvalPolicy: selected.approval === 'never' ? 'never' : 'on-request',
    approvalsReviewer: selected.approval === 'automatic' ? 'auto_review' : 'user',
  };
}

// A verified principal includes provider and account/workspace identity, not email alone.
// Unknown identities remain grouped by their source until explicitly associated.
export function unifiedSessions(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!row.threadId || !row.source) throw fault('会话缺少来源或原生标识');
    const principal = row.verifiedPrincipal || `unknown:${row.source}`;
    const key = JSON.stringify([principal, row.threadId]);
    const entry = index.get(key) || { key, threadId: row.threadId, principal, sources: [], owners: [], updatedAt: 0 };
    if (!entry.sources.includes(row.source)) entry.sources.push(row.source);
    if (row.liveOwner && !entry.owners.includes(row.liveOwner)) entry.owners.push(row.liveOwner);
    entry.updatedAt = Math.max(entry.updatedAt, row.updatedAt || 0);
    entry.name ||= row.name;
    entry.cwd ||= row.cwd;
    entry.protected ||= !!row.protected;
    entry.offline = (entry.offline??true) && !!row.offline;
    entry.accountMismatch = (entry.accountMismatch??true) && !!row.accountMismatch;
    entry.availableSources??=[];if(!row.accountMismatch&&!entry.availableSources.includes(row.source))entry.availableSources.push(row.source);
    entry.identityEvidence ||= row.identityEvidence;
    entry.conflict = entry.owners.length > 1;
    entry.running ||= !!row.running;
    entry.needsAttention ||= !!row.needsAttention;
    index.set(key, entry);
  }
  return [...index.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
