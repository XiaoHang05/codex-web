const localImage=/^(?:[a-zA-Z]:[\\/]|\/)[^\r\n\0]*\.(?:png|jpe?g|webp|gif|avif)$/i;
const inlineImage=/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=\r\n]+$/;
function contextKind(text,kind){
  if(kind==='agents_md.instructions'||(/^# AGENTS\.md instructions(?: for [^\r\n]+)?\r?\n/.test(text)&&text.includes('<INSTRUCTIONS>')))return 'instructions';
  if(kind==='environments.environment_context'||/^<environment_context>[\s\S]*<\/environment_context>\s*$/.test(text))return 'environment';
  if(/^<external_codex_apps_open_page>[\s\S]*<\/external_codex_apps_open_page>\s*$/.test(text))return 'page';
  return null;
}
export function userContent(raw,item={}){
  let text=String(raw||'');const images=[],contexts=[];
  if(Array.isArray(item.content)){
    const visible=[];
    for(const [index,part] of item.content.entries()){
      const value=part?.text||part?.inputText;
      if(typeof value!=='string')continue;
      if(/^# AGENTS\.md instructions(?: for [^\r\n]+)?\r?\n/.test(value)&&value.includes('\n<environment_context>')){
        const combined=userContent(value);
        if(combined.contexts.length){contexts.push(...combined.contexts);if(combined.text)visible.push(combined.text);continue;}
      }
      const kind=contextKind(value,item.contentItemKinds?.[index]);
      if(kind)contexts.push({kind,text:value});else visible.push(value);
    }
    if(contexts.length)text=visible.join('\n').trim();
    else if(item.content.some(part=>['image','input_image','localImage'].includes(part?.type))){
      // Images are separate attachments, not empty text paragraphs.
      if(visible.length)text=visible.join('\n');
      else if(!text.trim())text='';
    }
  }else{
    const environment=text.indexOf('\n<environment_context>');
    if(/^# AGENTS\.md instructions(?: for [^\r\n]+)?\r?\n/.test(text)&&environment>=0){
      const instructions=text.slice(0,environment).trim();
      if(contextKind(instructions)==='instructions'){
        contexts.push({kind:'instructions',text:instructions});
        text=text.slice(environment+1);
        const end=text.indexOf('</environment_context>');
        if(end>=0){const value=text.slice(0,end+'</environment_context>'.length);contexts.push({kind:'environment',text:value});text=text.slice(end+'</environment_context>'.length).trim();}
      }
    }
    const page=text.match(/^<external_codex_apps_open_page>[\s\S]*?<\/external_codex_apps_open_page>/);
    if(page){contexts.push({kind:'page',text:page[0]});text=text.slice(page[0].length).trim();}
    if(!contexts.length){const kind=contextKind(text);if(kind){contexts.push({kind,text});text='';}}
  }
  const add=value=>{if(typeof value==='string'&&(localImage.test(value)||inlineImage.test(value))&&!images.includes(value))images.push(value);};
  // Strip only the attachment envelope, never arbitrary headings in user text.
  const request=text.match(/(?:^|\r?\n)## My request:\s*\r?\n/);
  if(/^\s*# Files mentioned by the user:/.test(text)&&request){
    const envelope=text.slice(0,request.index);
    for(const match of envelope.matchAll(/^## [^\r\n]+?: ([^\r\n]+)\r?\nImage attachment: true\s*$/gm))add(match[1].trim());
    if(images.length)text=text.slice(request.index+request[0].length).trim();
  }
  const envelopeImages=[...images];
  for(const part of [...(Array.isArray(item.content)?item.content:[]),...(Array.isArray(item.images)?item.images:[])]){
    if(['image','input_image','localImage'].includes(part.type))add(part.url||(typeof part.image_url==='string'?part.image_url:part.image_url?.url)||part.path);
  }
  // Native history stores both the clipboard path and its embedded image.
  const embedded=images.filter(image=>inlineImage.test(image));
  if(envelopeImages.length&&embedded.length===envelopeImages.length){images.splice(0,images.length,...embedded);}
  return {text,images,contexts};
}
