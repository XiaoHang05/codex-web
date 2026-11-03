export function desktopComposerSettings(state={}){
 const settings=state.latestThreadSettings||{},mode=state.latestCollaborationMode?.mode||settings.collaborationMode?.mode;
 const profile=settings.permissions||settings.activePermissionProfile?.id||state.activePermissionProfile?.id;
 const access=({':read-only':'read-only',':workspace':'workspace-write',':danger-full-access':'full-access'})[profile]||({readOnly:'read-only',workspaceWrite:'workspace-write',dangerFullAccess:'full-access'})[settings.sandboxPolicy?.type];
 const approval=settings.approvalPolicy==='never'?'never':settings.approvalsReviewer==='auto_review'?'automatic':settings.approvalsReviewer==='user'?'manual':undefined;
 return {mode:['plan','default'].includes(mode)?mode:undefined,serviceTier:settings.serviceTier,access,approval,granular:typeof settings.approvalPolicy==='object'&&settings.approvalPolicy!==null};
}
