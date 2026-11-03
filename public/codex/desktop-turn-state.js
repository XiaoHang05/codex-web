// entitiesByKey is a lookup table; islands/entries carry the actual timeline.
export function desktopTurns(state){
 const history=state?.turnHistory?.history;
 if(history?.entitiesByKey){
  if(Array.isArray(history.islands))return history.islands.flatMap(island=>(island.entries||[]).map(entry=>history.entitiesByKey[entry.value]).filter(Boolean));
  return Object.values(history.entitiesByKey);
 }
 return state?.turns||[];
}
export function activeDesktopTurn(state){const active=[...new Set(desktopTurns(state).filter(turn=>turn?.status==='inProgress'&&typeof(turn.turnId||turn.id)==='string').map(turn=>turn.turnId||turn.id))];return active.length===1?active[0]:null;}
