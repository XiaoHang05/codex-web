import test from 'node:test';
import assert from 'node:assert/strict';
import {groupProjectRows,projectIdentity,projectSetting,projectSettingKey,normalizeProjectDirectory} from '../public/codex/project-path.js';

test('Windows directory case, separators and trailing slash share one project',()=>{
 const paths=['e:\\agent_temp_workspace','E:\\agent_temp_workspace','E:/AGENT_TEMP_WORKSPACE/'];
 const rows=paths.map((cwd,index)=>({cwd,threadId:String(index)}));
 assert.equal(groupProjectRows(rows).size,1);
 assert.deepEqual([...groupProjectRows(rows).values()][0],rows);
 assert.equal(rows[1].cwd,paths[1]);
 assert.equal(projectIdentity('\\\\Server\\Share\\Folder'),projectIdentity('//server/share/folder/'));
});
test('different directories and case-sensitive POSIX projects stay separate',()=>{
 assert.equal(groupProjectRows([{cwd:'E:\\one'},{cwd:'E:\\two'},{cwd:'/home/Project'},{cwd:'/home/project'}]).size,4);
});
test('existing order, labels and pin keys remain usable across Windows spellings',()=>{
 const old='e:\\agent_temp_workspace',cwd='E:\\agent_temp_workspace';
 const rows=[{cwd,threadId:'web'},{cwd:old,threadId:'desktop'}];
 assert.deepEqual([...groupProjectRows(rows,[old]).keys()],[old]);
 assert.equal(projectSetting({[old]:'名称'},cwd),'名称');
 assert.equal(projectSetting({[old]:true},cwd),true);
 assert.equal(projectSettingKey({[old]:true},cwd),old);
 assert.equal(projectIdentity(old),projectIdentity(cwd));
});
test('missing project directories still group together',()=>{
 assert.equal(groupProjectRows([{},{}]).get('未指定项目').length,2);
});
test('new Windows directories uppercase only the drive letter, preserving folder names',()=>{
 for(const drive of ['c','d','e'])assert.equal(normalizeProjectDirectory(`${drive}:\\MyProject\\资料`),`${drive.toUpperCase()}:\\MyProject\\资料`);
 assert.equal(normalizeProjectDirectory('e:/MyProject'),'E:/MyProject');
 assert.equal(normalizeProjectDirectory('/home/MyProject'),'/home/MyProject');
 assert.equal(normalizeProjectDirectory('\\\\Server\\Share'),'\\\\Server\\Share');
 assert.equal(projectIdentity(normalizeProjectDirectory('e:\\MyProject')),projectIdentity('e:\\MyProject'));
});
