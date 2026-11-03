import test from 'node:test';
import assert from 'node:assert/strict';
import {appearanceFields,normalizeAppearance,updateAppearance} from '../public/codex/appearance.js';

test('legacy appearance migrates to shared tiers while retaining widths and chosen sizes',()=>{
 const next=normalizeAppearance({fontSize:18,workFontSize:15,lineHeight:1.5,workRecordSpacing:7,paragraphSpacing:5,blockSpacing:16,userReplySpacing:32,columnWidth:900,userMessageWidth:650});
 assert.deepEqual(next,{fontSize:18,workFontSize:15,metaFontSize:11,gapTight:9,gapCompact:7,gapNormal:16,gapSection:32,columnWidth:900,userMessageWidth:650,workVisibleRows:7,bottomThreshold:100,sidebarLongPressMs:550});
 assert.equal(normalizeAppearance({...next,lineGap:64,blockSpacing:64}).gapNormal,16);
});
test('updating one tier preserves the rest and removes obsolete per-case settings',()=>{
 const next=updateAppearance({fontSize:17,lineGap:6,paragraphSpacing:9,userReplySpacing:30},{gapCompact:0});
 assert.equal(next.fontSize,17);assert.equal(next.workFontSize,16);assert.equal(next.gapTight,6);assert.equal(next.gapNormal,9);assert.equal(next.gapSection,30);assert.equal(next.gapCompact,0);
 assert.deepEqual(Object.keys(next),appearanceFields.map(field=>field.key));
});
test('shared settings schema validates integer ranges and rejects obsolete or unknown fields',()=>{
 for(const field of appearanceFields){
  assert.equal(updateAppearance({}, {[field.key]:field.min})[field.key],field.min);
  assert.equal(updateAppearance({}, {[field.key]:field.max})[field.key],field.max);
  for(const invalid of [field.min-1,field.max+1,12.5,'12',null])assert.throws(()=>updateAppearance({}, {[field.key]:invalid}));
 }
 for(const value of [{blockSpacing:12},{lineHeight:1.6},{unknown:4},null,[]])assert.throws(()=>updateAppearance({},value));
});
