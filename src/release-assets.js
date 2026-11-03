import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

// Pin the complete browser module graph to one immutable release. Relative
// imports stay relative; absolute references to actual bundled assets are
// rewritten without changing navigation links or API endpoints.
export function createReleaseAssets(directory, version) {
  if (!/^[a-f0-9]{40}$/.test(version)) throw Error('Invalid asset release identifier');
  const root = path.resolve(directory), prefix = `/codex/_releases/${version}/`;
  const inside = file => file.startsWith(root + path.sep);
  const isAsset = relative => {
    const file = path.resolve(root, relative);
    return inside(file) && fs.existsSync(file) && fs.statSync(file).isFile();
  };
  const rewrite = text => text.replace(/(["'`(=])\/codex\/([^"'`)\s<>?#]+)(\?[^"'`)\s<>]*)?/g,
    (whole, quote, relative, query = '') => isAsset(relative) ? quote + prefix + relative + query : whole);
  const fallback = express.static(root, {dotfiles: 'deny', redirect: true});
  return (req, res, next) => {
    const original = req.url;
    if (req.path.startsWith('/_releases/')) {
      const marker = `/_releases/${version}`;
      if (!req.path.startsWith(marker + '/')) return res.status(404).end();
      req.url = req.url.slice(marker.length);
    }
    let relative;
    try { relative = decodeURIComponent(req.path).replace(/^\/+/, '') || 'index.html'; }
    catch { req.url = original; return res.status(400).end(); }
    const file = path.resolve(root, relative);
    if (inside(file) && !relative.split(/[\\/]/).some(part => part.startsWith('.')) && /\.(?:m?js|css|html|webmanifest)$/.test(file) && isAsset(relative)) {
      const content = rewrite(fs.readFileSync(file, 'utf8'));
      req.url = original;
      res.type(path.extname(file)).send(content);
      return;
    }
    fallback(req, res, error => { req.url = original; next(error); });
  };
}
