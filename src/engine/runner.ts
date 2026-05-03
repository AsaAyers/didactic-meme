import { rules, ruleSpecs } from '../rules/index.js';
import { FileWriteManager } from './io.js';
import { runRuleSpec } from './ruleSpecRunner.js';
import type { RuleContext, RuleSpec } from '../rules/types.js';

/**
 * Sort `specs` so that every spec's dependencies appear before it in the
 * returned array.  Throws if a dependency name is unknown or if there is a
 * circular dependency.
 */
export function sortRuleSpecs(specs: RuleSpec[]): RuleSpec[] {
  const specMap = new Map(specs.map((s) => [s.name, s]));

  // Validate that every declared dependency actually exists in the set.
  for (const spec of specs) {
    for (const dep of spec.dependencies ?? []) {
      if (!specMap.has(dep)) {
        throw new Error(`RuleSpec "${spec.name}" depends on unknown spec "${dep}"`);
      }
    }
  }

  // Kahn's algorithm: build an adjacency list (dep → dependents) and an
  // in-degree counter, then process nodes with no remaining dependencies.
  const inDegree = new Map(specs.map((s) => [s.name, 0]));
  const adjList = new Map<string, string[]>(specs.map((s) => [s.name, []]));

  for (const spec of specs) {
    for (const dep of spec.dependencies ?? []) {
      adjList.get(dep)!.push(spec.name);
      inDegree.set(spec.name, (inDegree.get(spec.name) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const sorted: RuleSpec[] = [];
  while (queue.length > 0) {
    // shift() (FIFO) keeps the original registration order for independent
    // specs, which is a useful stability property.  Spec lists are small, so
    // the O(n) cost is negligible.
    const name = queue.shift()!;
    sorted.push(specMap.get(name)!);
    for (const neighbor of adjList.get(name) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== specs.length) {
    throw new Error('Circular dependency detected among RuleSpecs');
  }

  return sorted;
}

/**
 * Run all registered rules against the vault.
 *
 * A single FileWriteManager (transform queue) is shared across every rule:
 *   - Reads go through the queue so staged changes from earlier rules are
 *     immediately visible to later ones, even in dry-run mode.
 *   - Writes are queued throughout the run and flushed once at the end.
 *
 * @param baseCtx  All RuleContext fields except `readFile` (wired internally).
 * @returns        `changes` — the list of staged file writes (path + content).
 *                 `report`  — the full terminal output that was also printed to
 *                             console, suitable for snapshot testing.
 */
export async function runAllRules(baseCtx: Omit<RuleContext, 'readFile'>): Promise<{
  changes: Array<{ path: string; content: string }>;
  report: string;
}> {
  const queue = new FileWriteManager();
  const ctx: RuleContext = { ...baseCtx, readFile: (p: string) => queue.read(p) };

  const lines: string[] = [];
  /** Emit a line to both the console and the captured report. */
  const log = (msg: string): void => {
    console.log(msg);
    lines.push(msg);
  };

  const summaries: string[] = [];

  // Declarative RuleSpecs (e.g. normalization) run first, ordered by deps.
  for (const spec of sortRuleSpecs(ruleSpecs)) {
    log(`Running rule spec: ${spec.name}`);
    try {
      const result = await runRuleSpec(spec, ctx);
      for (const change of result.changes) {
        queue.stage(change.path, change.content);
      }
      summaries.push(`  [${spec.name}] ${result.summary}`);
    } catch (err) {
      summaries.push(`  [${spec.name}] ERROR: ${(err as Error).message}`);
    }
  }

  // Imperative rules run after; they read through the queue so they see
  // any normalization applied by the specs above.
  for (const rule of rules) {
    log(`Running rule: ${rule.name}`);
    try {
      const result = await rule.run(ctx);
      for (const change of result.changes) {
        queue.stage(change.path, change.content);
      }
      summaries.push(`  [${rule.name}] ${result.summary}`);
    } catch (err) {
      summaries.push(`  [${rule.name}] ERROR: ${(err as Error).message}`);
    }
  }

  // Flush everything once at the end.
  const written = await queue.commit(ctx.dryRun, log);

  log('\n=== Run Summary ===');
  for (const s of summaries) {
    log(s);
  }
  if (written.length > 0) {
    log('\nFiles written:');
    for (const { path: f } of written) {
      log(`  ${f}`);
    }
  } else {
    log('\nNo files written.');
  }

  return { changes: written, report: lines.join('\n') };
}
