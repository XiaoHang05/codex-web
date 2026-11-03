import {EventEmitter} from 'node:events';
import {fault} from './storage.js';

// A disabled adapter never imports desktop code or touches a desktop home/pipe.
export function disabledDesktop() {
  const desktop=new EventEmitter();
  Object.assign(desktop,{states:new Map(),owners:new Map(),manualFollow:new Set(),close(){}});
  for(const name of ['connect','follow','control']) desktop[name]=async()=>{throw fault('桌面共享未启用',409);};
  return {desktop,history:{files:new Map(),list:()=>[],read:async()=>{throw fault('桌面共享未启用',409);}}};
}
