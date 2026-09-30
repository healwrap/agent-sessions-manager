// Navigation regression: off-page ranges, stale replies, and gesture completion.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/trajectory/app.js'), 'utf8');
const focusText = source.slice(source.indexOf('async function focusTimelineRange()'), source.indexOf('function overviewRow('));

function harness({loaded=true, count=1, delayed=false}={}) {
  const event = {ref:'T002/A05', position:601, turn:2, kind:'assistant'};
  const state = {focusGeneration:0, id:'session', range:[.7,.8], duration:false,
    mode:'trace', events:loaded?[event]:[], selected:'old-detail', collapsed:new Set()};
  const scrolls=[], loads=[], messages=[], requests=[];
  const row = {dataset:{ref:event.ref}, getBoundingClientRect:()=>({height:30}), scrollIntoView:options=>scrolls.push(options)};
  const nodes = {events:{children:[],querySelector:()=>row}, 'table-pane':{clientHeight:300}, 'trace-search':{value:''}};
  const response = {count, span:count, first:{ref:event.ref,position:601},middle:{ref:event.ref,position:601}};
  let resolve;
  const promise = delayed ? new Promise(done=>resolve=done) : Promise.resolve(response);
  const context = vm.createContext({state, $:id=>nodes[id],
    api:(route,params)=>{requests.push({route,params});return promise;},
    loadTrace:async(...args)=>{loads.push(args);state.events=[event];},
    toast:message=>messages.push(message), turnCollapsed:()=>false,
    renderRows:()=>{nodes.events.children=state.events.length?[row]:[];}, renderTimeline:()=>{},
    syncFoldControls:()=>{}, performance:{now:()=>1000}});
  vm.runInContext(focusText, context);
  return {context,state,scrolls,loads,messages,requests,resolve:()=>resolve(response)};
}

(async()=>{
  const loaded=harness();
  await loaded.context.focusTimelineRange();
  assert.equal(loaded.loads.length,0);
  assert.equal(loaded.scrolls[0].block,'center');
  assert.equal(loaded.state.selected,'old-detail');
  assert.equal(loaded.requests[0].route,'/api/trajectory-focus');
  const offPage=harness({loaded:false,count:40});
  await offPage.context.focusTimelineRange();
  assert.equal(offPage.loads[0][2],600);
  assert.equal(offPage.scrolls[0].block,'start');
  const stale=harness({loaded:false,delayed:true});
  const pending=stale.context.focusTimelineRange();
  stale.state.range=[.1,.2];stale.resolve();await pending;
  assert.equal(stale.loads.length,0);assert.equal(stale.scrolls.length,0);
  const empty=harness({count:0});await empty.context.focusTimelineRange();
  assert.equal(empty.scrolls.length,0);assert.equal(empty.messages[0],'圈选范围内没有记录。');

  // A page response arriving after a new gesture cannot replace the current rows.
  let resolvePage, current=true;
  const oldEvents=[{ref:'old-page'}];
  const pageContext=vm.createContext({state:{id:'session',generation:0,events:oldEvents,offset:0},
    api:()=>new Promise(resolve=>resolvePage=resolve), toast:()=>{throw new Error('unexpected error');}});
  vm.runInContext(source.slice(source.indexOf('async function loadTrace('),source.indexOf('function turnCollapsed(')),pageContext);
  const loading=pageContext.loadTrace(true,false,600,()=>current);
  current=false;resolvePage({events:[{ref:'stale-page'}]});await loading;
  assert.equal(pageContext.state.events,oldEvents);
  assert.equal(pageContext.state.loading,false);

  // Cancel/right pan must never perform the left-drag navigation action.
  const gestures=vm.createContext({performance:{now:()=>1000},focusTimelineRange:()=>gestures.focusCalls++});
  gestures.focusCalls=0;
  vm.runInContext('let rangeDrag=null, suppressTimelineClickUntil=0;'+source.split('\n').find(line=>line.startsWith('function endRangeDrag(')),gestures);
  for(const [pan,type,expected] of [[true,'pointerup',0],[false,'pointercancel',0],[false,'pointerup',1]]){
    vm.runInContext(`rangeDrag={pointer:1,moved:true,pan:${pan}}`,gestures);
    gestures.endRangeDrag({pointerId:1,type});assert.equal(gestures.focusCalls,expected);
  }
  console.log('trajectory focus self-test: ok (loaded, off-page, stale response, empty range, pan, cancellation)');
})().catch(error=>{console.error(error);process.exitCode=1;});
