export function isArtifactLink(value){
  return !!value&&(/^(?:[a-zA-Z]:[\\/]|file:)/i.test(value)||! /^(?:[a-z][a-z0-9+.-]*:|#|\?)/i.test(value));
}
export function normalizeArtifactPath(value){
  let path=String(value||'');
  path=path.replace(/^file:\/\//i,'');
  try{path=decodeURIComponent(path);}catch{}
  path=path.replace(/^\/([a-zA-Z]:[\\/])/,'$1');
  return path.replace(/:\d+(?::\d+)?$/,'');
}
