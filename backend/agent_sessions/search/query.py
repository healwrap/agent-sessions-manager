"""Literal substring matching, with explicit whitespace-separated AND terms."""


def terms(query, mode='words'):
    if mode not in ('words', 'literal'): raise ValueError('搜索模式无效')
    value = query.strip().casefold()
    result = tuple(dict.fromkeys(value.split())) if mode == 'words' else ((value,) if value else ())
    if len(value) > 2000 or len(result) > 64: raise ValueError('搜索词过长，请缩短后重试')
    return result


def matches(text, needles):
    folded = text.casefold()
    return all(term in folded for term in needles)
