import {CodexManager} from './codex.js';
import {ProfileHistory} from './profile-history.js';

// Keep the existing process handles, in-flight requests, approvals and queues.
// Calls made through this view use the extracted implementation. Listeners of
// already-running transports remain owned by their original host until exit.
export function adoptCodexManager(existing, config) {
  if(!existing?.instances)throw Error('An existing Codex manager is required');
  return new Proxy(existing,{
    get(target,key,receiver){
      if(key==='config')return config;
      if(key==='ProfileHistoryClass')return ProfileHistory;
      if(key!=='constructor'&&Object.hasOwn(CodexManager.prototype,key))return Reflect.get(CodexManager.prototype,key,receiver);
      return Reflect.get(target,key,receiver);
    },
  });
}
