// Regression checks for legacy replies without a final-answer marker.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/trajectory/app.js'), 'utf8');
const start = source.indexOf('function chatReplyRefs(');
const end = source.indexOf('function renderChat()', start);
assert(start >= 0 && end > start);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const message = (ref, phase, extra = {}) => ({ref, phase, kind:'assistant', turn:1,
  turn_status:'completed', preview:ref, ...extra});
const replies = (events, hasMore=false) => Array.from(context.chatReplyRefs(events, hasMore));
assert.deepEqual(replies([message('process', null), message('reply', 'unknown'),
  message('import-marker', null, {preview:'<EXTERNAL SESSION IMPORTED>'})]), ['reply']);
assert.deepEqual(replies([message('legacy', null), message('reply', 'final')]), ['reply']);
assert.deepEqual(replies([message('working', null, {turn_status:'in_progress'})]), []);
assert.deepEqual(replies([message('commentary', 'commentary')]), []);
assert.deepEqual(replies([message('partial-page', null)], true), []);
assert.deepEqual(replies([message('stopped-reply', null, {turn_status:'aborted'})]), ['stopped-reply']);
assert.deepEqual(replies([message('first-turn', null), message('second-turn', null, {turn:2})], true), ['first-turn']);
console.log('trajectory chat self-test: ok (legacy, explicit final, imported marker, running, interrupted, pagination)');
