export function publicRequestOrigin(config, host) {
  if (!config.publicOrigin) return null;
  const url = new URL(config.publicOrigin);
  if (url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash) throw Error('Configure an HTTPS public origin without credentials, path, or query');
  return host===url.host ? url.origin : null;
}
