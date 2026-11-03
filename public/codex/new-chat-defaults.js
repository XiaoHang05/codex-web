export function speedTiers(model){return model?.serviceTiers?.length?model.serviceTiers:(model?.additionalSpeedTiers||[]).map(id=>({id}));}
export function defaultSpeed(defaults,model){
 if(defaults.speed==='default')return 'default';
 if(defaults.speed==='fast')return speedTiers(model).find(tier=>['fast','priority'].includes(tier.id))?.id||'default';
}
export function defaultModelSettings(native,defaults){
 return {model:defaults.model||native.model,effort:Object.hasOwn(defaults,'effort')?defaults.effort:(defaults.model&&defaults.model!==native.model?null:native.effort)};
}
export function newChatDefaultsUI($){
 const fields=$('default-access').closest('.settings-fields');
 for(const [id,title]of [['default-model','默认模型'],['default-effort','默认推理强度'],['default-speed','默认加速']]){
  const label=document.createElement('label'),select=document.createElement('select');label.textContent=title;select.id=id;label.append(select);fields.append(label);
 }
 let models=[],native={},saved={};
 function dependent(){
  const model=models.find(entry=>entry.model===($('default-model').value||native.model))||models.find(entry=>entry.isDefault)||models[0];
  const effort=$('default-effort'),previous=effort.value;effort.replaceChildren(new Option('使用模型默认',''));
  for(const level of model?.supportedReasoningEfforts||[]){const id=typeof level==='string'?level:level.reasoningEffort;effort.append(new Option(id,id));}
  effort.value=[...effort.options].some(option=>option.value===previous)?previous:'';
  const speed=$('default-speed'),prior=speed.value;speed.replaceChildren(new Option('继承原生默认','inherit'),new Option('标准速度','default'));
  if(speedTiers(model).some(tier=>['fast','priority'].includes(tier.id)))speed.append(new Option('快速模式（可能增加用量）','fast'));
  speed.value=[...speed.options].some(option=>option.value===prior)?prior:'inherit';
 }
 $('default-model').onchange=dependent;
 return {
  paint(entries,settings,defaults){models=entries;native=settings||{};saved=defaults;const select=$('default-model');select.replaceChildren(new Option('继承原生默认',''));
   for(const entry of models.filter(entry=>!entry.hidden||entry.model===saved.model))select.append(new Option(entry.displayName||entry.model,entry.model));
   if(saved.model&&!models.some(entry=>entry.model===saved.model))select.append(new Option(saved.model,saved.model));
   select.value=saved.model||'';dependent();$('default-effort').value=saved.effort||'';if(!$('default-effort').value)$('default-effort').value='';$('default-speed').value=saved.speed||'inherit';
   if(!$('default-speed').value)$('default-speed').value='inherit';
  },
  value(){return {model:$('default-model').value||null,effort:$('default-effort').value||null,speed:$('default-speed').value};},
 };
}
