// Device codes stay in memory and belong to exactly one Web profile.
export function loginFlow({rpc,currentProfile,container,loginButton,logoutButton}){
  const pending=new Map(),busy=new Set(),epochs=new Map();
  function paint(){
    const id=currentProfile(),row=pending.get(id);container.replaceChildren();
    loginButton.disabled=loginButton.dataset.providerDisabled==='true'||busy.has(id)||!!row;
    logoutButton.disabled=busy.has(id)||!!row;
    if(!row)return;
    const link=document.createElement(row.verificationUrl?'a':'span');if(row.verificationUrl){link.href=row.verificationUrl;link.target='_blank';link.rel='noopener';}link.textContent=row.verificationUrl?'打开 OpenAI 验证页面':'此配置仍有登录正在进行，可取消后重新登录。';
    const code=document.createElement('strong');code.textContent=row.userCode?' 验证码：'+row.userCode:'';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='取消登录';cancel.disabled=busy.has(id);
    cancel.onclick=async()=>{busy.add(id);paint();try{await rpc('account/login/cancel',{loginId:row.loginId},id);pending.delete(id);}catch(error){container.dispatchEvent(new CustomEvent('login-error',{detail:error.message}));}finally{busy.delete(id);paint();}};
    container.append(link,code,document.createTextNode(' '),cancel);
  }
  return {paint,sync(id,runtime){if(!busy.has(id)&&runtime?.authPending&&runtime.loginId&&!pending.has(id))pending.set(id,{loginId:runtime.loginId});paint();},completed(id){epochs.set(id,(epochs.get(id)||0)+1);pending.delete(id);paint();},async start(){const id=currentProfile();if(busy.has(id)||pending.has(id))return;const epoch=epochs.get(id)||0;busy.add(id);paint();try{const row=await rpc('account/login/start',{type:'chatgptDeviceCode'},id);if((epochs.get(id)||0)===epoch)pending.set(id,row);}finally{busy.delete(id);paint();}}};
}
