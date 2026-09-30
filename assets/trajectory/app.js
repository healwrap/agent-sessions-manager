'use strict';
// Session data always enters the page through textContent, never executable HTML.
const $ = id => document.getElementById(id);
const state = { id:null, provider:'', sessions:[], sessionNext:null, data:null, events:[], next:null,
  offset:0, query:'', mode:'trace', duration:false, foldTurns:false, foldCalls:false,
  collapsed:new Set(), expandedCalls:new Set(), range:null, selected:null, detailTab:'概述', detailPage:1,
  generation:0, detailGeneration:0, loading:false, version:null };
let preferences;
try {preferences=JSON.parse(localStorage.getItem('agent-sessions-view')||localStorage.getItem('codex-context-view')||'{}');}catch {preferences={};}
preferences={pinned:[],archived:[],aliases:{},metadata:{},projectAssignments:{},...preferences};
state.projects=[];state.projectOpen=new Set();state.projectPages=new Map();state.projectLoading=new Set();
state.archiveView=false; state.processOpen=new Set(); state.chatCache=new Map();
state.projectExpanded=new Set();state.projectClosed=new Set();state.views=new Map();state.viewport=null;state.focusGeneration=0;
let preferenceSave=Promise.resolve();
function savePreferences(){try{localStorage.setItem('agent-sessions-view',JSON.stringify(preferences));}catch{}const snapshot=JSON.stringify(preferences);preferenceSave=preferenceSave.catch(()=>{}).then(async()=>{const response=await fetch('/api/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:snapshot});if(!response.ok)throw new Error('会话视图设置保存失败');}).catch(error=>toast(error.message));return preferenceSave;}
async function loadPreferences(){try{const data=await api('/api/preferences');if(data.saved)preferences={pinned:[],archived:[],aliases:{},metadata:{},projectAssignments:{},...data.value};const qualified=key=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)?'codex:local:'+key:key;for(const field of ['pinned','archived'])preferences[field]=preferences[field].map(qualified);for(const field of ['aliases','metadata'])preferences[field]=Object.fromEntries(Object.entries(preferences[field]).map(([key,value])=>[qualified(key),field==='metadata'?{...value,id:qualified(key),provider:value.provider||'codex',provider_label:value.provider_label||'Codex'}:value]));}catch(error){toast(error.message);}}
function sessionTitle(id,fallback){return preferences.aliases[id]||fallback||'(无标题)';}
const kinds = { user:['用户','user'], assistant:['助手','assistantVioletBright'],
  tool:['工具','toolAmber'], subtool:['工具','toolAmber'], media:['上下文','contextGreen'], context:['上下文','contextGreen'] };
const statuses = { completed:'已完成', in_progress:'进行中', aborted:'已中止', success:'已完成',
  error:'失败', pending:'等待结果', running:'运行中', result:'已返回', unread:'未读取', unmatched:'未匹配', metadata:'已记录' };
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
function icon(name,className='') {
  const node=document.createElementNS('http://www.w3.org/2000/svg','svg');
  node.setAttribute('class','dsh-icon '+className);node.setAttribute('aria-hidden','true');
  const use=document.createElementNS(node.namespaceURI,'use');use.setAttribute('href','/icons.svg#'+name);node.append(use);return node;
}
function iconLabel(node,name,text){node.append(icon(name),document.createTextNode(text));return node;}
const debounce = (fn, ms=220) => { let timer; return (...args) => { clearTimeout(timer); timer=setTimeout(()=>fn(...args),ms); }; };
async function api(path, params={}) {
  const response = await fetch(path+'?'+new URLSearchParams(params));
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '读取失败');
  return value;
}
function toast(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').hidden=true,3500); }
function info(title,text) { $('info-title').textContent=title; $('info-text').textContent=text; $('info-dialog').showModal(); }
function relativeDate(raw) {
  const elapsed=Date.now()-Date.parse(raw);
  if (!Number.isFinite(elapsed)) return '';
  const hours=Math.floor(elapsed/3600000);
  if (hours<1) return '刚刚';
  if (hours<24) return hours+'小时';
  return Math.floor(hours/24)+'天';
}
function renderSessions() {
  const fragment=document.createDocumentFragment();
  const known=new Map(state.sessions.map(item=>[item.id,item]));
  for(const item of Object.values(preferences.metadata))if(!known.has(item.id))known.set(item.id,item);
  const q=$('session-search').value.toLowerCase();
  const items=Array.from(known.values()).filter(item=>(!state.provider||item.provider===state.provider)&&preferences.archived.includes(item.id)===state.archiveView && (!q||(sessionTitle(item.id,item.title)+' '+(item.project_label||'')).toLowerCase().includes(q)));
  const groups=new Map((state.archiveView?[]:state.projects).map(group=>[group.project_id,{...group,items:[]} ]));
  for(const item of items){const key=item.project_id||'projectless';if(!groups.has(key))groups.set(key,{project_id:key,project_label:item.project_label||'未分配项目',project_path:item.project_path||'',count:0,items:[]});groups.get(key).items.push(item);}
  for(const group of groups.values()){
    const section=element('section','project-group');section.dataset.project=group.project_id;
    const header=element('button','project-heading'),open=!state.projectClosed.has(group.project_id)&&(state.projectOpen.has(group.project_id)||!!q);
    header.setAttribute('aria-expanded',String(open));header.title=group.project_path||group.project_label;
    header.append(icon('folder','project-folder'),element('span','project-name',group.project_label),icon('right','project-chevron'));
    header.addEventListener('click',()=>{if(open){state.projectOpen.delete(group.project_id);state.projectClosed.add(group.project_id);}else{state.projectClosed.delete(group.project_id);state.projectOpen.add(group.project_id);loadProject(group.project_id);}renderSessions();});
    section.append(header);
    const list=element('div','project-sessions');list.hidden=!open;
    group.items.sort((a,b)=>Number(preferences.pinned.includes(b.id))-Number(preferences.pinned.includes(a.id))||String(b.updated_at).localeCompare(String(a.updated_at)));
    const expanded=state.projectExpanded.has(group.project_id)||!!q;
    const visible=expanded?group.items:group.items.slice(0,5);
    const current=group.items.find(item=>item.id===state.id);
    if(!expanded&&current&&!visible.includes(current))visible[4]=current;
    for(const item of visible){
      const row=element('div','session-entry'),button=element('button','session-item'),title=sessionTitle(item.id,item.title);
      button.setAttribute('aria-current',String(item.id===state.id));button.title=title+'\n'+item.id;
      const name=element('span','session-name');if(preferences.pinned.includes(item.id))name.append(icon('pin','session-pin'));name.append(document.createTextNode(title));
      button.append(name,element('span','provider-tag',item.provider_label||'Codex'),element('span','session-date',relativeDate(item.updated_at)));button.addEventListener('click',()=>selectSession(item.id));
      const menu=element('button','session-options');menu.append(icon('more'));menu.setAttribute('aria-label','管理会话：'+title);menu.addEventListener('click',e=>{e.stopPropagation();showSessionMenu(item,e.currentTarget);});
      row.append(button,menu);row.addEventListener('contextmenu',e=>{e.preventDefault();showSessionMenu(item,row);});list.append(row);
    }
    const page=state.projectPages.get(group.project_id);
    const archived=Array.from(known.values()).filter(item=>(item.project_id||'projectless')===group.project_id&&preferences.archived.includes(item.id)).length;
    const count=state.archiveView?group.items.length:Math.max(group.items.length,group.count-archived);
    if((!expanded&&count>visible.length)||(!state.archiveView&&(page===undefined||page!==null)&&group.items.length<count)){
      const more=element('button','more-sessions',state.projectLoading.has(group.project_id)?'正在读取…':!expanded?`展开其余 ${count-visible.length} 个会话`:'展开更多会话');more.disabled=state.projectLoading.has(group.project_id);more.addEventListener('click',()=>{state.projectExpanded.add(group.project_id);if(group.items.length<count)loadProject(group.project_id);else renderSessions();});list.append(more);
    }else if(expanded&&!q&&count>5){
      const less=element('button','more-sessions','收起会话');less.addEventListener('click',()=>{state.projectExpanded.delete(group.project_id);renderSessions();});list.append(less);
    }
    section.append(list);fragment.append(section);
  }
  if(!groups.size)fragment.append(element('p','sidebar-empty',state.archiveView?'没有归档会话':'没有匹配的会话'));
  $('sessions').replaceChildren(fragment);$('more-sessions').hidden=true;
}
async function loadProject(key){
  if(state.projectLoading.has(key)||state.projectPages.get(key)===null)return;
  state.projectLoading.add(key);renderSessions();const generation=sessionGeneration;
  try{const data=await api('/api/sessions',{project:key,provider:state.provider,q:$('session-search').value,offset:state.projectPages.get(key)||0,limit:100});if(generation!==sessionGeneration)return;
    const known=new Map(state.sessions.map(item=>[item.id,item]));for(const item of data.items)known.set(item.id,item);state.sessions=Array.from(known.values());state.projectPages.set(key,data.next_offset);
  }catch(error){toast(error.message);}finally{state.projectLoading.delete(key);renderSessions();}
}
function showSessionMenu(item,anchor) {
  const menu=$('session-menu');menu.replaceChildren();
  const actions=[
    [preferences.pinned.includes(item.id)?'取消置顶':'置顶',()=>{const index=preferences.pinned.indexOf(item.id);if(index<0)preferences.pinned.push(item.id);else preferences.pinned.splice(index,1);preferences.metadata[item.id]=item;savePreferences();renderSessions();}],
    ['重命名',()=>{state.renameItem=item;$('rename-input').value=sessionTitle(item.id,item.title);$('rename-dialog').showModal();$('rename-input').focus();}],
    ['移动到项目',async()=>{try{const data=await api('/api/sessions',{limit:1});state.projectTargets=data.projects;state.projectItem=item;const options=document.createDocumentFragment();const automatic=element('option','','跟随原会话的项目');automatic.value='';options.append(automatic);for(const project of data.projects){const option=element('option','',project.project_label);option.value=project.project_id;option.title=project.project_path;options.append(option);}$('project-target').replaceChildren(options);$('project-target').value=preferences.projectAssignments[item.id]?.project_id||'';$('project-dialog').showModal();}catch(error){toast(error.message);}}],
    [preferences.archived.includes(item.id)?'移出归档':'归档',()=>{const index=preferences.archived.indexOf(item.id);if(index<0)preferences.archived.push(item.id);else preferences.archived.splice(index,1);preferences.metadata[item.id]=item;savePreferences();renderSessions();toast(index<0?'已在此视图归档，原始会话保留。':'已移出归档。');}],
  ];
  for(const [label,action]of actions){const button=iconLabel(element('button'),'置顶取消置顶'.includes(label)?'pin':label==='重命名'?'edit':label==='移动到项目'?'folder':'archive',label);button.setAttribute('role','menuitem');button.addEventListener('click',()=>{menu.hidden=true;action();});menu.append(button);}
  const bounds=anchor.getBoundingClientRect();menu.hidden=false;menu.style.left=Math.min(innerWidth-160,bounds.right-140)+'px';menu.style.top=Math.min(innerHeight-menu.offsetHeight-8,bounds.bottom)+'px';
}
let sessionGeneration=0;
async function loadSessions(append=false,preserve=false) {
  const generation=++sessionGeneration;
  try {
    const data=await api('/api/sessions',{q:$('session-search').value,provider:state.provider,offset:append?state.sessionNext||0:0});
    if (generation!==sessionGeneration) return;
    if(preserve){const known=new Map(state.sessions.map(item=>[item.id,item]));for(const item of data.items)known.set(item.id,item);state.sessions=Array.from(known.values());}else state.sessions=append?state.sessions.concat(data.items):data.items;
    state.sessionNext=data.next_offset;state.projects=data.projects||[];if(!append&&!preserve)state.projectPages.clear();
    const errors=(data.sources||[]).filter(source=>source.error);$('source-warning').hidden=!errors.length;$('source-warning').textContent=errors.map(source=>source.label+'：'+source.error).join('；');
    renderSessions();
    if (!state.id) {
      const requested=new URLSearchParams(location.search).get('id');
      const current=data.items.find(s=>s.id===data.current_id);
      const selected=requested || current?.id || data.items[0]?.id;
      if (selected) await selectSession(selected,new URLSearchParams(location.search).get('ref'));
      else $('empty').textContent='没有找到该来源的本地会话。';
    }
  } catch (error) { toast(error.message); $('empty').textContent=error.message; }
}
async function selectSession(id,ref=null) {
  state.id=id; state.events=[]; state.next=null; state.offset=0; state.selected=null;
  state.query=''; state.range=null; state.viewport=null; state.version=null; state.collapsed.clear();
  state.chatCache.clear();state.processOpen.clear();
  state.views.clear();chatObserver?.disconnect();++chatGeneration;$('chat-messages').replaceChildren();$('chat-pane').scrollTop=0;$('table-pane').scrollTop=0;
  $('trace-search').value=''; $('details').hidden=true; $('empty').hidden=false;
  $('empty').textContent='正在读取会话…'; $('events').replaceChildren();
  renderSessions();
  history.replaceState(null,'','?'+new URLSearchParams({id}));
  await loadTrace(true);
  if (ref) await selectEvent(ref,true);
}
async function loadTrace(force=false,append=false,offset=null,isCurrent=()=>true) {
  if (!state.id) return;
  const generation=++state.generation;
  const id=state.id, query=state.query, kind='all';
  const prepend=append==='before', previousNext=state.next;
  state.loading=true;
  try {
    let start=offset!==null?offset:(prepend?Math.max(0,state.offset-150):append?state.next||0:state.offset);
    let first=await api('/api/trajectory',{id,q:query,kind,offset:start,limit:prepend?state.offset-start:150});
    if (generation!==state.generation || id!==state.id || !isCurrent()) return;
    if (!force && !append && first.version===state.version) return;
    if(state.mode==='chat'&&!state.events.length&&!query&&offset===null&&first.next_offset!==null){start=Math.max(0,first.total-150);first=await api('/api/trajectory',{id,q:query,kind,offset:start,limit:150});if(generation!==state.generation||!isCurrent())return;}
    let events=first.events, next=first.next_offset;
    // Keep an already expanded window stable when new records arrive.
    const target=append?0:Math.max(150,state.events.length);
    while (!append && next!==null && events.length<target) {
      const page=await api('/api/trajectory',{id,q:query,kind,offset:next,limit:150});
      if (generation!==state.generation||!isCurrent()) return;
      events=events.concat(page.events); next=page.next_offset;
    }
    const changed=state.version!==null && first.version!==state.version;
    if(first.id!==id&&first.provider==='codex'){
      for(const list of ['pinned','archived'])preferences[list]=preferences[list].map(key=>key===id?first.id:key);
      if(preferences.aliases[id]){preferences.aliases[first.id]=preferences.aliases[id];delete preferences.aliases[id];}
      delete preferences.metadata[id];state.id=first.id;savePreferences();
    }
    state.events=prepend?events.concat(state.events):append?state.events.concat(events):events;
    state.offset=append&&!prepend?Math.min(state.offset,start):start;
    state.next=prepend?previousNext:next; state.data=first; state.version=first.version;
    $('session-title').textContent=sessionTitle(state.id,first.title); document.title=sessionTitle(state.id,first.title)+' · Agent Sessions';
    const selected=state.sessions.find(item=>item.id===state.id)||{id:state.id,title:first.title,updated_at:'',provider:first.provider,provider_label:first.provider_label,project_id:first.project_id,project_label:first.project_label,project_path:first.project_path};
    if(!state.sessions.some(item=>item.id===state.id))state.sessions.push(selected);
    if(state.openedSession!==id){state.projectOpen.add(first.project_id);state.projectClosed.delete(first.project_id);state.openedSession=id;loadProject(first.project_id);}renderSessions();
    $('session-stats').textContent=`${first.turn_count} 轮 ${first.event_count} 步 · ${first.tool_count} 次调用 · 本地只读`;
    const unknown=Object.values(first.warnings).reduce((a,b)=>a+b,0);
    $('format-warning').hidden=state.mode==='chat'||(!unknown && !first.compactions);
    $('format-warning').textContent=[first.compactions?`上下文已压缩 ${first.compactions} 次，历史可见记录仍可查看`:'',unknown?`${unknown} 条记录类型尚未识别，点此查看`:''].filter(Boolean).join(' · ');
    if(state.mode==='chat')renderChat(prepend);else{renderRows(prepend); renderTimeline();}
    if (changed && state.mode==='trace' && state.selected && !$('details').hidden) await renderDetail();
  } catch (error) { if (generation===state.generation) { toast(error.message); $('empty').hidden=false; $('empty').textContent=error.message; } }
  finally { if (generation===state.generation) state.loading=false; }
}
function turnCollapsed(turn) { return state.foldTurns!==state.collapsed.has(turn); }
function trajectoryRows() {
  if(state.query)return state.events;
  const rows=[], summarizedTurns=new Set(), summarizedCalls=new Set();
  for(const event of state.events){
    const turn=state.data?.turn_summaries?.[event.turn];
    if(turnCollapsed(event.turn)){
      if(summarizedTurns.has(event.turn))continue;
      if(turn&&event.position<turn.anchor_position){rows.push(event);continue;}
      rows.push(event);summarizedTurns.add(event.turn);
      if(turn?.remaining)rows.push({ref:'summary:turn:'+event.turn,turn:event.turn,kind:'summary',position:event.position,
        preview:`${turn.steps} 个步骤 · ${turn.calls} 个工具调用`,summaryType:'turn'});
      continue;
    }
    const key=event.call_group||event.call_summary,group=state.data?.call_groups?.[key];
    if(state.foldCalls&&group&&!state.expandedCalls.has(key)){
      if(event.kind==='assistant')rows.push(event);
      if(!summarizedCalls.has(key)){rows.push({ref:'summary:call:'+key,turn:event.turn,kind:'summary',position:event.position,
        preview:`${group.count} 个工具调用 · ${group.names.join(', ')}`,summaryType:'call',group:key});summarizedCalls.add(key);}
      continue;
    }
    rows.push(event);
  }
  return rows;
}
function renderRows(prepend=false) {
  const pane=$('table-pane'), previousTop=pane.scrollTop, previousHeight=pane.scrollHeight;
  const fragment=document.createDocumentFragment(); let previousTurn=null;
  for (const event of trajectoryRows()) {
    const first=previousTurn!==event.turn;
    previousTurn=event.turn;
    if(event.kind==='summary'){
      const row=element('tr','summary-row');row.tabIndex=0;row.dataset.collapsedSummary=event.summaryType;
      const label=element('td','event');label.append(element('span','step-dot'));
      const content=element('td','content'),button=element('button','fold-summary');button.append(element('span','summary-ellipsis','…'),document.createTextNode(event.preview));
      const expand=()=>{if(event.summaryType==='turn'){if(state.collapsed.has(event.turn))state.collapsed.delete(event.turn);else state.collapsed.add(event.turn);}else state.expandedCalls.add(event.group);renderRows();};
      button.title='展开'+(event.summaryType==='turn'?'轮次':'工具调用');button.addEventListener('click',expand);content.append(button);row.append(label,content);fragment.append(row);continue;
    }
    const row=element('tr'); row.tabIndex=0; row.dataset.ref=event.ref; row.dataset.kind=event.kind;
    row.dataset.turnStart=String(first); row.dataset.selected=String(event.ref===state.selected);
    row.dataset.error=String(event.status==='error');
    row.dataset.timelineFocus=state.range && ((state.duration?(event.timeline_end??positionOf(event)):positionOf(event))<state.range[0]||positionOf(event)>state.range[1])?'outside':'inside';
    if (turnCollapsed(event.turn)) row.dataset.collapsedSummary='turn';
    const label=element('td','event'), inner=element('div','eventInner'), slot=element('span','kindSlot');
    label.append(element('span','turnRail'));
    if (row.dataset.selected==='true') label.append(element('span','selectionRail'));
    if (first) {
      const turn=element('button','turnLabel'+(event.ref===state.selected?' turnLabelActive':''),'第 '+event.turn+' 轮');
      turn.title=turnCollapsed(event.turn)?'展开轮次':'收起轮次';
      turn.addEventListener('click',e=>{e.stopPropagation(); if(state.collapsed.has(event.turn))state.collapsed.delete(event.turn);else state.collapsed.add(event.turn); renderRows();});
      label.append(turn);
    } else label.append(element('span','step-dot'));
    const [text,cls]=kinds[event.kind]||['消息','systemNeutral'];
    const tag=element('span','kindTag '+cls), glyph=icon(event.kind==='user'?'user':event.kind==='assistant'?'sparkle':['media','context'].includes(event.kind)?'context':'wrench','kindTagIcon');
    tag.append(glyph,element('span','kindTagLabel',text));
    slot.append(tag); inner.append(slot); label.append(inner);
    const content=element('td','content');
    if (event.kind==='tool'||event.kind==='subtool') {
      const preview=element('div','resultPreview'), request=element('div','resultRequest');
      request.append(element('span','toolCallNameTypeface',event.name),element('span','toolCallPayload',event.preview));
      const result=element('div','inlineResult'); result.append(icon('right','arrow'));
      result.append(element('span','inlineResultText'+(event.status==='error'?' error':''),
        event.kind==='subtool'&&event.status==='unread'?'':event.kind==='subtool'&&event.status==='unmatched'?'查看组合调用':(statuses[event.status]||event.status)+(event.output_chars?` · ${event.output_chars.toLocaleString()} 字符`:'')));
      if(event.kind==='subtool'&&event.status==='unread')result.hidden=true;
      preview.append(request,result); content.append(preview);
    } else content.append(element('div','contentText',event.preview));

    row.append(label,content); row.title=event.ref+' · '+event.name;
    row.addEventListener('click',()=>selectEvent(event.ref));
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectEvent(event.ref);}});
    fragment.append(row);
  }
  $('events').replaceChildren(fragment);
  $('empty').hidden=state.events.length>0;
  $('empty').textContent=state.query?'没有匹配的轨迹记录。':state.data?.unavailable_reason||'该会话暂无可见记录。';
  pane.scrollTop=previousTop+(prepend?pane.scrollHeight-previousHeight:0);
}
let chatObserver=null, chatGeneration=0;
function chatReplyRefs(events,hasMore=false){
  const replies=new Set(), finals=new Set(), legacy=new Map();
  for(const event of events){
    if(event.kind!=='assistant')continue;
    if(['final','final_answer'].includes(event.phase)){replies.add(event.ref);finals.add(event.turn);}
    else if((!event.phase||event.phase==='unknown')&&event.preview.trim()!=='<EXTERNAL SESSION IMPORTED>')legacy.set(event.turn,event);
  }
  for(const [turn,event]of legacy)if(!finals.has(turn)&&event.turn_status!=='in_progress'&&!(hasMore&&turn===events.at(-1)?.turn))replies.add(event.ref);
  return replies;
}
function renderChat(prepend=false) {
  const generation=++chatGeneration, pane=$('chat-pane');
  const follow=pane.scrollHeight-pane.scrollTop-pane.clientHeight<60;
  const previousTop=pane.scrollTop;
  const previousHeight=pane.scrollHeight;
  chatObserver?.disconnect();
  const fragment=document.createDocumentFragment(), hydrate=[];
  const replies=chatReplyRefs(state.events,state.next!==null);
  const copyMessage=async(ref)=>{try{const data=state.chatCache.get(ref)||await api('/api/event',{id:state.id,ref});await navigator.clipboard.writeText(data.loadedText||data.text);toast((data.loadedPage||1)<data.pages?'已复制当前展开的原始内容。':'已复制消息。');}catch{toast('复制不可用，请在消息中选择文本复制。');}};
  const message=(event,parent)=>{
    const user=event.kind==='user', row=element('article',user?'chat-user-row':'chat-assistant-row');row.dataset.messageRef=event.ref;
    const stack=element('div',user?'chat-user-stack':'chat-assistant-stack'), body=element('div',user?'chat-user-bubble':'chat-assistant-body');
    const mount=data=>{
      let displayText=data.loadedText||data.text;
      // Project the request out of Codex's attachment/browser wrapper. Keep the
      // exact original in the event inspector, copy action, and cache.
      const marker='## My request:';
      const agentRequest=user&&state.data?.provider==='antigravity'&&/^\s*<USER_REQUEST>[\s\S]*?<\/USER_REQUEST>/.test(displayText);
      const wrapped=agentRequest||user&&/^\s*(<in-app-browser-context\b|# Files mentioned by the user:)/.test(displayText)&&displayText.includes(marker);
      if(agentRequest)displayText=displayText.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/)[1].trim();else if(wrapped)displayText=displayText.slice(displayText.indexOf(marker)+marker.length).trim();
      body.replaceChildren(user?document.createTextNode(displayText):markdown(displayText));
      if(wrapped){const source=element('button','chat-expand','附带上下文与附件 ›');source.addEventListener('click',()=>{selectEvent(event.ref,true);state.detailTab='原始内容';renderDetail();});stack.append(source);}
      if((data.loadedPage||1)<data.pages){const more=element('button','chat-expand',`展开剩余内容（${data.pages} 页）`);let page=data.loadedPage||1;more.addEventListener('click',async()=>{more.disabled=true;try{const next=await api('/api/event',{id:state.id,ref:event.ref,page:++page});data.loadedText=(data.loadedText||data.text)+next.text;data.loadedPage=page;state.chatCache.set(event.ref,data);if(generation!==chatGeneration)return;if(user)body.append(document.createTextNode(next.text));else body.replaceChildren(markdown(data.loadedText));if(page===next.pages)more.remove();else{more.textContent=`继续展开（${page} / ${next.pages} 页）`;more.disabled=false;}}catch(error){page--;more.disabled=false;toast(error.message);}});stack.append(more);}
    };
    stack.append(body);row.append(stack);
    const cached=state.chatCache.get(event.ref);
    if(cached)mount(cached);else{body.textContent=event.preview;hydrate.push({row,event,mount});}
    const actions=element('div','chat-message-actions'), copy=element('button');copy.append(icon('copy'));copy.title='复制';copy.setAttribute('aria-label','复制消息 '+event.ref);copy.addEventListener('click',()=>copyMessage(event.ref));
    const trace=element('button');trace.append(icon('jump'));trace.title='查看轨迹';trace.setAttribute('aria-label','查看消息轨迹 '+event.ref);trace.addEventListener('click',()=>selectEvent(event.ref,true));
    const time=Date.parse(event.timestamp);actions.append(copy,trace,element('span','chat-time',Number.isFinite(time)?new Date(time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''));stack.append(actions);parent.append(row);
  };
  let process=[];
  const flush=(ongoing=false)=>{
    if(!process.length)return;
    const commentary=process.filter(event=>event.kind==='assistant'), tools=process.filter(event=>event.kind==='tool');
    const last=ongoing?commentary.at(-1):null;
    const details=element('details','chat-process');const key=process[0].ref;details.open=state.processOpen.has(key);
    const stopped=process.at(-1).turn_status==='aborted';
    const summary=element('summary','chat-process-summary',`${ongoing?'进行中':stopped?'已中止':'已完成'}${tools.length?' · 执行了 '+tools.length+' 次工具调用':''}${commentary.length?' · '+commentary.length+' 条过程消息':''}`);
    details.append(summary);details.addEventListener('toggle',()=>{if(details.open)state.processOpen.add(key);else state.processOpen.delete(key);});
    summary.prepend(icon(ongoing?'clock':stopped?'close':'check'));summary.append(icon('down','process-chevron'));
    const body=element('div','chat-process-body');
    for(const event of process){if(event.kind==='subtool')continue;if(event===last)continue;const button=element('button','chat-process-event');button.append(iconLabel(element('span','chat-process-kind'),event.kind==='assistant'?'sparkle':'wrench',event.kind==='assistant'?'助手':event.name),element('span','chat-process-preview',event.preview));button.title=event.ref;button.addEventListener('click',()=>selectEvent(event.ref,true));body.append(button);}
    details.append(body);fragment.append(details);
    if(last)message(last,fragment);
    process=[];
  };
  for(const event of state.events){
    if(event.kind==='user'){flush();message(event,fragment);}
    else if(event.kind==='assistant'&&replies.has(event.ref)){flush();message(event,fragment);}
    else if(['assistant','tool','subtool'].includes(event.kind)||(event.kind==='context'&&event.name==='执行记录'))process.push(event);
    else if(event.kind==='context'){flush();const marker=iconLabel(element('button','chat-compaction'),'compacted','上下文已压缩 · 查看轨迹');marker.addEventListener('click',()=>selectEvent(event.ref,true));fragment.append(marker);}
    else if(event.kind==='media'){const attachment=iconLabel(element('button','chat-media'),'clip',event.name+' · 查看附件来源');attachment.addEventListener('click',()=>selectEvent(event.ref,true));fragment.append(attachment);}
  }
  flush(state.next===null&&state.data.current_status==='in_progress');
  if(!fragment.childNodes.length)fragment.append(element('p','empty-message',state.query?'没有匹配的对话。':state.data?.unavailable_reason||'该会话暂无可见对话。'));
  $('chat-messages').replaceChildren(fragment);
  if(prepend)pane.scrollTop=previousTop+pane.scrollHeight-previousHeight;
  else if(follow)pane.scrollTop=pane.scrollHeight;else pane.scrollTop=previousTop;
  // Hydrate only messages near the viewport, retaining bounded first-page reads.
  const pending=new Map(hydrate.map(item=>[item.row,item]));
  chatObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const item=pending.get(entry.target);if(!item)continue;pending.delete(entry.target);chatObserver.unobserve(entry.target);const id=state.id;api('/api/event',{id,ref:item.event.ref}).then(data=>{if(generation!==chatGeneration||id!==state.id)return;state.chatCache.set(item.event.ref,data);const atBottom=pane.scrollHeight-pane.scrollTop-pane.clientHeight<60;item.mount(data);if(atBottom)pane.scrollTop=pane.scrollHeight;}).catch(error=>toast(error.message));}},{root:pane,rootMargin:'250px'});
  for(const item of hydrate)chatObserver.observe(item.row);
}
function timelineTimes() { return [0,Math.max(1,state.data?.active_duration_ms||0)]; }
function positionOf(event) {
  if(state.duration&&Number.isFinite(event.timeline_start))return event.timeline_start;
  return event.position/Math.max(1,(state.data?.event_count||1)-1);
}
function renderTimeline() {
  const fragment=document.createDocumentFragment();
  const width=$('timeline').clientWidth;
  const selectedEvent=state.events.find(event=>event.ref===state.selected);
  const selected=selectedEvent?.parent_ref?(state.events.find(event=>event.ref===selectedEvent.parent_ref)||{ref:selectedEvent.parent_ref}):selectedEvent;let previousTurn=null;
  for (const event of state.data?.overview||[]) {
    const button=element('button','TrajectoryTimeline-span');
    const fullPosition=positionOf(event),[start,end]=state.viewport||[0,1];
    const position=(fullPosition-start)/(end-start);
    button.style.setProperty('--trajectory-span-lane',event.kind==='assistant'?'1':event.kind==='tool'?'2':'0');
    button.style.setProperty('--trajectory-span-left',(position*Math.max(1,width-10))+'px');
    button.style.setProperty('--trajectory-span-gap','0px');
    const [,span]=timelineTimes();
    button.style.setProperty('--trajectory-span-width',(state.duration?Math.min(width,Math.max(3,((event.timeline_end??fullPosition)-fullPosition)/(end-start)*width)):8)+'px');
    button.dataset.timelineSpan=event.kind==='assistant'?'message':['media','context'].includes(event.kind)?'context':event.kind;
    button.dataset.equalDuration=String(!state.duration); button.dataset.current=String(event.ref===(selected?.ref||state.selected)||!!selected&&selected.kind===event.kind&&selected.position>=event.position&&selected.position<=(event.end_position??event.position));
    button.dataset.searchMatch=String(event.search_match!==false);
    button.dataset.selected=String(!state.range||((event.timeline_end??fullPosition)>=state.range[0]&&fullPosition<=state.range[1]));
    button.dataset.error=String(event.status==='error'); button.dataset.ref=event.ref;
    button.title=`第 ${event.turn} 轮 · ${kinds[event.kind]?.[0]||event.kind} · ${event.ref}${event.count>1?' · '+event.count+' 条聚合':''}`;
    button.setAttribute('aria-label',button.title); button.addEventListener('click',()=>selectEvent(event.ref,true));
    if(previousTurn!==event.turn){const boundary=element('span','timeline-turn-boundary');boundary.style.left=position*Math.max(1,width-10)+'px';fragment.append(boundary);previousTurn=event.turn;}
    fragment.append(button);
  }
  const selection=element('div','timeline-selection');
  selection.hidden=!state.range;
  if(state.range){const [start,end]=state.viewport||[0,1];selection.style.left=(state.range[0]-start)/(end-start)*100+'%';selection.style.width=(state.range[1]-state.range[0])/(end-start)*100+'%';}
  fragment.append(selection,element('div','timeline-hover-line')); $('timeline').replaceChildren(fragment);
}
async function selectEvent(ref,jump=false) {
  ++state.focusGeneration;
  const id=state.id;
  if(state.mode==='chat')switchMode('trace',false);
  state.selected=ref; state.detailTab='概述'; state.detailPage=1;
  $('details').hidden=false; renderRows(); renderTimeline();
  history.replaceState(null,'','?'+new URLSearchParams({id:state.id,ref}));
  if (jump && !state.events.some(e=>e.ref===ref)) {
    try {
      const data=await api('/api/event',{id:state.id,ref});
      if(state.selected!==ref||state.id!==id)return;
      state.query=''; $('trace-search').value=''; state.mode='trace'; syncTabs(); state.events=[];
      await loadTrace(true,false,Math.floor(data.event.position/150)*150);
    } catch(error) {toast(error.message);}
  }
  if(state.selected!==ref||state.id!==id)return;
  const target=state.events.find(event=>event.ref===ref);
  if(target){if(turnCollapsed(target.turn)){if(state.collapsed.has(target.turn))state.collapsed.delete(target.turn);else state.collapsed.add(target.turn);}if(['tool','subtool'].includes(target.kind)&&state.foldCalls){state.foldCalls=false;syncFoldControls();}renderRows();renderTimeline();}
  await renderDetail();
  if(state.selected!==ref||state.id!==id)return;
  const row=Array.from($('events').children).find(e=>e.dataset.ref===ref);
  if(jump&&row)row.scrollIntoView({block:'center',behavior:'smooth'});
}
async function focusTimelineRange() {
  const generation=++state.focusGeneration,id=state.id,range=state.range,duration=state.duration;
  const current=()=>generation===state.focusGeneration&&id===state.id&&range===state.range&&duration===state.duration&&state.mode==='trace';
  if(!range||!id)return;
  try {
    const result=await api('/api/trajectory-focus',{id,start:range[0],end:range[1],mode:duration?'duration':'position'});
    if(!current())return;
    if(!result.count){toast('圈选范围内没有记录。');return;}
    const height=$('events').querySelector('tr')?.getBoundingClientRect().height||36;
    const tall=result.span*height>$('table-pane').clientHeight;
    const target=tall?result.first:result.middle;
    if(state.query||!state.events.some(event=>event.ref===target.ref)){
      state.query='';$('trace-search').value='';state.events=[];
      await loadTrace(true,false,Math.floor(target.position/150)*150,current);
      if(!current())return;
    }
    const event=state.events.find(event=>event.ref===target.ref);
    if(!event)return;
    if(turnCollapsed(event.turn)){if(state.collapsed.has(event.turn))state.collapsed.delete(event.turn);else state.collapsed.add(event.turn);}
    if(event.kind==='tool'&&state.foldCalls){state.foldCalls=false;syncFoldControls();}
    renderRows();renderTimeline();
    const row=Array.from($('events').children).find(row=>row.dataset.ref===target.ref);
    row?.scrollIntoView({block:tall?'start':'center',behavior:'smooth'});
  } catch(error){if(current())toast(error.message);}
}
function overviewRow(list,label,value,wrap=false) {
  const row=element('div'), data=element('dd',wrap?'wrap':'',value);
  data.title=String(value); row.append(element('dt','',label),data); list.append(row); return data;
}
function jsonTree(value, key='', depth=0, budget={count:0}) {
  // Bound node count as well as characters; raw tab always preserves the exact source text.
  if (++budget.count>500 || depth>12) return element('pre','json-leaf',JSON.stringify(value,null,2));
  if(value!==null&&typeof value==='object') {
    const branch=element('details'); branch.open=depth<2;
    const entries=Object.entries(value), summary=element('summary','',`${key?key+': ':''}${Array.isArray(value)?'[':'{'} ${entries.length} ${Array.isArray(value)?'项':'字段'} ${Array.isArray(value)?']':'}'}`);
    branch.append(summary);
    for (const [name,child] of entries) branch.append(jsonTree(child,name,depth+1,budget));
    return branch;
  }
  const leaf=element('div','json-leaf');
  if(key)leaf.append(element('span','json-key',key+': '));
  leaf.append(element('span',typeof value==='string'?'json-string':'json-number',JSON.stringify(value)));
  return leaf;
}
function payload(text,raw=false) {
  if(!text)return element('p','noPayload','未记录内容。');
  if(!raw) {try { const tree=element('div','json-tree');tree.append(jsonTree(JSON.parse(text)));return tree; }catch{} }
  return element('pre','',text);
}
function markdown(text) {
  // Parse Markdown into DOM nodes; HTML stays literal and images never fetch automatically.
  const wrap=element('div','markdownPayload'), body=element('div','markdown-body');wrap.append(body);
  const inline=(tokens,parent)=>{
    for(const token of tokens||[]) {
      let node;
      if(token.type==='strong'||token.type==='em'||token.type==='del') {node=element(token.type==='strong'?'strong':token.type==='em'?'em':'del');inline(token.tokens,node);}
      else if(token.type==='codespan')node=element('code','',token.text);
      else if(token.type==='br')node=element('br');
      else if(token.type==='link') {
        node=element('a');inline(token.tokens,node);
        try {const url=new URL(token.href,location.href);if(['http:','https:'].includes(url.protocol)){node.href=url.href;node.target='_blank';node.rel='noopener noreferrer';}}catch{}
      } else if(token.type==='image')node=element('span','',`[图片：${token.text}] ${token.href}`);
      else if(token.tokens) {node=element('span');inline(token.tokens,node);}
      else node=document.createTextNode(token.type==='html'?token.raw:token.text||token.raw||'');
      parent.append(node);
    }
  };
  const blocks=(tokens,parent)=>{
    for(const token of tokens) {
      let node;
      if(token.type==='space')continue;
      if(token.type==='heading'||token.type==='paragraph'||token.type==='text') {node=element(token.type==='heading'?'h'+token.depth:'p');inline(token.tokens||[{text:token.text}],node);}
      else if(token.type==='code') {node=element('div','markdown-code');const header=element('div','markdown-code-header'),copy=iconLabel(element('button'),'copy','复制代码');copy.title='复制代码';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(token.text);toast('已复制代码。');}catch{toast('复制不可用，请选择代码复制。');}});header.append(element('span','',token.lang||'代码'),copy);const pre=element('pre');pre.append(element('code','',token.text));node.append(header,pre);}
      else if(token.type==='blockquote') {node=element('blockquote');blocks(token.tokens,node);}
      else if(token.type==='hr')node=element('hr');
      else if(token.type==='list') {node=element(token.ordered?'ol':'ul');if(token.ordered&&token.start!==1)node.start=token.start;for(const item of token.items){const li=element('li');if(item.task)li.append(document.createTextNode(item.checked?'☑ ':'☐ '));blocks(item.tokens,li);node.append(li);}}
      else if(token.type==='table') {node=element('table');const head=element('thead'),tr=element('tr');for(const cell of token.header){const th=element('th');inline(cell.tokens,th);tr.append(th);}head.append(tr);node.append(head);const tbody=element('tbody');for(const cells of token.rows){const row=element('tr');for(const cell of cells){const td=element('td');inline(cell.tokens,td);row.append(td);}tbody.append(row);}node.append(tbody);}
      else node=element('pre','',token.raw||token.text||'');
      if(token.type==='table'){const scroll=element('div','markdown-table-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','表格，可横向滚动');scroll.append(node);parent.append(scroll);}else parent.append(node);
    }
  };
  try {blocks(marked.lexer(text),body);}catch {body.append(element('pre','',text));}
  return wrap;
}
function detailPager(data) {
  if(data.pages<2)return;
  const pager=element('div','detail-pager'), previous=element('button','', '上一页'), next=element('button','','下一页');
  previous.disabled=data.page<=1;next.disabled=data.page>=data.pages;
  previous.addEventListener('click',()=>{state.detailPage--;renderDetail();});next.addEventListener('click',()=>{state.detailPage++;renderDetail();});
  pager.append(previous,element('span','',`${data.page} / ${data.pages} 页 · ${data.total_chars.toLocaleString()} 字符`),next);$('detail-body').append(pager);
}
async function renderDetail() {
  if(!state.selected||!state.id)return;
  const generation=++state.detailGeneration, id=state.id, ref=state.selected;
  const part=state.detailTab==='结果'?'output':'input';
  try {
    const data=await api('/api/event',{id,ref,part,page:state.detailPage});
    if(generation!==state.detailGeneration||id!==state.id||ref!==state.selected)return;
    const event=data.event, tool=event.kind==='tool'||event.kind==='subtool';
    const listed=state.events.find(item=>item.ref===ref);if(listed&&event.kind==='subtool'){Object.assign(listed,event);renderRows();renderTimeline();}
    const [name,cls]=kinds[event.kind]||['消息','systemNeutral'];
    $('detail-kind').className='kindTag '+cls; $('detail-kind').textContent=name;
    $('detail-location').textContent=`第 ${event.turn} 轮 · ${tool?event.name:'消息'}`;
    const tabs=tool?['概述','参数','结果','Schema','计时']:['概述','预览','原始内容','来源'];
    if(!tabs.includes(state.detailTab))state.detailTab='概述';
    const nav=document.createDocumentFragment();
    for(const tab of tabs){const button=element('button','detailTab'+(tab===state.detailTab?' detailTabActive':''),tab);button.setAttribute('aria-selected',String(tab===state.detailTab));button.addEventListener('click',()=>{state.detailTab=tab;state.detailPage=1;renderDetail();});nav.append(button);}
    $('detail-tabs').replaceChildren(nav); $('detail-body').replaceChildren();
    $('detail-body').scrollTop=0;
    if(state.detailTab==='概述') {
      const list=element('dl','overview');
      overviewRow(list,'来源',(data.provider_label||'Codex')+' · '+(tool?event.name:'可见记录'));
      overviewRow(list,'状态',statuses[event.status]||event.status);
      overviewRow(list,'引用',event.ref);
      overviewRow(list,'时长',tool&&event.duration_ms!==null?event.duration_ms.toLocaleString()+' 毫秒（记录间隔）':'未记录');
      $('detail-body').append(list);
      const block=element('div','detail-content');
      const title=element('button','section-title',tool?'参数 ›':'预览 ›');
      title.addEventListener('click',()=>{state.detailTab=tool?'参数':'预览';renderDetail();});block.append(title,tool?payload(data.text):markdown(data.text));
      for(const nested of data.nested){const button=element('button','nested-link',nested.name+' › '+nested.ref);button.addEventListener('click',()=>selectEvent(nested.ref));block.append(button);}
      if(tool){const result=element('button','section-title detail-section','结果 ›');result.addEventListener('click',()=>{state.detailTab='结果';renderDetail();});block.append(result,element('p','metadata-note',event.kind==='subtool'?'点击读取此命令的结果。':data.output_available?'点击查看本次调用的结果。':event.result_note||'原始记录尚未返回结果。'));}
      $('detail-body').append(block); detailPager(data);
    } else if(state.detailTab==='来源') {
      const list=element('dl','overview');overviewRow(list,'会话',data.thread_id,true);overviewRow(list,'文件',data.source,true);overviewRow(list,'行号',data.line??event.line);overviewRow(list,'引用',ref);overviewRow(list,'时间',event.timestamp||'未记录',true);$('detail-body').append(list);
    } else if(state.detailTab==='Schema') {
      $('detail-body').append(element('p','metadata-note',(data.provider_label||'此来源')+' 本地记录未保存工具 Schema。'));
    } else if(state.detailTab==='计时') {
      const list=element('dl','overview');overviewRow(list,'开始',event.timestamp||'未记录',true);overviewRow(list,'记录间隔',event.duration_ms!==null?event.duration_ms+' 毫秒':'未记录');$('detail-body').append(list,element('p','metadata-note','记录间隔来自调用与结果时间戳；模型首字时间、解码耗时和工具内部耗时未记录。'));
    } else {
      if(event.kind==='subtool'&&part==='output'&&!data.output_available){const note=element('p','metadata-note',data.parent_output_available?'这条命令的独立结果尚未匹配，组合输出可在原调用中查看。':'组合调用尚未返回结果。');$('detail-body').append(note);if(data.parent_ref){const parent=element('button','nested-link','查看组合调用结果 ›');parent.addEventListener('click',async()=>{await selectEvent(data.parent_ref,true);state.detailTab='结果';renderDetail();});$('detail-body').append(parent);}return;}
      if(tool&&part==='output'&&!data.output_available){$('detail-body').append(element('p','metadata-note',event.result_note||'原始记录尚未返回可读取的结果。'));return;}
      if(data.input_truncated)$('detail-body').append(element('p','metadata-note','内部调用参数只保留前 2500 字符；完整参数可在外层调用中查看。'));
      const block=element('div','detail-content');block.append(!tool&&state.detailTab==='预览'?markdown(data.text):payload(data.text,state.detailTab==='原始内容'));$('detail-body').append(block);detailPager(data);
    }
  } catch(error) {if(generation===state.detailGeneration)$('detail-body').replaceChildren(element('p','metadata-note',error.message));}
}
function syncTabs() {
  for(const tab of document.querySelectorAll('[data-main-tab]')){const active=tab.dataset.mainTab===state.mode;tab.classList.toggle('active',active);tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  const chat=state.mode==='chat';document.querySelector('.trajectory-toolbar').hidden=chat;document.querySelector('.trajectory-timeline').hidden=chat;$('split').hidden=chat;$('format-warning').hidden=chat||(!state.data?.compactions&&!Object.keys(state.data?.warnings||{}).length);$('chat-pane').hidden=!chat;$('details-toggle').hidden=chat;
}
function switchMode(mode,refresh=true){
  if(mode===state.mode)return;
  const keys=['events','offset','next','query','selected','range','viewport','version','data','detailTab','detailPage'];
  const view=Object.fromEntries(keys.map(key=>[key,state[key]]));view.scrollTop=$(state.mode==='chat'?'chat-pane':'table-pane').scrollTop;view.detailsHidden=$('details').hidden;state.views.set(state.mode,view);
  if(state.mode==='trace'&&view.query!==$('trace-search').value.trim()){view.query=$('trace-search').value.trim();view.events=[];view.offset=0;view.next=null;view.version=null;view.scrollTop=0;view.range=null;}
  ++state.generation;++chatGeneration;chatObserver?.disconnect();state.loading=false;state.mode=mode;
  const restored=state.views.get(mode);
  if(restored)for(const key of keys)state[key]=restored[key];
  else{state.events=[];state.offset=0;state.next=null;state.query='';state.selected=null;state.range=null;state.viewport=null;state.version=null;}
  $('trace-search').value=state.query;$('details').hidden=restored?.detailsHidden??true;syncTabs();
  if(restored){if(mode==='chat')renderChat();else{renderRows();renderTimeline();if(!restored.detailsHidden&&state.selected)renderDetail();}$(mode==='chat'?'chat-pane':'table-pane').scrollTop=restored.scrollTop;}
  if(refresh)loadTrace(!restored);
}
function syncFoldControls(){for(const [id,folded,label]of [['fold-turns',state.foldTurns,'轮次'],['fold-calls',state.foldCalls,'调用']]){const button=$(id);button.setAttribute('aria-pressed',String(folded));button.querySelector('use').setAttribute('href','/icons.svg#'+(folded?'expand':'collapse'));button.title=(folded?'展开':'收起')+'所有'+label;button.setAttribute('aria-label',button.title);}}
function searchTrace() {if(state.mode!=='trace')return;state.query=$('trace-search').value.trim();state.offset=0;state.events=[];state.range=null;loadTrace(true);}
$('trace-search').addEventListener('input',debounce(searchTrace));
$('session-search').addEventListener('input',debounce(()=>loadSessions()));
$('more-sessions').addEventListener('click',()=>loadSessions(true));
$('refresh-sessions').addEventListener('click',()=>loadSessions());
$('refresh-trace').addEventListener('click',()=>loadTrace(true));
for(const tab of document.querySelectorAll('[data-main-tab]')){tab.addEventListener('click',()=>switchMode(tab.dataset.mainTab));tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const mode=state.mode==='chat'?'trace':'chat';switchMode(mode);document.querySelector(`[data-main-tab="${mode}"]`).focus();}});}
$('duration').addEventListener('click',()=>{state.duration=!state.duration;state.range=null;state.viewport=null;$('duration').setAttribute('aria-pressed',String(state.duration));$('duration').title=state.duration?'使用等距排列':'使用执行时长（折叠空闲时间）';$('duration').setAttribute('aria-label',$('duration').title);renderTimeline();renderRows();});
$('fold-turns').addEventListener('click',()=>{state.foldTurns=!state.foldTurns;state.collapsed.clear();syncFoldControls();renderRows();});
$('fold-calls').addEventListener('click',()=>{state.foldCalls=!state.foldCalls;state.expandedCalls.clear();syncFoldControls();renderRows();});
$('close-detail').addEventListener('click',()=>{$('details').hidden=true;});
$('details-toggle').addEventListener('click',()=>{if(state.selected){$('details').hidden=!$('details').hidden;}else if(state.events[0])selectEvent(state.events[0].ref);});
function toggleSidebar(){const collapsed=document.querySelector('.application').classList.toggle('sidebar-collapsed');$('sidebar-reopen').hidden=!collapsed;(collapsed?$('sidebar-reopen'):$('sidebar-toggle')).focus();}
$('sidebar-toggle').addEventListener('click',toggleSidebar);$('sidebar-reopen').addEventListener('click',toggleSidebar);
$('header-more').addEventListener('click',e=>{if(state.data)showSessionMenu(state.sessions.find(item=>item.id===state.id)||{id:state.id,title:state.data.title,updated_at:'',project_id:state.data.project_id,project_label:state.data.project_label,project_path:state.data.project_path},e.currentTarget);});
$('format-warning').addEventListener('click',()=>{if(state.data)info('记录格式',`上下文压缩次数：${state.data.compactions}\n\n未识别记录类型：\n${JSON.stringify(state.data.warnings,null,2)}\n\n只展示可见对话、调用元数据、按需工具结果和媒体引用。`);});
$('about').addEventListener('click',()=>info('Agent Sessions','按项目查看 Codex、Claude Code 与 Antigravity 本地会话。置顶、重命名和归档只整理此应用，原始记录保留。\n\n对话：聊天正文与可折叠的执行过程。\n轨迹：事件列表、时间线、参数与结果。\n\nAntigravity 的执行记录单独展示；没有关联标识时不将其作为某条调用的独立结果。内容保留原值，正文和结果按需读取。继续聊天请回到原 Agent。'));
document.querySelector('.dialog-close').addEventListener('click',()=>$('info-dialog').close());
function showSessionSearch() {document.querySelector('.session-search').hidden=false;$('session-search').focus();}
$('session-search-toggle').addEventListener('click',showSessionSearch);
$('provider-filter').addEventListener('change',()=>{state.provider=$('provider-filter').value;state.projectPages.clear();state.projectExpanded.clear();loadSessions();});
$('archive-toggle').addEventListener('click',()=>{state.archiveView=!state.archiveView;$('archive-toggle').setAttribute('aria-pressed',String(state.archiveView));$('workspace-heading').textContent=state.archiveView?'归档会话':'项目';renderSessions();});
$('rename-cancel').addEventListener('click',()=>$('rename-dialog').close());
$('project-cancel').addEventListener('click',()=>$('project-dialog').close());
$('project-form').addEventListener('submit',async e=>{e.preventDefault();const item=state.projectItem;if(!item)return;const project=state.projectTargets.find(p=>p.project_id===$('project-target').value);if(project)preferences.projectAssignments[item.id]={project_id:project.project_id,project_label:project.project_label,project_path:project.project_path};else delete preferences.projectAssignments[item.id];delete preferences.metadata[item.id];await savePreferences();$('project-dialog').close();if(project){state.projectOpen.add(project.project_id);state.projectClosed.delete(project.project_id);}await loadSessions();if(state.id===item.id)loadTrace(true);});
$('rename-form').addEventListener('submit',e=>{e.preventDefault();const item=state.renameItem;const title=$('rename-input').value.trim();if(!item||!title)return;preferences.aliases[item.id]=title;preferences.metadata[item.id]=item;savePreferences();$('rename-dialog').close();renderSessions();if(state.id===item.id){$('session-title').textContent=title;document.title=title+' · Agent Sessions';}});
document.addEventListener('click',e=>{if(!e.target.closest('#session-menu')&&!e.target.closest('.session-options')&&!e.target.closest('#header-more'))$('session-menu').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('session-menu').hidden=true;});
function loadHistoryEdge(mode,pane,direction){
  if(state.mode!==mode||state.loading)return;
  if(direction<0&&pane.scrollTop<80&&state.offset>0)loadTrace(true,'before');
  else if(direction>0&&pane.scrollHeight-pane.scrollTop-pane.clientHeight<80&&state.next!==null)loadTrace(true,true);
}
for(const [mode,id]of [['chat','chat-pane'],['trace','table-pane']]){
  const pane=$(id);let lastScrollTop=0;
  pane.addEventListener('scroll',()=>{const top=pane.scrollTop;loadHistoryEdge(mode,pane,top-lastScrollTop);lastScrollTop=top;});
  pane.addEventListener('wheel',event=>loadHistoryEdge(mode,pane,event.deltaY),{passive:true});
}
let rangeDrag=null;
let suppressTimelineClickUntil=0;
function timelineCoordinate(x){const bounds=$('timeline').getBoundingClientRect(),[start,end]=state.viewport||[0,1];return start+Math.max(0,Math.min(1,(x-bounds.left)/Math.max(1,bounds.width)))*(end-start);}
$('timeline').addEventListener('wheel',e=>{e.preventDefault();const bounds=$('timeline').getBoundingClientRect(),[start,end]=state.viewport||[0,1];const fraction=Math.max(0,Math.min(1,(e.clientX-bounds.left)/Math.max(1,bounds.width)));const minimum=state.duration?Math.min(1,20/timelineTimes()[1]):Math.min(1,4/Math.max(1,state.data?.event_count||1));const span=Math.min(1,Math.max(minimum,(end-start)*Math.exp(e.deltaY*.0015)));const nextStart=Math.max(0,Math.min(1-span,start+fraction*(end-start)-fraction*span));state.viewport=span>=.999?null:[nextStart,nextStart+span];renderTimeline();},{passive:false});
$('timeline').addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;++state.focusGeneration;rangeDrag={start:timelineCoordinate(e.clientX),x:e.clientX,pointer:e.pointerId,moved:false,pan:e.button===2,viewport:state.viewport?.slice()};});
window.addEventListener('pointermove',e=>{if(!rangeDrag||e.pointerId!==rangeDrag.pointer||!rangeDrag.moved&&Math.abs(e.clientX-rangeDrag.x)<4)return;if(!rangeDrag.moved){rangeDrag.moved=true;$('timeline').setPointerCapture(e.pointerId);}if(rangeDrag.pan){if(rangeDrag.viewport){const [start,end]=rangeDrag.viewport,span=end-start,nextStart=Math.max(0,Math.min(1-span,start-(e.clientX-rangeDrag.x)/Math.max(1,$('timeline').clientWidth)*span));state.viewport=[nextStart,nextStart+span];renderTimeline();}return;}const end=timelineCoordinate(e.clientX);state.range=[Math.min(rangeDrag.start,end),Math.max(rangeDrag.start,end)];renderTimeline();renderRows();});
function endRangeDrag(event){if(!rangeDrag||event.pointerId!==rangeDrag.pointer)return;const focus=rangeDrag.moved&&!rangeDrag.pan&&event.type==='pointerup';if(rangeDrag.moved)suppressTimelineClickUntil=performance.now()+250;rangeDrag=null;if(focus)focusTimelineRange();}
window.addEventListener('pointerup',endRangeDrag);window.addEventListener('pointercancel',endRangeDrag);
$('timeline').addEventListener('click',e=>{if(e.detail&&performance.now()<suppressTimelineClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
$('timeline').addEventListener('pointermove',e=>{const line=$('timeline').querySelector('.timeline-hover-line');if(line){line.style.left=(e.clientX-$('timeline').getBoundingClientRect().left)+'px';line.style.opacity='1';}});
$('timeline').addEventListener('pointerleave',()=>{const line=$('timeline').querySelector('.timeline-hover-line');if(line)line.style.opacity='0';});
$('timeline').addEventListener('contextmenu',e=>e.preventDefault());
$('timeline').addEventListener('dblclick',()=>{state.range=null;state.viewport=null;renderTimeline();renderRows();});
let resize=null;
$('detail-resize').tabIndex=0;
$('detail-resize').addEventListener('pointerdown',e=>{e.preventDefault();resize={x:e.clientX,width:$('details').getBoundingClientRect().width};$('detail-resize').setPointerCapture(e.pointerId);});
window.addEventListener('pointermove',e=>{if(resize)$('details').style.width=Math.max(280,Math.min($('split').clientWidth-280,resize.width+resize.x-e.clientX))+'px';});
window.addEventListener('pointerup',()=>{resize=null;});
$('detail-resize').addEventListener('dblclick',()=>{$('details').style.width='';});
$('detail-resize').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();$('details').style.width=Math.max(280,Math.min($('split').clientWidth-280,$('details').clientWidth+(e.key==='ArrowLeft'?20:-20)))+'px';}});
new ResizeObserver(()=>renderTimeline()).observe($('timeline'));
const canSync=()=>!document.hidden&&!window.agentSessionsPaused&&window.agentSessionsWindowVisible!==false;
document.addEventListener('visibilitychange',()=>{if(canSync()&&!state.loading)loadTrace();});
setInterval(()=>{if(canSync()&&!state.loading)loadTrace();},3000);
setInterval(()=>{if(canSync())loadSessions(false,true);},15000);
for(const button of document.querySelectorAll('button[aria-label]'))if(!button.title)button.title=button.getAttribute('aria-label');
syncFoldControls();syncTabs();loadPreferences().then(()=>loadSessions());
