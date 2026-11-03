// One schema for settings, persistence, migration, and conversation CSS tokens.
export const appearanceFields=[
 {key:'fontSize',id:'font-size',group:'fonts',label:'正文',hint:'消息、正文与输入框',min:10,max:32,default:14,css:'--chat-font-size'},
 {key:'workFontSize',id:'work-font-size',group:'fonts',label:'工作',hint:'轮次标题、工作标题和明细',min:10,max:32,default:13,css:'--work-font-size'},
 {key:'metaFontSize',id:'meta-font-size',group:'fonts',label:'辅助',hint:'时间、注释和操作文字',min:9,max:24,default:11,css:'--meta-font-size'},
 {key:'gapTight',id:'gap-tight',group:'spacing',label:'行内',hint:'正文和工作文字的上下行距',min:0,max:64,default:4,css:'--space-tight'},
 {key:'gapCompact',id:'gap-compact',group:'spacing',label:'紧凑',hint:'工作标题之间、标题与明细之间',min:0,max:64,default:8,css:'--space-compact'},
 {key:'gapNormal',id:'gap-normal',group:'spacing',label:'标准',hint:'段落、工作与正文、轮次标题与内容',min:0,max:64,default:12,css:'--space-normal'},
 {key:'gapSection',id:'gap-section',group:'spacing',label:'分段',hint:'用户消息与回复、相邻轮次',min:0,max:64,default:24,css:'--space-section'},
 {key:'columnWidth',id:'column-width',group:'widths',label:'聊天列宽',min:480,max:1440,default:780,css:'--chat-column-width'},
 {key:'userMessageWidth',id:'user-message-width',group:'widths',label:'发送消息最大宽度',min:120,max:1440,default:560,css:'--user-message-width'},
 {key:'workVisibleRows',id:'work-visible-rows',group:'work',label:'工作记录可见条数',hint:'超过后在记录区域内滚动',min:1,max:50,default:7,css:'--work-visible-rows',unit:'条',cssUnit:''},
 {key:'bottomThreshold',id:'bottom-threshold',group:'work',label:'底部范围',hint:'展开收起方向、工作列表初始位置、回到底部按钮及手机键盘跟随共用',min:0,max:1000,default:100,css:'--bottom-threshold'},
 {key:'sidebarLongPressMs',id:'sidebar-long-press',group:'gestures',label:'侧栏长按时长',hint:'按住达到时长后，原地松手打开菜单，移动则拖动项目',min:200,max:3000,default:550,css:'--sidebar-long-press-ms',cssUnit:'',unit:'秒',inputScale:1000,inputStep:0.05},
];
export function normalizeAppearance(value={}){
 const old=value||{};
 const migrated={...old,
  workFontSize:old.workFontSize??Math.max(10,(old.fontSize??14)-1),
  gapTight:old.gapTight??old.lineGap??(old.lineHeight!=null?Math.round((old.lineHeight-1)*(old.fontSize??14)):undefined),
  gapCompact:old.gapCompact??old.workRecordSpacing??old.blockSpacing,
  gapNormal:old.gapNormal??old.blockSpacing??old.paragraphSpacing,
  gapSection:old.gapSection??old.userReplySpacing,
 };
 return Object.fromEntries(appearanceFields.map(field=>{const n=migrated[field.key];return [field.key,Number.isInteger(n)&&n>=field.min&&n<=field.max?n:field.default];}));
}
export function updateAppearance(current,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('无效显示设置');
 const fields=new Map(appearanceFields.map(field=>[field.key,field]));
 for(const [key,value]of Object.entries(patch)){
  const field=fields.get(key);
  if(!field||!Number.isInteger(value)||value<field.min||value>field.max)throw Error('无效显示设置');
 }
 return {...normalizeAppearance(current),...patch};
}
export function applyAppearanceStyles(element,value){
 const appearance=normalizeAppearance(value);
 for(const field of appearanceFields)element.style.setProperty(field.css,appearance[field.key]+(field.cssUnit??'px'));
 element.dispatchEvent?.(new Event('appearancechange',{bubbles:true}));
 return appearance;
}
export function mountAppearanceSettings(root){
 for(const field of appearanceFields){
  const label=root.createElement('label');label.htmlFor=field.id;
  const title=root.createElement('span');title.textContent=field.label;
  const box=root.createElement('span');box.className='pixel-input';
  const input=root.createElement('input');input.id=field.id;input.type='number';input.min=field.min/(field.inputScale||1);input.max=field.max/(field.inputScale||1);input.step=field.inputStep||1;
  const unit=root.createElement('span');unit.textContent=field.unit??'px';box.append(input,unit);label.append(title,box);
  if(field.hint){const hint=root.createElement('small');hint.textContent=field.hint;label.append(hint);}
  root.querySelector(`[data-appearance="${field.group}"]`).append(label);
 }
}
