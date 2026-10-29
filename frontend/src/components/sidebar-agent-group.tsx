import { useState } from 'react';
import type { AppState } from '../state/session-store';
import { sessionStore } from '../state/session-store';
import { projectGroupKey, type agentGroups } from '../lib/agent-groups';
import { AgentIcon } from './agent-icon';
import { Collapse, Icon } from './primitives';
import { MarqueeTitle } from './marquee-title';
import {
  SidebarProjectGroup,
  type SessionManageProps,
} from './sidebar-project-group';

export function SidebarAgentGroup({
  state,
  group,
  ...manage
}: SessionManageProps & {
  state: AppState;
  group: ReturnType<typeof agentGroups>[number];
}) {
  const [searchFold, setSearchFold] = useState<{
    query: string;
    open: boolean;
  } | null>(null);
  const open = state.query
    ? searchFold?.query === state.query
      ? searchFold.open
      : true
    : (state.preferences.expandedAgents || []).includes(group.id);
  function toggle() {
    if (state.query) {
      setSearchFold({ query: state.query, open: !open });
      return;
    }
    const expanded = new Set(state.preferences.expandedAgents || []);
    if (open) expanded.delete(group.id);
    else expanded.add(group.id);
    void sessionStore.savePreferences({
      ...state.preferences,
      expandedAgents: [...expanded],
    });
  }
  return (
    <section className="agent-group" aria-label={group.label}>
      <button className="agent-heading" aria-expanded={open} onClick={toggle}>
        <Icon name="right" className="project-chevron" />
        <AgentIcon source={group.id} monochrome />
        <MarqueeTitle className="agent-name" text={group.label} />
        <span className="agent-session-count" title={`${group.count} 个会话`}>
          {group.count}
        </span>
      </button>
      <Collapse open={open}>
        <div className="agent-projects">
          {group.projects.map((project) => (
            <SidebarProjectGroup
              key={projectGroupKey(project)}
              state={state}
              group={project}
              {...manage}
            />
          ))}
          {!group.projects.length && (
            <p className="sidebar-empty">暂无本地会话</p>
          )}
        </div>
      </Collapse>
    </section>
  );
}
