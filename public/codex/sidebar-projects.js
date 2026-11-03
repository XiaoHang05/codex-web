export function projectListControls(container,collapseButton){
 const expanded=new Set();let search=false;
 function sync(options={}){
  search=options.search??search;
  const projects=[...container.querySelectorAll(':scope>.project')];
  for(const project of projects){
   const body=project.querySelector(':scope>.project-body');if(!body)continue;
   const threads=[...body.querySelectorAll(':scope>.thread')],showAll=expanded.has(project.dataset.project);
   threads.forEach((thread,index)=>{thread.hidden=!search&&!showAll&&index>=5;});
   let more=body.querySelector(':scope>.project-list-more');
   if(!more){more=document.createElement('button');more.type='button';more.className='project-list-more';body.append(more);more.onclick=()=>{const key=project.dataset.project;if(expanded.has(key))expanded.delete(key);else expanded.add(key);sync();};}
   more.textContent=showAll?'展示更少':'展开全部';more.setAttribute('aria-expanded',String(showAll));more.hidden=!!search||threads.length<=5;
  }
  collapseButton.disabled=!projects.length;
 }
 collapseButton.onclick=()=>{
  const projects=[...container.querySelectorAll(':scope>.project')];
  for(const project of projects)project.open=false;
  try{localStorage.setItem('codex-collapsed-projects',JSON.stringify(projects.map(project=>project.dataset.project)));}catch{}
 };
 return {sync};
}
