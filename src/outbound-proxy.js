import path from 'node:path';
import {dataRoot, readJson} from './storage.js';

// Read at launch so future Web-owned instances pick up changes without restarting Web.
export function outboundProxyEnv(base = process.env) {
  const {url} = readJson(path.join(dataRoot, 'outbound-proxy.json'), {});
  if (!url) return {...base};
  const proxy = new URL(url);
  if (!['http:', 'https:'].includes(proxy.protocol)) throw new Error('Invalid outbound HTTP proxy');
  const env = {...base};
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) env[name] = proxy.href;
  const bypass = 'localhost,127.0.0.1,::1';
  env.NO_PROXY = env.no_proxy = bypass;
  return env;
}
