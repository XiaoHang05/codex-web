import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export let dataRoot = path.resolve(process.env.CODEX_WEB_DATA_DIR || path.join(packageRoot, '.local', 'data'));
export let projectRoot = path.resolve(process.env.CODEX_WEB_WORKSPACE || path.join(packageRoot, '.local', 'workspace'));
let configured = false;

// One runtime per module graph/process. Embedders supply their existing paths;
// no path is inferred from an enclosing application or a user's home directory.
export function configurePaths({dataDirectory = dataRoot, workspaceDirectory = projectRoot} = {}) {
  const nextData = path.resolve(dataDirectory), nextWorkspace = path.resolve(workspaceDirectory);
  if (configured && (nextData !== dataRoot || nextWorkspace !== projectRoot)) throw Error('A runtime with different storage paths already exists in this process');
  dataRoot = nextData; projectRoot = nextWorkspace; configured = true;
  return {dataDirectory: dataRoot, workspaceDirectory: projectRoot};
}
export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', {mode:0o600});
  fs.renameSync(temporary, file);
}
export function fault(message, status = 400) { return Object.assign(new Error(message), {status}); }
export function safeId(value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(value || '')) throw fault('Invalid profile identifier');
  return value;
}
export function loadConfig() {
  fs.mkdirSync(projectRoot, {recursive:true});
  const file = path.join(dataRoot, 'config.json');
  const defaults = {profiles:[{id:'default',name:'Codex',provider:'chatgpt',model:'',cwd:projectRoot}],desktop:{enabled:false}};
  const config = {...defaults, ...readJson(file, {})};
  if (!fs.existsSync(file)) writeJson(file, config);
  return {config, save:()=>writeJson(file, config)};
}
