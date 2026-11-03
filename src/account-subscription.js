import path from 'node:path';
import {readJson,fault} from './storage.js';

const namespace='https://api.openai.com/auth';
function claims(token){
 try{if(typeof token!=='string'||token.length>64000)return null;const parts=token.split('.');if(parts.length!==3)return null;return JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));}catch{return null;}
}
function timestamp(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;}
// Read the native login snapshot; never relay credentials or use JWT exp as
// a subscription expiry. These claims are display data, not authorization.
export function subscriptionSnapshot(auth){
 const id=claims(auth?.tokens?.id_token),access=claims(auth?.tokens?.access_token),info=id?.[namespace];
 const unavailable={available:false,source:'login',activeStart:null,activeUntil:null,lastChecked:null,planType:null};
 if(!info||!auth.tokens.account_id||info.chatgpt_account_id!==auth.tokens.account_id)return unavailable;
 if(access&&(access.sub!==id.sub||access[namespace]?.chatgpt_account_id!==info.chatgpt_account_id))return unavailable;
 const activeStart=timestamp(info.chatgpt_subscription_active_start),activeUntil=timestamp(info.chatgpt_subscription_active_until);
 if(!activeStart||!activeUntil||Date.parse(activeUntil)<=Date.parse(activeStart))return unavailable;
 return {available:true,source:'login',activeStart,activeUntil,lastChecked:timestamp(info.chatgpt_subscription_last_checked),planType:typeof info.chatgpt_plan_type==='string'?info.chatgpt_plan_type.slice(0,80):null};
}
export async function accountSubscription(req,res,ctx){
 const match=req.path.match(/^\/api\/account-subscription\/([a-zA-Z0-9_-]{1,48})$/);if(!match)return false;
 if(req.method!=='GET')throw fault('套餐信息仅支持读取',405);
 const profile=ctx.codex.profile(match[1]);res.set('Cache-Control','no-store');
 if(profile.provider!=='chatgpt'){res.json({available:false,source:'api'});return true;}
 let auth;try{auth=readJson(path.join(ctx.codex.home(profile.id),'auth.json'),{});}catch{auth={};}
 res.json(subscriptionSnapshot(auth));return true;
}
