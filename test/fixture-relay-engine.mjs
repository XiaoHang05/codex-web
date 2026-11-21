import readline from 'node:readline';
if(process.argv.includes('--print-startup-config')){process.stdout.write(JSON.stringify({appServerVersion:'fixture-version',configRequirements:{requirements:null}},null,2)+'\n');process.exit(0);}
const lines=readline.createInterface({input:process.stdin});
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
for await(const line of lines){
 let request;try{request=JSON.parse(line);}catch{continue;}
 if(!request.method||request.id===undefined)continue;
 const params=request.params||{};
 if(request.method==='initialize'){emit({id:request.id,result:{userAgent:'fixture-relay-engine'}});continue;}
 if(request.method==='thread/loaded/list'){emit({id:request.id,result:{data:['fixture']}});continue;}
 if(request.method==='thread/read'){emit({id:request.id,result:{thread:{id:params.threadId,cwd:process.cwd(),status:{type:'idle'},turns:[]}}});continue;}
 if(request.method==='turn/start'){emit({id:request.id,result:{turn:{id:'fixture-turn',status:'completed'}}});continue;}
 emit({id:request.id,result:{}});
}
