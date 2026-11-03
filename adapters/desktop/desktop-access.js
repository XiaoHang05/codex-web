import path from 'node:path';
import {dataRoot,readJson} from '../../src/storage.js';

// Only explicit, persisted user exceptions lift the management-chat guard.
// This does not relax account ownership, authentication, CSRF or approvals.
export function desktopReadOnly(threadId,{protectedThread=process.env.CODEX_THREAD_ID,directory=dataRoot}={}){
 if(threadId!==protectedThread)return false;
 const policy=readJson(path.join(directory,'desktop-access.json'),{});
 return !Array.isArray(policy.unlockedThreads)||!policy.unlockedThreads.includes(threadId);
}
