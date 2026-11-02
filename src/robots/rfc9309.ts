/**
 * Test helper: the RFC 9309 matching rules, with no dependency. Groups run from
 * User-agent lines to the next User-agent line, and blank lines mean nothing. An
 * agent uses the groups naming it exactly (ignoring case), else `*`, and all of them
 * combine. The longest matching rule wins, and Allow wins a tie.
 */
export function isAllowed(robots: string, agent: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let inAgentLines = false;

  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!;
    if (key === "user-agent") {
      if (!inAgentLines) groups.push({ agents: [], rules: [] });
      groups.at(-1)!.agents.push(value.toLowerCase());
      inAgentLines = true;
    } else if (key === "allow" || key === "disallow") {
      inAgentLines = false;
      groups.at(-1)?.rules.push({ allow: key === "allow", path: value });
    } else if (key !== "sitemap") {
      inAgentLines = false;
    }
  }

  const named = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
  const applicable = named.length > 0 ? named : groups.filter((g) => g.agents.includes("*"));
  const rules = applicable.flatMap((g) => g.rules).filter((r) => r.path && path.startsWith(r.path));
  if (rules.length === 0) return true;

  const longest = Math.max(...rules.map((r) => r.path.length));
  return rules.some((r) => r.allow && r.path.length === longest);
}
