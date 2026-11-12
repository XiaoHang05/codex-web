import path from 'node:path';
import {createHash} from 'node:crypto';
import {dataRoot,readJson,writeJson} from './storage.js';
export const messageEditDirectory=scope=>path.join(dataRoot,'message-edits',createHash('sha256').update(scope).digest('hex'));
export function replacedMessageTurns(scope){return readJson(path.join(messageEditDirectory(scope),'replaced-turns.json'),[]);}
export function recordMessageRevert(ctx,target,turnId){
 const ids=[...new Set([...replacedMessageTurns(target.scope),turnId])];
 writeJson(path.join(messageEditDirectory(target.scope),'replaced-turns.json'),ids);
 ctx.codex.emit?.('message-edited',{scope:target.scope,replacedTurnId:turnId});
}
