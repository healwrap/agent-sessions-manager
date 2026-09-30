#!/usr/bin/env python3
"""Prove attribution, including cases where output order alone is unsafe."""
import json
from nested_results import match_nested_results, nested_result_status


def blocks(*values):
    return [{'type': 'input_text', 'text': text} for text in
            ['Script completed\nWall time 0.1 seconds\nOutput:\n', *values]]


def main():
    sequential = 'text(await tools.exec_command({cmd:"one"})); text(await tools.exec_command({cmd:"two"}));'
    names = ['exec_command', 'exec_command']
    found = match_nested_results(sequential, blocks('one-original', 'two-original'), names)
    assert found[0]['text'] == 'one-original' and found[1]['text'] == 'two-original'
    assert not match_nested_results(sequential, blocks('combined-unlabelled'), names)
    assert not match_nested_results(sequential + 'text("extra")', blocks('one', 'two'), names)
    assert not match_nested_results('if(ok){' + sequential + '}', blocks('one', 'two'), names)
    assert not match_nested_results('text(await tools.exec_command({cmd:"fake tools.other()"}));', blocks('one'), ['exec_command', 'other'])
    indexed = 'const rs=await Promise.allSettled([tools.exec_command({cmd:"one"}),tools.exec_command({cmd:"two"})]);rs.forEach((r,i)=>text({i,...r}));'
    zero = json.dumps({'i': 0, 'status': 'fulfilled', 'value': {'exit_code': 0, 'output': '原值 token=one'}})
    one = json.dumps({'i': 1, 'status': 'rejected', 'reason': {'message': 'different failure'}})
    found = match_nested_results(indexed, blocks(one, zero), names)
    assert found[0]['text'] == zero and found[1]['text'] == one
    assert not match_nested_results(indexed.replace('allSettled', 'all'), blocks(zero, one), names)
    partial = match_nested_results(indexed, blocks('Warning: truncated output\n' + zero + '\n{"i":1,"value":'), names)
    assert list(partial) == [0]
    duplicate = match_nested_results(indexed, blocks(zero, zero, one), names)
    assert list(duplicate) == [1]
    unknown = 'const rs=await someHelper(); rs.forEach((r,i)=>text({i,...r}));'
    assert not match_nested_results(unknown, blocks(zero, one), names)
    loop = 'const rs=await Promise.allSettled([tools.exec_command({cmd:"one"}),tools.exec_command({cmd:"two"})]);for(let i=0;i<rs.length;i++)text({check:i,result:rs[i]});'
    result = json.dumps({'check': 1, 'result': {'status': 'fulfilled', 'value': 'two'}})
    assert match_nested_results(loop, blocks(result), names)[1]['text'] == result
    assert nested_result_status(zero) == 'success'
    assert nested_result_status(one) == 'error'
    assert nested_result_status(json.dumps({'exit_code': 0, 'output': 'Documentation: exit_code: 1, script failed'})) == 'success'
    assert nested_result_status('{}') == 'result'
    assert nested_result_status(json.dumps({'session_id': 42, 'exit_code': None})) == 'running'
    print('nested results self-test: ok (sequence, indexed, rejection, truncation, duplicates, ambiguous scripts)')


if __name__ == '__main__':
    main()
