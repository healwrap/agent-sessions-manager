import { useState } from 'react';
import { Braces, WrapText } from 'lucide-react';
import type { CodeProgram, Detail } from '../../lib/types';
import { copyText } from '../../lib/api';
import { tokenStyle, useCodeTokens } from '../../lib/code-highlighter';
import { Icon } from '../primitives';
import { Payload } from './payload';
import { OverviewSection } from './overview-section';
import { stringWrapping } from '../../lib/string-wrapping';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState('idle');
  const title =
    state === 'copied' ? '已复制' : state === 'failed' ? '复制失败' : label;
  return (
    <button
      type="button"
      className="programAction"
      data-tooltip={title}
      aria-label={title}
      data-state={state}
      onClick={() =>
        void copyText(text).then(
          () => setState('copied'),
          () => setState('failed'),
        )
      }
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} />
    </button>
  );
}

export function ProgramInput({
  program,
  onOpen,
}: {
  program: CodeProgram;
  onOpen?: () => void;
}) {
  const [wrapped, setWrapped] = useState(stringWrapping.getDefault);
  const [showJson, setShowJson] = useState(false);
  const displaySource = program.source.endsWith('\n')
    ? program.source.slice(0, -1)
    : program.source;
  const highlighted = useCodeTokens(displaySource, program.language);
  const actions = (
    <span className="programActions">
      {!showJson && program.language && (
        <span className="programLanguage">{program.language}</span>
      )}
      {!showJson && (
        <button
          type="button"
          className="programAction"
          data-tooltip="自动换行"
          aria-label="自动换行"
          aria-pressed={wrapped}
          onClick={() => {
            setWrapped(!wrapped);
            stringWrapping.setDefault(!wrapped);
          }}
        >
          <WrapText size={12} />
        </button>
      )}
      {!onOpen && (
        <button
          type="button"
          className="programAction"
          data-tooltip="原始 JSON"
          aria-label="原始 JSON"
          aria-pressed={showJson}
          onClick={() => setShowJson(!showJson)}
        >
          <Braces size={12} />
        </button>
      )}
      <CopyButton
        text={showJson ? program.raw_input : program.source}
        label={showJson ? '复制 JSON' : '复制源码'}
      />
    </span>
  );
  const body = (
    <div className="programContent" data-wrap={wrapped}>
      {showJson ? (
        <Payload text={program.raw_input} label="参数 JSON" />
      ) : (
        <pre className="programSource">
          <code>
            {displaySource.split(/\r?\n/).map((line, i) => (
              <span className="programLine" key={i}>
                <span className="programLineNumber" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  {highlighted?.[i]?.map((token, index) => (
                    <span key={index} style={tokenStyle(token)}>
                      {token.content}
                    </span>
                  )) ||
                    line ||
                    '\u200b'}
                </span>
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
  return onOpen ? (
    <OverviewSection label="源码" onOpen={onOpen} actions={actions}>
      {body}
    </OverviewSection>
  ) : (
    <section className="programPanel">
      <header className="overview-heading">
        <span>源码</span>
        {actions}
      </header>
      {body}
    </section>
  );
}

export function ProgramOutput({
  detail,
  onOpen,
}: {
  detail: Detail;
  onOpen?: () => void;
}) {
  const actions = (
    <span className="programActions">
      <CopyButton text={detail.text} label="复制输出" />
    </span>
  );
  const body = (
    <div className="programContent">
      {!detail.text ? (
        <p className="metadata-note">
          {detail.event.status === 'running' ? '正在执行…' : '无输出'}
        </p>
      ) : detail.event.status === 'error' ? (
        <pre className="programOutput programError">{detail.text}</pre>
      ) : (
        <Payload
          text={detail.text}
          label="结果 JSON"
          preview={onOpen != null}
        />
      )}
    </div>
  );
  return onOpen ? (
    <OverviewSection label="输出" onOpen={onOpen} actions={actions}>
      {body}
    </OverviewSection>
  ) : (
    <section className="programPanel">
      <header className="overview-heading">
        <span>输出</span>
        {actions}
      </header>
      {body}
    </section>
  );
}
