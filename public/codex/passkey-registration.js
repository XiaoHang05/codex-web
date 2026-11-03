// Prepare the challenge before the click so system UI keeps the user gesture.
export function createPasskeyRegistration({requestOptions,startRegistration,now=Date.now}) {
  let ready=null,pending=null;
  function prepare() {
    if(pending)return pending;
    ready=null;
    pending=Promise.resolve().then(requestOptions).then(options=>{
      const optionsJSON={...options,user:{...options.user,displayName:options.user.displayName||options.user.name}};
      // Prefer ES256/RS256 while retaining only algorithms offered by the server.
      // Keep EdDSA available for authenticators that require it.
      const priority=new Map([[-7,0],[-257,1],[-8,2]]);
      if(options.pubKeyCredParams)optionsJSON.pubKeyCredParams=[...options.pubKeyCredParams].sort((a,b)=>(priority.get(a.alg)??3)-(priority.get(b.alg)??3));
      ready={optionsJSON,expires:now()+180000};
    }).finally(()=>{pending=null;});
    return pending;
  }
  function register() {
    if(!ready||ready.expires<=now()) {
      throw new Error('注册准备已过期或尚未完成，请重新准备后再点击添加通行密钥。');
    }
    const {optionsJSON}=ready;
    ready=null;
    // This call must run synchronously in the button's native click handler.
    return startRegistration({optionsJSON});
  }
  return {prepare,register};
}
