export const defaultBottomThreshold=100;
export function bottomThreshold(scroller){
 const value=parseFloat(getComputedStyle(scroller||document.documentElement).getPropertyValue('--bottom-threshold'));
 return Number.isFinite(value)?Math.max(0,value):defaultBottomThreshold;
}
export function bottomDistance(scroller){return scroller?Math.max(0,scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight):Infinity;}
export function nearBottom(scroller){return bottomDistance(scroller)<=bottomThreshold(scroller);}
