import {createHash,timingSafeEqual} from 'node:crypto';
import {fault} from './storage.js';

export function appLoginChallenge(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw fault('无效的 App 登录请求');
  return value;
}

export function verifyAppLoginProof(grant, verifier) {
  if (!grant.appChallenge) {
    if (verifier !== undefined) throw fault('此凭证未绑定 App 登录请求',401);
    return;
  }
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw fault('App 登录证明无效',401);
  const actual = createHash('sha256').update(verifier,'ascii').digest('base64url');
  if (!timingSafeEqual(Buffer.from(actual),Buffer.from(grant.appChallenge))) throw fault('App 登录证明不匹配',401);
}
