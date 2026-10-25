import { scoreText } from "@/lib/model-search";
import type { Command } from "./use-commands";

/* Keywords answer the query too, but a hit on what the row actually says
   outranks a hit on a word it doesn't show. */
const KEYWORD_WEIGHT = 0.8;

function scoreCommand(command: Command, query: string): number {
  let best = scoreText(command.label, query);
  for (const keyword of command.keywords) {
    best = Math.max(best, scoreText(keyword, query) * KEYWORD_WEIGHT);
  }
  return best;
}

/** The palette rows for a query, best first; an empty query lists every
 *  runnable command in registry order. */
export function matchCommands(commands: Command[], query: string): Command[] {
  const listed = commands.filter(
    (command) => command.inPalette && command.available,
  );
  if (!query) return listed;
  return listed
    .map((command) => ({ command, score: scoreCommand(command, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ command }) => command);
}
