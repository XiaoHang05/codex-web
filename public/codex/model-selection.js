import {desktopTurns} from './desktop-turn-state.js';
const value=text=>typeof text==='string'&&text.trim()?text.trim():null;
export function currentModelSettings(state={}){
 const settings=state.latestThreadSettings||{},thread=state.thread||{},web=thread.webModelSettings||state.webModelSettings;
 const turn=desktopTurns(state).at(-1),params=turn?.params||{};
 return {
  model:value(settings.model)||value(state.latestModel)||value(web?.model)||value(state.model)||value(thread.model)||value(params.model),
  effort:settings.effort!==undefined?settings.effort:Object.hasOwn(state,'latestReasoningEffort')?state.latestReasoningEffort:web&&Object.hasOwn(web,'effort')?web.effort:Object.hasOwn(state,'reasoningEffort')?state.reasoningEffort:thread.reasoningEffort??params.effort??params.collaborationMode?.settings?.reasoning_effort??null,
 };
}
export function resolveModelSelection(models,defaults={},actual={},choice={}){
 const model=value(choice.model)||value(actual.model)||value(defaults.model)||models.find(entry=>entry.isDefault)?.model||models[0]?.model||'';
 const metadata=models.find(entry=>entry.model===model);
 const efforts=[...new Set((metadata?.supportedReasoningEfforts||[]).map(entry=>typeof entry==='string'?entry:entry.reasoningEffort).filter(Boolean))];
 const preferred=choice.effort??(model===actual.model?actual.effort:null)??(!defaults.model||model===defaults.model?defaults.effort:null)??metadata?.defaultReasoningEffort;
 const effort=efforts.includes(preferred)?preferred:efforts.includes(metadata?.defaultReasoningEffort)?metadata.defaultReasoningEffort:'';
 // A native current value is still informative if its model is absent from
 // this catalog. Do not invent a supported effort list for an unknown model.
 const verified=!metadata&&model===actual.model?value(actual.effort):null;
 return {model,metadata,efforts,effort:effort||verified||'',reasoningKnown:!!metadata};
}
export function composerModelSelection(modelSelect,effortSelect){
 let models=[],defaults={},actual={},choice={},waiting=false;
 function paint(){
  const resolved=resolveModelSelection(models,defaults,actual,choice);
  modelSelect.replaceChildren();effortSelect.replaceChildren();
  if(waiting){modelSelect.append(new Option('读取模型…',''));effortSelect.append(new Option('读取推理等级…',''));modelSelect.disabled=effortSelect.disabled=true;}
  else{
   for(const entry of models.filter(entry=>!entry.hidden||entry.model===resolved.model))modelSelect.append(new Option(entry.displayName||entry.model,entry.model));
   if(resolved.model&&!models.some(entry=>entry.model===resolved.model))modelSelect.append(new Option(resolved.model,resolved.model));
   if(!resolved.model)modelSelect.append(new Option('模型信息未提供',''));
   modelSelect.value=resolved.model;modelSelect.disabled=!resolved.model;
   for(const effort of resolved.efforts)effortSelect.append(new Option(effort,effort));
   if(resolved.effort&&!resolved.efforts.includes(resolved.effort))effortSelect.append(new Option(resolved.effort,resolved.effort));
   if(!resolved.effort)effortSelect.prepend(new Option(resolved.efforts.length?'请选择推理等级':resolved.reasoningKnown?'不支持调整推理等级':'推理信息未提供',''));
   effortSelect.value=resolved.effort;effortSelect.disabled=!resolved.efforts.length;
  }
  modelSelect.syncAppearance?.();effortSelect.syncAppearance?.();
 }
 return {
  reset(pending=false){actual={};choice={};waiting=pending;paint();},
  catalog(entries,settings){models=entries;defaults=settings||{};paint();},
  actual(state){const next=currentModelSettings(state);if(!next.model)return false;const changed=next.model!==actual.model||next.effort!==actual.effort;const repaint=changed||waiting;if(choice.model&&next.model===choice.model&&(choice.effort==null||next.effort===choice.effort))choice={};actual=next;waiting=false;if(repaint)paint();return changed;},
  chooseModel(model){choice={model,effort:effortSelect.value||null};const resolved=resolveModelSelection(models,defaults,actual,choice);choice.effort=resolved.effort||null;paint();},
  chooseEffort(effort){choice={...choice,model:modelSelect.value,effort};paint();},
  restore(composer){choice={model:composer.model||null,effort:composer.reasoning||null};paint();},
  refresh:paint,
 };
}
