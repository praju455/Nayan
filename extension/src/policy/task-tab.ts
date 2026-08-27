export type TaskTabCandidate = Readonly<{ id?: number; url?: string; title?: string; active?: boolean }>;

const ignoredTerms = new Set(["after", "and", "chat", "confirm", "from", "named", "open", "reply", "send", "that", "the", "then", "this", "type", "with"]);

function isRegularSite(tab: TaskTabCandidate): boolean {
  return Boolean(tab.url && /^https?:\/\//.test(tab.url));
}

/** Select an already-open website explicitly suggested by the user's task. */
export function selectTaskTab(tabs: readonly TaskTabCandidate[], task: string): TaskTabCandidate | undefined {
  const candidates = tabs.filter((tab) => Number.isInteger(tab.id) && isRegularSite(tab));
  const terms = [...new Set((task.toLowerCase().match(/[a-z0-9][a-z0-9_.-]{2,}/g) ?? []).filter((term) => !ignoredTerms.has(term)))];
  const scored = candidates.map((tab) => {
    const searchable = `${tab.url ?? ""} ${tab.title ?? ""}`.toLowerCase();
    return { tab, score: terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0) };
  }).sort((left, right) => right.score - left.score || Number(right.tab.active) - Number(left.tab.active));
  return scored.find(({ score }) => score > 0)?.tab ?? candidates.find((tab) => tab.active) ?? candidates[0];
}
