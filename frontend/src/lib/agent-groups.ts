import { projectGroups, sourceId } from './selectors';
import {
  sourceNames,
  type Preferences,
  type Project,
  type Session,
  type Source,
} from './types';
import type { SearchMode } from './search';

export type SessionProjectGroup = ReturnType<typeof projectGroups>[number];

export function projectGroupKey(project: Project) {
  return JSON.stringify([project.source_id || '', project.project_id]);
}

export function agentGroups(
  sessions: Session[],
  projects: Project[],
  preferences: Preferences,
  provider: string,
  query: string,
  sources: Source[],
  searchMode: SearchMode,
) {
  const entries = sources.length
    ? sources.filter((source) => source.enabled)
    : Object.entries(sourceNames).map(([id, label]) => ({ id, label }));
  return entries
    .filter(
      ({ id }) => !provider || provider === id || provider === id.split(':')[0],
    )
    .map(({ id, label }) => {
      const groups = projectGroups(
        sessions.filter((item) => sourceId(item, sources) === id),
        projects.filter((project) => project.source_id === id),
        preferences,
        id,
        query,
        sources,
        searchMode,
      ).map((group) => ({ ...group, source_id: id }));
      return {
        id,
        label,
        projects: groups,
        count: groups.reduce((sum, group) => sum + group.count, 0),
      };
    })
    .filter((group) => !query || group.count > 0);
}
