import type { Detail } from '../../lib/types';
import { statusLabels } from '../../lib/types';
import { sessionStore } from '../../state/session-store';
import { OverviewSection } from './overview-section';
import { RecordContent } from './record-content';
import { RecordTiming } from './record-timing';

export function DshAssistantOverview({
  detail,
  id,
  change,
}: {
  detail: Detail;
  id: string;
  change: (tab: string) => void;
}) {
  const event = detail.event;
  const usage = event.usage;
  const contentTokens =
    usage?.outputTokens != null && usage.reasoningTokens != null
      ? usage.outputTokens - usage.reasoningTokens
      : null;
  const openRequest = () =>
    void sessionStore.selectEvent(event.ref, false, true);
  return (
    <>
      <dl className="overview">
        {event.request_number != null && (
          <div>
            <dt>来源</dt>
            <dd>
              <button className="detail-source-link" onClick={openRequest}>
                {`请求 #${event.request_number} ›`}
              </button>
            </dd>
          </div>
        )}
        <div>
          <dt>状态</dt>
          <dd>{statusLabels[event.status] || event.status}</dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd>
            {usage?.outputTokens == null
              ? '—'
              : `${usage.outputTokens.toLocaleString()} tok`}
          </dd>
        </div>
        {usage?.reasoningTokens != null && (
          <div className="requestTokenDetail">
            <dt>思考</dt>
            <dd>{usage.reasoningTokens.toLocaleString()} tok</dd>
          </div>
        )}
        {contentTokens != null && (
          <div className="requestTokenDetail">
            <dt>正文</dt>
            <dd>{contentTokens.toLocaleString()} tok</dd>
          </div>
        )}
      </dl>
      <div className="overview-sections">
        <OverviewSection label="预览" onOpen={() => change('预览')}>
          <div className="dsh-assistant-preview">
            <RecordContent detail={detail} id={id} preview />
          </div>
        </OverviewSection>
        {event.request_number != null && (
          <OverviewSection label="请求计时" onOpen={openRequest}>
            <RecordTiming event={event} request />
          </OverviewSection>
        )}
      </div>
    </>
  );
}
