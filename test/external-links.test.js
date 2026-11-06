import test from 'node:test';
import assert from 'node:assert/strict';
import {externalLinkURL} from '../public/codex/external-links.js';
const base='https://chat.example:8443/codex/';
test('external previews leave local routes and non-web or credential-bearing URLs untouched',()=>{
  for(const value of ['/codex/','/codex-api/v1/file','#message','javascript:alert(1)','data:text/html,hello','file:///private','mailto:user@example.test','https://user:secret@news.example/','http://user@news.example/'])assert.equal(externalLinkURL(value,base),null,value);
});
test('external previews preserve web query strings, fragments and protocol-relative links',()=>{
  assert.equal(externalLinkURL('https://news.example/story?q=a%20b#section',base).href,'https://news.example/story?q=a%20b#section');
  assert.equal(externalLinkURL('//news.example/story',base).href,'https://news.example/story');
  assert.equal(externalLinkURL('http://news.example/',base).protocol,'http:');
});
