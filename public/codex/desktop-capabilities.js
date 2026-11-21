export function limitedDesktop(selected,capabilities){return selected?.mode==='desktop'&&capabilities?.transport==='app-tools-v1';}
export function relayDesktop(selected,capabilities){return selected?.mode==='desktop'&&capabilities?.transport==='stdio-relay-v1';}
export function desktopFeatureAvailable(selected,capabilities,feature){return selected?.mode!=='desktop'||capabilities?.[feature]!==false;}
export const limitedDesktopReason='新版桌面仅支持读取和空闲时发送文字；停止、插话、审批、排队、设置及图片请在 App 中操作';
export function desktopCommandSupported(name){return !['sketch','archive','archives','stop','model','reasoning','fast','permissions','approvals','plan','agent','compact','skills'].includes(name);}
