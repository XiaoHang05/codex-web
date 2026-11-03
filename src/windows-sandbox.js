import {fault} from './storage.js';
export async function windowsSandbox(req,res,ctx){
 const match=req.path.match(/^\/api\/windows-sandbox\/([a-zA-Z0-9_-]{1,48})\/setup$/);if(!match)return false;
 if(req.method!=='POST')throw fault('请在运行设置中主动配置 Windows 沙箱',405);
 if(req.body?.confirmation!=='configure-and-restart-web-instance')throw fault('请确认配置沙箱并重启此网页实例');
 res.json(await ctx.codex.setupSandbox(match[1],req.body.mode));return true;
}
