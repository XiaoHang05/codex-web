import fs from 'node:fs/promises';
import path from 'node:path';
// Read resolved native configuration; expose only the two composer values.
export async function modelSettings(manager,id,cwd){
 const instance=await manager.start(id);
 const response=await manager.call(instance,'config/read',{includeLayers:false,cwd:cwd||instance.profile?.cwd||null});
 const config=response.config||{};
 return {model:config.model||instance.profile?.model||null,effort:config.model_reasoning_effort??null};
}
export async function desktopModelCatalog(home){
 let cache;try{cache=JSON.parse(await fs.readFile(path.join(home,'models_cache.json'),'utf8'));}catch{return {data:[]};}
 return {data:(cache.models||[]).filter(model=>typeof model.slug==='string').map(model=>({
  model:model.slug,displayName:model.display_name||model.slug,hidden:model.visibility==='hide',
  defaultReasoningEffort:model.default_reasoning_level,
  supportedReasoningEfforts:(model.supported_reasoning_levels||[]).map(level=>({reasoningEffort:level.effort,description:level.description})),
  additionalSpeedTiers:model.additional_speed_tiers||[],
 }))};
}
