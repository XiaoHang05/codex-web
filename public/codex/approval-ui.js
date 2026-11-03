import {enumOptions,validatePermissions,validateElicitation} from './request-protocol.js';
const node=(tag,text)=>{const element=document.createElement(tag);if(text!=null)element.textContent=text;return element;};
function actions(panel,submit,notice,choices){const row=node('div');row.className='approval-actions';for(const [title,result]of choices){const button=node('button',title);button.type='button';button.className=title==='拒绝'||title==='取消'?'secondary':'';button.onclick=async()=>{try{const value=result();for(const control of panel.querySelectorAll('button,input,select'))control.disabled=true;await submit(value);panel.remove();}catch(error){for(const control of panel.querySelectorAll('button,input,select'))control.disabled=false;notice(error.message);}};row.append(button);}panel.append(row);}
export function advancedRequest(panel,{data,method,submit,notice}){
 if(method==='item/permissions/requestApproval'){
  panel.querySelector('h3').textContent='申请额外访问权限';panel.querySelector('pre')?.remove();panel.append(node('p',data.reason||'选择本次允许访问的范围，未选择的权限不会授予。'));
  const selections=[];const requested=data.permissions||{};
  const choice=(text,kind,value)=>{const label=node('label');label.className='permission-choice';const input=node('input');input.type='checkbox';input.setAttribute('aria-label',text);label.append(input,node('span',text));panel.append(label);selections.push({input,kind,value});};
  if(requested.network?.enabled)choice('访问网络','network',true);
  for(const kind of ['read','write'])for(const file of requested.fileSystem?.[kind]||[])choice((kind==='read'?'读取：':'写入：')+file,kind,file);
  for(const entry of requested.fileSystem?.entries||[])choice(({read:'读取：',write:'写入：',deny:'禁止访问：'}[entry.access]||'访问：')+(entry.path.path||entry.path.pattern||JSON.stringify(entry.path.value)), 'entries',entry);
  const label=node('label','授权期限');const scope=node('select');scope.setAttribute('aria-label','授权期限');scope.append(new Option('仅本轮任务','turn'),new Option('当前会话后续任务','session'));label.append(scope);panel.append(label);
  actions(panel,submit,notice,[['授权所选范围',()=>{const permissions={};for(const item of selections.filter(row=>row.input.checked)){if(item.kind==='network')permissions.network={enabled:true};else{permissions.fileSystem??={};(permissions.fileSystem[item.kind]??=[]).push(item.value);}}if(permissions.fileSystem?.entries?.length&&requested.fileSystem.globScanMaxDepth!=null)permissions.fileSystem.globScanMaxDepth=requested.fileSystem.globScanMaxDepth;return validatePermissions(data,{permissions,scope:scope.value});}],['拒绝',()=>({permissions:{},scope:'turn'})]]);return true;
 }
 if(method!=='mcpServer/elicitation/request')return false;
 panel.querySelector('h3').textContent='MCP 确认 · '+(data.serverName||'服务');panel.querySelector('pre')?.remove();panel.append(node('p',data.message||'服务正在等待你的确认。'));
 if(data.mode==='url'){
  try{const url=new URL(data.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();const link=node('a','打开验证页面 · '+url.hostname);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';panel.append(link);actions(panel,submit,notice,[['已完成，继续',()=>({action:'accept',content:null})],['拒绝',()=>({action:'decline',content:null})],['取消',()=>({action:'cancel',content:null})]]);}catch{panel.append(node('p','链接格式不受支持，请在原生客户端查看。'));}return true;
 }
 if(data.mode!=='form'){panel.append(node('p','此扩展表单需在原生客户端处理。'));actions(panel,submit,notice,[['拒绝',()=>({action:'decline',content:null})],['取消',()=>({action:'cancel',content:null})]]);return true;}
 const getters=[],schema=data.requestedSchema||{};
 for(const [key,field]of Object.entries(schema.properties||{})){
  const label=node('label',field.title||key);label.className='elicitation-field';const choices=enumOptions(field.type==='array'?field.items||{}:field);let input;
  if(choices){input=node('select');input.multiple=field.type==='array';for(const [index,option]of choices.entries())input.append(new Option(option.title,String(index)));getters.push([key,()=>input.multiple?[...input.selectedOptions].map(option=>choices[Number(option.value)].value):choices[Number(input.value)].value]);}
  else{input=node('input');input.type=field.type==='boolean'?'checkbox':['number','integer'].includes(field.type)?'number':'text';if(input.type==='number'){input.step=field.type==='integer'?'1':'any';if(field.minimum!=null)input.min=field.minimum;if(field.maximum!=null)input.max=field.maximum;}if(field.type==='string'){if(field.minLength!=null)input.minLength=field.minLength;if(field.maxLength!=null)input.maxLength=field.maxLength;}getters.push([key,()=>input.type==='checkbox'?input.checked:input.type==='number'?(input.value===''?undefined:Number(input.value)):input.value===''&&!schema.required?.includes(key)?undefined:input.value]);if(field.default!=null){if(input.type==='checkbox')input.checked=!!field.default;else input.value=field.default;}}
  input.setAttribute('aria-label',field.title||key);label.append(input);if(field.description)label.append(node('small',field.description));panel.append(label);
 }
 actions(panel,submit,notice,[['提交并继续',()=>validateElicitation(data,{action:'accept',content:Object.fromEntries(getters.map(([key,get])=>[key,get()]).filter(([,value])=>value!==undefined))})],['拒绝',()=>({action:'decline',content:null})],['取消',()=>({action:'cancel',content:null})]]);return true;
}
