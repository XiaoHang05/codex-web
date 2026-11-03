import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomInt, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { dataRoot, readJson, writeJson, fault } from './storage.js';
import {LoginSessions} from './login-sessions.js';
import {publicRequestOrigin} from './public-origin.js';
import {appLoginChallenge,verifyAppLoginProof} from './app-auth-proof.js';
import {accessSource} from './access-source.js';
const derive = promisify(scrypt);
const params = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const sessionIdleMs = 24 * 60 * 60 * 1000;
export async function passwordHash(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32, params);
  return `$scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(password, hash) {
  const parts = String(hash).split('$');
  if (parts.length !== 4 || parts[1] !== 'scrypt') return false;
  const expected = Buffer.from(parts[3], 'base64');
  if (expected.length !== 32) return false;
  const actual = await derive(password, Buffer.from(parts[2], 'base64'), 32, params);
  return timingSafeEqual(actual, expected);
}
export function createAuth(config, { fallbackSession, revocationListeners = new Set(), sessionStore = new Map(), revokedTokens = new Set() } = {}) {
  const file = path.join(dataRoot, 'auth.json');
  let state = readJson(file, null);
  if (!state) {
    state = {passwordHash:'',passkeyOnly:false,credentials:[]};
    writeJson(file, state);
  }
  state.passwordLoginEnabled ??= !state.passkeyOnly;
  const sessions = sessionStore, challenges = new Map(), attempts = new Map(), revoked = revokedTokens;
  const persisted=new LoginSessions(path.join(dataRoot,'login-sessions.json'),sessions,()=>state.credentials);
  // Apply the inactivity limit to existing sessions without renewing old logins.
  for(const row of persisted.rows()){
    const lastActive=Number.isFinite(row.lastActiveAt)?row.lastActiveAt:Number.isFinite(row.createdAt)?row.createdAt:row.expires-604800000;
    row.lastActiveAt=lastActive;row.expires=Math.min(row.expires,lastActive+sessionIdleMs);
  }
  persisted.flush();
  // A previous auth instance can flush during hot upgrade; persist again later.
  persisted.dirty=true;
  // Ephemeral bearer grants: only hashes, never plaintext or disk persistence.
  const oneTimeKeys = new Map(), keyGeneration = new Map();
  let numericAttempts = { count: 0, expires: 0 };
  const keyDigest = value => createHash('sha256').update(value).digest('hex');
  function pruneKeys() {
    const now = Date.now(), active = new Set(persisted.rows().map(s => s.id));
    for (const [hash, row] of oneTimeKeys) if (row.expires <= now || !active.has(row.issuer)) oneTimeKeys.delete(hash);
    for (const [id, until] of keyGeneration) if (until <= now) keyGeneration.delete(id);
  }
  function prune() {
    const now = Date.now();
    for (const map of [sessions, challenges, attempts]) for (const [key, row] of map) if (row.expires < now) map.delete(key);
    persisted.prune();persisted.flushIfDirty();
    pruneKeys();
  }
  const timer = setInterval(()=>{try{prune();}catch{console.error('登录会话存储写入失败，请检查项目数据目录');}}, 60000); timer.unref();
  function context(req) {
    const host = req.headers.host;
    const remote = req.socket.remoteAddress;
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
    const local = loopback && ['localhost', '127.0.0.1'].some(h => host === `${h}:${config.port}`) && !['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'x-forwarded-host'].some(h => req.headers[h]);
    const publicOrigin = publicRequestOrigin(config,host);
    const origin = local ? `http://${host}` : publicOrigin;
    if (!loopback || (!local && (!publicOrigin || req.headers['x-forwarded-proto'] !== 'https'))) throw fault('Untrusted host or transport', 403);
    if (req.headers.origin && req.headers.origin !== origin) throw fault('Untrusted origin', 403);
    if (req.headers['sec-fetch-site'] === 'cross-site') throw fault('Cross-site access denied', 403);
    return { local, origin, rpID: new URL(origin).hostname };
  }
  const cookieName = req => context(req).local ? 'codex_web_local' : '__Host-codex_web';
  function token(req) {
    const name = cookieName(req);
    return String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
  }
  function session(req, { touch = true } = {}) {
    const t = token(req); if (revoked.has(t)) return null;
    const s = persisted.get(t);
    const now=Date.now();
    if (!s || s.expires <= now || (s.passkeyId && !state.credentials.some(c => c.id === s.passkeyId))) return null;
    s.id ||= randomBytes(16).toString('hex'); s.createdAt ||= s.expires - 604800000;
    // An already-streaming response is a heartbeat check, not new client activity.
    if (touch&&!req.res?.headersSent){
      s.lastActiveAt=now;s.expires=now+sessionIdleMs;
      if(req.res)setCookie(req.res,cookie(req,t));
    }
    s.ip ||= String(req.headers['x-real-ip'] || req.socket.remoteAddress); s.userAgent ||= String(req.headers['user-agent'] || '').slice(0,250);
    persisted.remember(t,s); return s;
  }
  function cookie(req, value, expire = false) {
    return `${cookieName(req)}=${value}; Path=/; HttpOnly; SameSite=Strict; ${context(req).local ? '' : 'Secure; '}Max-Age=${expire ? 0 : sessionIdleMs/1000}`;
  }
  function setCookie(res,value){
    const previous=res.getHeader('Set-Cookie'),name=value.split('=')[0]+'=';
    const cookies=(previous===undefined?[]:Array.isArray(previous)?previous:[previous]).filter(entry=>!String(entry).startsWith(name));
    cookies.push(value);res.setHeader('Set-Cookie',cookies.length===1?cookies[0]:cookies);
  }
  function issue(req, res, identity = {}) {
    const t = randomBytes(32).toString('hex');
    persisted.remember(t, { id: randomBytes(16).toString('hex'), csrf: randomBytes(24).toString('hex'), createdAt: Date.now(), lastActiveAt: Date.now(), ip: String(req.headers['x-real-ip'] || req.socket.remoteAddress), userAgent: String(req.headers['user-agent'] || '').slice(0,250), expires: Date.now() + sessionIdleMs, ...identity },{immediate:true});
    res.setHeader('Set-Cookie', cookie(req, t));
    return sessions.get(t);
  }
  function requireSession(req) { const s = session(req); if (!s) throw fault('请先登录管理入口', 401); return s; }
  function csrf(req) {
    const s = requireSession(req);
    if (req.headers['x-csrf-token'] !== s.csrf) throw fault('Invalid CSRF token', 403);
    return s;
  }
  function limit(req) {
    prune();
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress);
    let row = attempts.get(ip);
    if (!row) { row = { count: 0, expires: Date.now() + 900000 }; attempts.set(ip, row); }
    if (++row.count > 20) throw fault('尝试过多，请 15 分钟后再试', 429);
    if (attempts.size > 2048) throw fault('Authentication busy', 429);
  }
  function save() { writeJson(file, state); }
  function addChallenge(req, res, challenge, kind) {
    prune();
    if (challenges.size >= 256) throw fault('Authentication busy', 429);
    const id = randomBytes(24).toString('hex');
    challenges.set(id, { challenge, kind, origin: context(req).origin, session: kind === 'register' ? token(req) : null, expires: Date.now() + 300000 });
    setCookie(res, `codex_web_challenge=${id}; Path=/codex-api/v1/auth; HttpOnly; SameSite=Strict; ${context(req).local ? '' : 'Secure; '}Max-Age=300`);
  }
  function takeChallenge(req, kind) {
    const id = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('codex_web_challenge='))?.slice('codex_web_challenge='.length);
    const row = challenges.get(id); challenges.delete(id);
    if (!row || row.kind !== kind || row.expires < Date.now() || row.origin !== context(req).origin || (kind === 'register' && row.session !== token(req))) throw fault('通行密钥挑战已过期', 400);
    return row.challenge;
  }
  return {
    context, session, csrf, requireSession, revocationListeners, sessionStore, revokedTokens,
    onRevocation(listener) { revocationListeners.add(listener); return () => revocationListeners.delete(listener); },
    ensureLocal(req, res) { if (context(req).local && !session(req)) { issue(req, res, { method: 'local' }); const cookie = res.getHeader('Set-Cookie'); req.headers.cookie = `${req.headers.cookie || ''}; ${cookie.split(';')[0]}`; } },
    close: () => {clearInterval(timer);persisted.flushIfDirty();},
    info(req) { return { authenticated: !!session(req), csrf: session(req)?.csrf, configured: !!state.passwordHash, passkeyOnly: !state.passwordLoginEnabled, passwordLoginEnabled: state.passwordLoginEnabled, passkeys: state.credentials.length, local: context(req).local, loginMethod: session(req)?.method, currentPasskeyId: session(req)?.passkeyId, appAuthPkce: 'S256-v1', accessKind: accessSource(req, context(req)).kind }; },
    async login(req, res) {
      const ctx = context(req);
      limit(req);
      if (Object.hasOwn(req.body || {}, 'oneTimeKey')) {
        // Login CSRF protection also for clients that omit Fetch Metadata.
        if (req.headers.origin !== ctx.origin || !String(req.headers['content-type'] || '').startsWith('application/json')) throw fault('Untrusted login request', 403);
        pruneKeys();
        // Account-wide budget prevents distributed guessing across different IPs.
        if (numericAttempts.expires <= Date.now()) numericAttempts = { count: 0, expires: Date.now() + 300000 };
        if (++numericAttempts.count > 20) throw fault('一次性密钥尝试过多，请 5 分钟后再试', 429);
        const value = req.body.oneTimeKey;
        const hash = typeof value === 'string' && /^[0-9]{8}$/.test(value) ? keyDigest(value) : '';
        const grant = oneTimeKeys.get(hash);
        if (!grant) throw fault('一次性密钥无效、已使用或已过期', 401);
        verifyAppLoginProof(grant,req.body.appVerifier);
        // No await between lookup and consume: concurrent requests cannot redeem twice.
        oneTimeKeys.delete(hash);
        issue(req, res, { method: 'one-time-key', delegatedBy: grant.issuer });
        return { ok: true };
      }
      if (!state.passwordLoginEnabled) throw fault('未开放密码登录，请使用其他方式', 403);
      if (typeof req.body.password !== 'string' || req.body.password.length > 1024 || !await verifyPassword(req.body.password, state.passwordHash)) throw fault('密码不正确', 401);
      issue(req, res, { method: 'password' }); return { ok: true };
    },
    async setup(req, res) {
      if (state.passwordHash || !context(req).local) throw fault('只能在本机首次设置密码', 403);
      const p = req.body.password;
      if (typeof p !== 'string' || p.length < 1 || p.length > 1024) throw fault('密码需为 1-1024 个字符');
      state.passwordHash = await passwordHash(p); state.passwordLoginEnabled = true; state.passkeyOnly = false; save(); issue(req, res, { method: 'password' }); return { ok: true };
    },
    createOneTimeKey(req) {
      const own = csrf(req); pruneKeys();
      const appChallenge = appLoginChallenge(req.body?.appChallenge);
      if (keyGeneration.has(own.id)) throw fault('请稍等 10 秒再生成', 429);
      if (oneTimeKeys.size >= 8 && ![...oneTimeKeys.values()].some(row => row.issuer === own.id)) throw fault('待使用密钥过多，请稍后再试', 429);
      for (const [hash, row] of oneTimeKeys) if (row.issuer === own.id) oneTimeKeys.delete(hash);
      let key;
      do { key = String(randomInt(0, 100000000)).padStart(8, '0'); } while (oneTimeKeys.has(keyDigest(key)));
      const expires = Date.now() + 300000;
      oneTimeKeys.set(keyDigest(key), { issuer: own.id, expires, ...(appChallenge ? {appChallenge} : {}) });
      keyGeneration.set(own.id, Date.now() + 10000);
      return { key, expires, ...(appChallenge ? {binding:'S256'} : {}) };
    },
    cancelOneTimeKey(req) {
      const own = csrf(req);
      for (const [hash, row] of oneTimeKeys) if (row.issuer === own.id) oneTimeKeys.delete(hash);
      return { ok: true };
    },
    logout(req, res) { const s = session(req); revoked.add(token(req)); persisted.remove(token(req)); pruneKeys(); if (s) for (const listener of revocationListeners) listener(s.id); res.setHeader('Set-Cookie', cookie(req, '', true)); return { ok: true }; },
    listKeys(req) { return state.credentials.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt, current: session(req)?.passkeyId === c.id })); },
    listSessions(req) {
      const own = requireSession(req); prune();
      return persisted.rows().map(s => ({ id:s.id, self:s.id===own.id, createdAt:s.createdAt, lastActiveAt:s.lastActiveAt, expires:s.expires, ip:s.ip, userAgent:s.userAgent, method:s.method || 'legacy', passkeyName:s.passkeyId ? state.credentials.find(c => c.id===s.passkeyId)?.name : undefined }));
    },
    revokeSession(req, id) {
      const own = requireSession(req); const target = persisted.rows().find(s => s.id === id);
      if (!target) throw fault('会话已失效',404);
      for(const [key,row]of sessions)if(row.id===id)revoked.add(key);persisted.removeId(id);pruneKeys();for (const listener of revocationListeners) listener(id); return { ok:true, self:own.id===id };
    },
    renameKey(req, id, name) { requireSession(req); const key = state.credentials.find(c => c.id === id); if (!key) throw fault('找不到通行密钥', 404); if (typeof name !== 'string' || !name.trim() || name.length > 80) throw fault('请输入 1–80 字符的名称'); key.name = name.trim(); save(); return { ok: true }; },
    setPasswordEnabled(req, enabled) { requireSession(req); if (typeof enabled !== 'boolean') throw fault('无效开关'); if (enabled && !state.passwordHash) throw fault('请先设置访问密码'); if (!enabled && !state.credentials.length) throw fault('先添加通行密钥，避免失去登录方式'); state.passwordLoginEnabled = enabled; state.passkeyOnly = !enabled; save(); return { ok: true }; },
    async changePassword(req) {
      csrf(req);
      const {password,confirmation} = req.body || {};
      if (typeof password !== 'string' || password.length < 1 || password.length > 1024) throw fault('密码需为 1-1024 个字符');
      if (confirmation !== password) throw fault('两次输入的密码不一致');
      const hash = await passwordHash(password);
      // Recheck authorization after deriving the hash, before committing the change.
      csrf(req);
      const previous = state.passwordHash;
      state.passwordHash = hash;
      try { save(); } catch (error) { state.passwordHash = previous; throw error; }
      return { ok: true };
    },
    async options(req, res, register) {
      limit(req); const ctx = context(req);
      let options;
      if (register) {
        requireSession(req);
        options = await generateRegistrationOptions({ rpName: 'Codex Web', rpID: ctx.rpID, userID: Buffer.from('codex-web-operator'), userName: 'operator', userDisplayName: 'operator', attestationType: 'none', excludeCredentials: state.credentials.map(c => ({ id: c.credentialId, transports: c.transports })), authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' } });
      } else {
        if (!state.credentials.length) throw fault('尚未登记通行密钥');
        options = await generateAuthenticationOptions({ rpID: ctx.rpID, allowCredentials: state.credentials.map(c => ({ id: c.credentialId, transports: c.transports })), userVerification: 'required' });
      }
      addChallenge(req, res, options.challenge, register ? 'register' : 'login'); return options;
    },
    async verify(req, res, register) {
      limit(req); const ctx = context(req); const expectedChallenge = takeChallenge(req, register ? 'register' : 'login');
      const response = req.body.response;
      if (register) {
        requireSession(req);
        const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: ctx.origin, expectedRPID: ctx.rpID, requireUserVerification: true });
        if (!v.verified || !v.registrationInfo) throw fault('通行密钥登记失败', 401);
        const c = v.registrationInfo.credential;
        const name = String(req.body.name || '').trim(); if (!name || name.length > 80) throw fault('请为通行密钥命名（1–80 字符）');
        state.credentials.push({ id: randomBytes(12).toString('hex'), credentialId: c.id, publicKey: Buffer.from(c.publicKey).toString('base64url'), counter: c.counter, transports: c.transports, name, createdAt: new Date().toISOString() });
      } else {
        const c = state.credentials.find(c => c.credentialId === response?.id);
        if (!c) throw fault('未登记的通行密钥', 401);
        const v = await verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin: ctx.origin, expectedRPID: ctx.rpID, requireUserVerification: true, credential: { id: c.credentialId, publicKey: Buffer.from(c.publicKey, 'base64url'), counter: c.counter, transports: c.transports } });
        if (!v.verified) throw fault('通行密钥验证失败', 401);
        c.counter = v.authenticationInfo.newCounter;
        issue(req, res, { method: 'passkey', passkeyId: c.id });
      }
      save(); return { ok: true };
    },
    removeKey(req, id) {
      const s = requireSession(req);
      if (s.passkeyId === id) throw fault('不能删除当前登录使用的通行密钥', 409);
      if (!s.method && !context(req).local) throw fault('当前登录建立于更新前，请重新登录后管理通行密钥', 409);
      if (!state.credentials.some(c => c.id === id)) throw fault('找不到通行密钥', 404);
      if (!state.passwordLoginEnabled && state.credentials.length <= 1) throw fault('必须保留至少一个通行密钥');
      state.credentials = state.credentials.filter(c => c.id !== id); save(); return { ok: true };
    }
  };
}
