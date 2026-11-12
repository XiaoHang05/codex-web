import {Desktop,principal} from './desktop.js';
import {desktopReadOnly} from './desktop-access.js';
import {threadPrincipals} from '../../src/account-identity.js';
import {desktopTurns} from '../../public/codex/desktop-turn-state.js';
import {lastMessageEdit} from '../../public/codex/message-edit-state.js';
import {fault} from '../../src/storage.js';

export async function editDesktopMessage(desktop,threadId,{turnId,message}){
 if(desktopReadOnly(threadId))throw fault('此聊天只读',403);
 const creator=threadPrincipals(desktop.accountHome).get(threadId);
 if(creator&&creator!==principal(desktop.accountHome))throw fault('请切换回聊天所属账号',409);
 await desktop.follow(threadId);
 const state=desktop.states.get(threadId),latest=lastMessageEdit(desktopTurns(state));
 if(!latest.editable||latest.turnId!==turnId||['active','running','inProgress','busy'].includes(state?.threadRuntimeStatus?.type)||(state?.requests||[]).some(request=>request.completed!==true&&request.request?.completed!==true))throw fault('会话状态已变化，请刷新后重新修改',409);
 // Reuse the existing socket and owner, with this release's explicit protocol list.
 // The host's already-running Desktop object can predate this new operation.
 return Desktop.prototype.request.call(desktop,'thread-follower-edit-last-user-turn',{
  conversationId:threadId,turnId,message,allowEarlierMessages:false,shouldSendPermissionOverrides:false,
 },true,desktop.owners.get(threadId));
}
