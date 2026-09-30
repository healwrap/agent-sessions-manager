"""Fixtures verify native result matching, branches, WAL, incremental reads and keys."""
import json
import sqlite3
import tempfile
import hashlib
from pathlib import Path
from unittest.mock import patch
from agent_sources import MultiStore, readonly_db
from view_settings import ViewSettings


def main():
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder);claude = root/'claude';agy = root/'agy';codex = root/'codex'
        path = claude/'projects/project/same.jsonl';path.parent.mkdir(parents=True)
        def msg(uuid, role, content, parent=None):
            return {'uuid': uuid, 'parentUuid': parent, 'type': role, 'sessionId': 'same', 'cwd': '/tmp/same-project', 'timestamp': '2026-09-30T00:00:00Z', 'message': {'role': role, 'content': content}}
        rows = [msg('u1','user','token=original '+ '全文'*300+'深处检索词'),
                msg('a-old','assistant',[{'type':'text','text':'已放弃分支'}], 'u1'),
                msg('a1','assistant',[{'type':'tool_use','id':'call1','name':'bash','input':{'command':'first'}},{'type':'tool_use','id':'call2','name':'bash','input':{'command':'second'}}],'u1'),
                msg('r1','user',[{'type':'tool_result','tool_use_id':'call2','content':'SECOND token=exact'},{'type':'tool_result','tool_use_id':'call1','content':'FIRST'}],'a1'),
                msg('a2','assistant',[{'type':'thinking','thinking':'HIDDEN-REASONING'},{'type':'text','text':'回答'}],'r1')]
        path.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        transcript = agy/'brain/same/.system_generated/logs/transcript_full.jsonl';transcript.parent.mkdir(parents=True)
        transcript.write_text('\n'.join(json.dumps(r) for r in [
            {'step_index':0,'type':'USER_INPUT','content':'用户原话'},
            {'step_index':1,'type':'PLANNER_RESPONSE','thinking':'HIDDEN-AGY','tool_calls':[{'name':'run','args':{'CommandLine':'echo original'}}]},
            {'step_index':2,'type':'GENERIC','content':'UNLINKED RESULT'},
            {'step_index':3,'type':'PLANNER_RESPONSE','content':'原始回答'}])+ '\n')
        s=MultiStore(codex,claude,agy,root/'absent')
        catalogue=s.catalogue(); c=next(r['id'] for r in catalogue if r['provider']=='claude');a=next(r['id'] for r in catalogue if r['provider']=='antigravity')
        assert c!=a and s.sessions(provider='claude')['total']==1
        t=s.trajectory(c); calls=[e for e in t['events'] if e['kind']=='tool']
        assert len(calls)==2 and not any('已放弃分支' in e['preview'] for e in t['events'])
        assert s.detail(c,calls[0]['ref'],part='output')['text']=='FIRST'
        assert s.detail(c,calls[1]['ref'],part='output')['text']=='SECOND token=exact'
        assert s.trajectory(c,0,150,'深处检索词')['total']==1
        assert not any('HIDDEN' in e['preview'] for e in t['events'])
        at=s.trajectory(a);ac=next(e for e in at['events'] if e['kind']=='tool')
        assert not s.detail(a,ac['ref'],part='output')['output_available']
        assert any(e['preview']=='UNLINKED RESULT' for e in at['events'])
        with transcript.open('a') as f:
            f.write(json.dumps({'step_index':1,'type':'PLANNER_RESPONSE','status':'DONE','content':'更新后的过程'})+'\n')
        refreshed=s.trajectory(a)
        assert [e['ref'] for e in refreshed['events']]==['S/0','S/1','S/2','S/3']
        assert refreshed['events'][1]['status']=='completed'
        # A half-written append must remain invisible until its newline arrives.
        append=json.dumps(msg('u2','user','新增记录','a2'))
        with path.open('a') as f:f.write(append)
        assert s.trajectory(c)['event_count']==t['event_count']
        with path.open('a') as f:f.write('\n')
        assert s.trajectory(c)['event_count']==t['event_count']+1
        path.write_text(path.read_text().replace(json.dumps('新增记录'),json.dumps('更新记录')))
        assert s.trajectory(c)['events'][-1]['preview']=='更新记录'
        # Summary-only Antigravity sessions remain visible with an honest empty state.
        summary=sqlite3.connect(agy/'conversation_summaries.db')
        summary.execute('create table conversation_summaries(conversation_id,title,workspace_uris,last_modified_time,status,parent_conversation_id)')
        summary.execute('insert into conversation_summaries values(?,?,?,?,?,?)',('missing','只有摘要','[]','2026-09-30T01:00:00Z','CASCADE_RUN_STATUS_IDLE',None))
        summary.commit();summary.close();s.catalogue_time=0
        assert any(r['id']=='antigravity:desktop:missing' for r in s.catalogue())
        empty=s.trajectory('antigravity:desktop:missing')
        assert empty['event_count']==0 and empty['unavailable_reason']
        # Force the snapshot fallback and confirm it includes committed WAL data.
        dbpath=root/'wal.db';writer=sqlite3.connect(dbpath);writer.execute('pragma journal_mode=wal');writer.execute('create table test(value)');writer.execute('insert into test values (42)');writer.commit()
        connect=sqlite3.connect
        def connect_copy(name,*args,**kwargs):
            if str(name).startswith('file:'):raise sqlite3.OperationalError('source shm unavailable')
            return connect(name,*args,**kwargs)
        before=hashlib.sha256(dbpath.read_bytes()).hexdigest()
        with patch('agent_sources.sqlite3.connect',side_effect=connect_copy):
            db,temporary=readonly_db(dbpath);assert db.execute('select value from test').fetchone()==(42,);db.close();temporary.cleanup()
        assert hashlib.sha256(dbpath.read_bytes()).hexdigest()==before;writer.close()
        settings=ViewSettings(root/'application-state');settings.write({'pinned':[c],'projectAssignments':{c:{'project_id':'manual','project_label':'自定义项目','project_path':'/tmp/manual'}}});s.settings=settings;s.catalogue_time=0
        assert next(r for r in s.catalogue() if r['id']==c)['project_label']=='自定义项目'
        assert ViewSettings(root/'application-state').read()['value']['pinned']==[c]
    print('agent sources self-test: ok (matching, forks, native keys, full search, partial append, WAL, view persistence)')


if __name__=='__main__':main()
