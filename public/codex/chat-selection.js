// Resolve a saved view without choosing another account's matching native ID.
export function savedChat(rows,{threadId,key,profile,mode,principal}={}){
 const matches=rows.filter(row=>row.threadId===threadId&&(!principal||row.principal===principal)&&
   (mode==='desktop'?row.sources.includes('desktop'):mode==='web'||profile?row.sources.includes(`web:${profile}`):true));
 if(key)return matches.find(row=>row.key===key)||null;
 return matches.length===1?matches[0]:null;
}
