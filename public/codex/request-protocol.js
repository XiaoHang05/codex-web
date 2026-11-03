const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>{if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('响应含不支持的字段');};
const equal=(a,b)=>{if(a===b)return true;if(!object(a)||!object(b))return false;const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();return JSON.stringify(ka)===JSON.stringify(kb)&&ka.every(key=>equal(a[key],b[key]));};

export function validatePermissions(data,result){
 keys(result,['permissions','scope']);if(result.scope!==undefined&&!['turn','session'].includes(result.scope))fail('无效授权期限');
 keys(result.permissions,['network','fileSystem']);const requested=data.permissions||{},granted=result.permissions;
 if(granted.network!=null){keys(granted.network,['enabled']);if(typeof granted.network.enabled!=='boolean')fail('无效网络权限');if(granted.network.enabled&&requested.network?.enabled!==true)fail('不能授予未申请的网络权限');}
 if(granted.fileSystem!=null){keys(granted.fileSystem,['read','write','entries','globScanMaxDepth']);const source=requested.fileSystem||{};
  for(const kind of ['read','write','entries'])if(granted.fileSystem[kind]!=null){const selected=granted.fileSystem[kind];if(!Array.isArray(selected)||selected.some(row=>!(source[kind]||[]).some(original=>equal(original,row))))fail('不能授予未申请的文件权限');}
  if(granted.fileSystem.globScanMaxDepth!==undefined&&granted.fileSystem.globScanMaxDepth!==source.globScanMaxDepth)fail('不能修改申请中的扫描范围');
 }
 return result;
}

export function enumOptions(schema){const options=schema.oneOf||schema.anyOf;return Array.isArray(schema.enum)?schema.enum.map((value,index)=>({value,title:schema.enumNames?.[index]||String(value)})):Array.isArray(options)&&options.every(row=>Object.hasOwn(row,'const'))?options.map(row=>({value:row.const,title:row.title||String(row.const)})):null;}
function validateValue(schema,value,label){
 const choices=enumOptions(schema);if(choices){if(!choices.some(option=>option.value===value))fail(label+'：请选择有效选项');return;}
 if(schema.type==='array'){if(!Array.isArray(value))fail(label+'：需要多选内容');if(schema.minItems!=null&&value.length<schema.minItems||schema.maxItems!=null&&value.length>schema.maxItems)fail(label+'：选项数量不符合要求');for(const item of value)validateValue(schema.items||{},item,label);return;}
 if(schema.type==='boolean'){if(typeof value!=='boolean')fail(label+'：需要是或否');return;}
 if(['number','integer'].includes(schema.type)){if(typeof value!=='number'||!Number.isFinite(value)||schema.type==='integer'&&!Number.isInteger(value))fail(label+'：需要有效数字');if(schema.minimum!=null&&value<schema.minimum||schema.maximum!=null&&value>schema.maximum)fail(label+'：数字超出范围');return;}
 if(schema.type==='string'){if(typeof value!=='string')fail(label+'：需要文字');if(schema.minLength!=null&&value.length<schema.minLength||schema.maxLength!=null&&value.length>schema.maxLength)fail(label+'：文字长度不符合要求');return;}
 fail(label+'：暂不支持此表单类型，请在原生客户端处理');
}
export function validateElicitation(data,result){
 keys(result,['action','content']);if(!['accept','decline','cancel'].includes(result.action))fail('无效确认操作');
 if(result.action!=='accept'){if(result.content!=null)fail('拒绝或取消时不能提交内容');return result;}
 if(data.mode==='url'){if(result.content!=null)fail('链接确认不能附带表单');return result;}
 if(data.mode!=='form')fail('扩展表单请在原生客户端处理');const schema=data.requestedSchema;
 if(schema?.type!=='object'||!object(schema.properties))fail('不支持的表单结构');if(!object(result.content))fail('缺少表单内容');
 for(const key of schema.required||[])if(!Object.hasOwn(result.content,key))fail('请填写 '+(schema.properties[key]?.title||key));
 for(const [key,value]of Object.entries(result.content)){if(!Object.hasOwn(schema.properties,key))fail('表单含未申请的字段');validateValue(schema.properties[key],value,schema.properties[key].title||key);}
 return result;
}
