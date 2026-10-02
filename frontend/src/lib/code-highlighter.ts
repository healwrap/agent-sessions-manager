// Same grammar engine and CSS theme as Harness; load only when opening source.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { HighlighterCore, ThemedToken } from 'shiki/core';

const languages = new Map([
  ['typescript', () => import('@shikijs/langs/typescript')],
  ['python', () => import('@shikijs/langs/python')],
  ['shellscript', () => import('@shikijs/langs/shellscript')],
  ['json', () => import('@shikijs/langs/json')],
]);
const aliases = new Map([
  ['ts', 'typescript'],
  ['js', 'typescript'],
  ['javascript', 'typescript'],
  ['py', 'python'],
  ['bash', 'shellscript'],
  ['sh', 'shellscript'],
  ['zsh', 'shellscript'],
]);
let core: Promise<HighlighterCore> | undefined;
const grammars = new Map<string, Promise<void>>();

function highlighter() {
  return (core ??= Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
  ]).then(([shiki, engine]) =>
    shiki.createHighlighterCoreSync({
      themes: [
        shiki.createCssVariablesTheme({
          name: 'css-variables',
          variablePrefix: '--shiki-',
          fontStyle: true,
        }),
      ],
      langs: [],
      engine: engine.createJavaScriptRegexEngine({
        forgiving: true,
        regexConstructor: (pattern) =>
          engine.defaultJavaScriptRegexConstructor(pattern, {
            lazyCompileLength: Number.POSITIVE_INFINITY,
          }),
      }),
    }),
  ));
}

export function useCodeTokens(code: string, hint?: string) {
  const [value, setValue] = useState<{
    code: string;
    language: string;
    lines: ThemedToken[][];
  } | null>(null);
  const language = aliases.get(hint || '') || hint || '';
  useEffect(() => {
    const load = languages.get(language);
    if (!load) return;
    let cancelled = false;
    void highlighter()
      .then(async (instance) => {
        if (!grammars.has(language))
          grammars.set(
            language,
            load().then((module) => instance.loadLanguageSync(module.default)),
          );
        await grammars.get(language);
        if (cancelled) return;
        const lines = instance.codeToTokens(code, {
          lang: language,
          theme: 'css-variables',
          tokenizeTimeLimit: 500,
        }).tokens;
        setValue({ code, language, lines });
      })
      .catch(() => {
        /* Unknown or unsupported code retains its original plain text. */
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);
  return value?.code === code && value.language === language
    ? value.lines
    : undefined;
}

export function tokenStyle(token: ThemedToken): CSSProperties {
  return {
    color: token.color,
    fontStyle: (token.fontStyle || 0) & 1 ? 'italic' : undefined,
    fontWeight: (token.fontStyle || 0) & 2 ? 'bold' : undefined,
    textDecoration: (token.fontStyle || 0) & 4 ? 'underline' : undefined,
  };
}
