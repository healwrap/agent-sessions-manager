import { useEffect, useRef, useState } from 'react';
import type { Detail, Event } from '../../lib/types';
import { copyText } from '../../lib/api';
import { sessionStore } from '../../state/session-store';
import { RecordPages, useRecord } from './use-record';

function resultBody(text: string, markers: boolean, structured: boolean) {
  if (structured) {
    try {
      const result = JSON.parse(text);
      if (result && typeof result.output === 'string')
        return {
          text: result.output,
          status:
            typeof result.exitCode === 'number' && result.exitCode !== 0
              ? `退出码 ${result.exitCode}`
              : '',
        };
    } catch {
      // Partial pages and unsupported envelopes keep their recorded content.
    }
  }
  if (!markers) return { text, status: '' };
  const signal = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text);
  if (signal)
    return { text: text.slice(0, signal.index), status: `信号 ${signal[1]}` };
  const exit = /\n\[exit code: (\d+)\]$/.exec(text);
  return exit
    ? {
        text: text.slice(0, exit.index),
        status: Number(exit[1]) ? `退出码 ${exit[1]}` : '',
      }
    : { text, status: '' };
}

export function TerminalCard({
  input,
  event,
  id,
}: {
  input: Detail;
  event: Event;
  id: string;
}) {
  const terminal = input.terminal!;
  const output = useRecord(
    id,
    event,
    event.output_chars,
    input.output_available,
    'output',
  );
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const text = output.detail?.text || '';
  const result = resultBody(
    text,
    terminal.exit_markers && output.detail?.page === output.detail?.pages,
    terminal.result_format === 'command-json' &&
      output.detail?.page === output.detail?.pages,
  );
  const running = ['running', 'in_progress'].includes(event.status);
  const state =
    result.status || event.status === 'error'
      ? 'error'
      : event.status === 'aborted'
        ? 'aborted'
        : running
          ? 'running'
          : input.output_available
            ? 'completed'
            : 'pending';
  const label = {
    error: '失败',
    aborted: '已停止',
    running: '运行中',
    completed: '已完成',
    pending: '未记录关联输出',
  }[state];
  const cwd = terminal.cwd;
  const prompt =
    cwd
      ?.replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .at(-1) ||
    cwd ||
    '$';
  const command = terminal.command.endsWith('\n')
    ? terminal.command.slice(0, -1)
    : terminal.command;
  const copy = async () => {
    try {
      await copyText(output.detail ? text : terminal.command);
      sessionStore.notify('已复制终端内容。', { tone: 'success' });
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1000);
    } catch (error) {
      sessionStore.notify(String(error), { tone: 'error' });
    }
  };
  return (
    <div ref={output.ref} className="chat-terminal" data-status={state}>
      <div className="chat-terminal-header">
        <div className="chat-terminal-prompt">
          {command.split('\n').map((line, index) => (
            <div className="chat-terminal-prompt-line" key={index}>
              {index === 0 && (
                <span
                  className="chat-terminal-state"
                  role="img"
                  aria-label={label}
                  data-tooltip={label}
                />
              )}
              <span
                className="chat-terminal-cwd"
                data-tooltip={index === 0 ? cwd || undefined : undefined}
              >
                {index ? '$' : prompt}
              </span>
              <span className="chat-terminal-command" data-tooltip={line}>
                {line || '\u200b'}
              </span>
            </div>
          ))}
        </div>
        {result.status && (
          <span className="chat-terminal-status">{result.status}</span>
        )}
        <button
          type="button"
          className="chat-terminal-copy"
          data-tooltip={output.detail ? '复制已载入输出' : '复制命令'}
          onClick={() => void copy()}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {(input.output_available || !running) && (
        <div className="chat-terminal-output">
          {output.detail ? (
            <pre>
              {result.text.endsWith('\n')
                ? result.text.slice(0, -1)
                : result.text || '无输出'}
            </pre>
          ) : (
            <span className="chat-terminal-placeholder">
              {output.busy
                ? '正在读取…'
                : input.output_available
                  ? '等待读取输出…'
                  : '未记录关联输出'}
            </span>
          )}
          <RecordPages record={output} />
        </div>
      )}
    </div>
  );
}
