"""Match outputs only for statically verifiable exec emission patterns.

Never execute recorded JavaScript or associate arbitrary output by array length.
Unsupported scripts and incomplete records retain an explicit unmatched result.
"""
from __future__ import annotations

import json
import re


def nested_result_status(text):
    """Use explicit fields, never success/failure phrases in command stdout."""
    try:
        value = json.loads(text)
    except (ValueError, RecursionError):
        return 'result'
    codes, errors, running = [], [], []

    def inspect(item):
        if isinstance(item, dict):
            for key, child in item.items():
                if key in ('exit_code', 'exitCode') and type(child) is int:
                    codes.append(child)
                if key in ('isError', 'is_error') and type(child) is bool:
                    errors.append(child)
                if key == 'status' and child == 'rejected':
                    errors.append(True)
                if key == 'session_id' and child is not None and item.get('exit_code') is None:
                    running.append(True)
                if isinstance(child, (dict, list)):
                    inspect(child)
        elif isinstance(item, list):
            for child in item:
                inspect(child)
    inspect(value)
    if any(codes) or any(errors):
        return 'error'
    if running:
        return 'running'
    return 'success' if codes or errors else 'result'


def _skip(source, start):
    while start < len(source):
        if source[start].isspace() or source[start] == ';':
            start += 1
        elif source.startswith('//', start):
            end = source.find('\n', start)
            start = len(source) if end < 0 else end + 1
        elif source.startswith('/*', start):
            end = source.find('*/', start + 2)
            if end < 0:
                return len(source)
            start = end + 2
        else:
            break
    return start


def _balanced(source, start):
    pairs = {'(': ')', '[': ']', '{': '}'}
    stack, quote, escaped = [], None, False
    for pos in range(start, len(source)):
        char = source[pos]
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in "\"'`":
            quote = char
        elif char in pairs:
            stack.append(pairs[char])
        elif char in ')]}':
            if not stack or char != stack.pop():
                return None
            if not stack:
                return pos
    return None


def _tool(source, start):
    match = re.match(r'(?:await\s+)?tools\.([\w]+)\s*\(', source[start:])
    if not match:
        return None
    end = _balanced(source, start + match.end() - 1)
    return (match.group(1), end + 1) if end is not None else None


def _plan(source, names):
    """Return a proven emission order, including the exact index field."""
    start, sequence = _skip(source, 0), []
    while start < len(source):
        match = re.match(r'text\s*\(\s*await\s+', source[start:])
        if not match:
            break
        tool = _tool(source, start + match.end())
        if not tool:
            break
        name, pos = tool
        pos = _skip(source, pos)
        if pos >= len(source) or source[pos] != ')':
            break
        sequence.append(name)
        start = _skip(source, pos + 1)
    if start == len(source) and sequence == names:
        return 'sequence', None

    start = _skip(source, 0)
    match = re.match(r'(?:const|let)\s+(\w+)\s*=\s*await\s+Promise\.(all|allSettled)\s*\(\s*\[', source[start:])
    if not match:
        return None
    variable = match.group(1)
    pos, array = _skip(source, start + match.end()), []
    while pos < len(source) and source[pos] != ']':
        tool = _tool(source, pos)
        if not tool:
            return None
        name, pos = tool
        array.append(name)
        pos = _skip(source, pos)
        if pos < len(source) and source[pos] == ',':
            pos = _skip(source, pos + 1)
        elif pos >= len(source) or source[pos] != ']':
            return None
    if array != names or pos >= len(source):
        return None
    pos = _skip(source, pos + 1)
    if pos >= len(source) or source[pos] != ')':
        return None
    tail = source[_skip(source, pos + 1):].strip()
    var = re.escape(variable)
    each = re.fullmatch(rf'{var}\.forEach\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*text\s*\(\s*\{{([^{{}}]+)\}}\s*\)\s*\)\s*;?', tail)
    if each:
        item, index, body = each.groups()
        fields = [s.strip() for s in body.split(',')]
        if match.group(2) == 'all' and any(field.startswith('...') for field in fields):
            return None  # A tool's own i field could overwrite the emitted index.
        payload = any(re.fullmatch(rf'(?:\.\.\.\s*{re.escape(item)}|\w+\s*:\s*{re.escape(item)})', field) for field in fields)
    else:
        loop = re.fullmatch(rf'for\s*\(\s*let\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*{var}\.length\s*;\s*\1\+\+\s*\)\s*text\s*\(\s*\{{([^{{}}]+)\}}\s*\)\s*;?', tail)
        if not loop:
            return None
        index, body = loop.groups()
        fields = [s.strip() for s in body.split(',')]
        payload = any(re.fullmatch(rf'\w+\s*:\s*{var}\[\s*{re.escape(index)}\s*\]', field) for field in fields)
    keys = []
    for field in fields:
        if field == index:
            keys.append(index)
        else:
            found = re.fullmatch(rf'(\w+)\s*:\s*{re.escape(index)}', field)
            if found:
                keys.append(found.group(1))
    return ('indexed', keys[0]) if payload and len(keys) == 1 else None


def _blocks(output):
    if isinstance(output, str):
        return [output]
    if isinstance(output, list) and all(isinstance(block, dict) and isinstance(block.get('text'), str)
                                        and block.get('type') in ('text', 'input_text', 'output_text') for block in output):
        return [block['text'] for block in output]
    return None


def match_nested_results(source, output, names):
    plan, blocks = _plan(source, names), _blocks(output)
    if not plan or blocks is None:
        return {}
    # The runtime emits this status block separately from script text() emissions.
    if blocks and re.fullmatch(r'Script completed\nWall time [\d.]+ seconds\nOutput:\n?', blocks[0]):
        blocks = blocks[1:]
    method, key = plan
    if method == 'sequence':
        # One string containing several unlabelled results is not separable.
        if len(blocks) != len(names):
            return {}
        return {i: {'text': text, 'method': 'sequence'} for i, text in enumerate(blocks)}
    found, invalid = {}, set()
    for block in blocks:
        for line in block.splitlines():
            try:
                value = json.loads(line)
            except (ValueError, TypeError, RecursionError):
                continue
            if not isinstance(value, dict) or type(value.get(key)) is not int:
                continue
            i = value[key]
            if not 0 <= i < len(names):
                continue
            if i in found:
                invalid.add(i)
            found[i] = {'text': line, 'method': 'indexed'}
    return {i: result for i, result in found.items() if i not in invalid}
