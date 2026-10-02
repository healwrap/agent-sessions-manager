"""Recorded code artifact, with language declared by its historical schema."""
import json
import re


def recorded_program(raw_input, schema=None):
    try: arguments = json.loads(raw_input)
    except (ValueError, TypeError): return None
    if not isinstance(arguments, dict) or not isinstance(arguments.get('code'), str): return None
    if 'description' in arguments and not isinstance(arguments['description'], str): return None
    source = arguments['code']
    description = arguments.get('description', '')
    if not description.strip(): description = next((line.strip() for line in source.splitlines() if line.strip()), '')
    result = {'raw_input': raw_input, 'source': source, 'description': description, 'arguments': arguments}
    parameters = schema.get('parameters') if isinstance(schema, dict) else None
    properties = parameters.get('properties') if isinstance(parameters, dict) else None
    code = properties.get('code') if isinstance(properties, dict) else None
    hint = code.get('description') if isinstance(code, dict) else None
    if isinstance(hint, str):
        typescript = bool(re.search(r'\bTypeScript\b', hint, re.I))
        python = bool(re.search(r'\bPython\b', hint, re.I))
        if typescript != python: result['language'] = 'typescript' if typescript else 'python'
    return result
