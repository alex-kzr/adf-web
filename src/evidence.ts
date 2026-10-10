import type { Graph, Json, NodeRun, Run } from './models.ts';

export function usageSummary(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'unknown';
  const usage = value as Record<string, unknown>;
  const known = (item: unknown): item is number =>
    typeof item === 'number' && Number.isFinite(item) && item >= 0;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  if (!known(input) && !known(output)) return 'unknown';
  return `${known(input) ? input.toLocaleString() : 'unknown'} input / ${known(output) ? output.toLocaleString() : 'unknown'} output tokens`;
}

export function currentPlanGraph(run: Run | undefined): Graph | undefined {
  if (!run?.plan_hash || run.result?.graph_proposal_plan_hash !== run.plan_hash) return undefined;
  const graph = run.result.graph_proposal;
  if (
    !graph ||
    typeof graph !== 'object' ||
    Array.isArray(graph) ||
    graph.schema_version !== '1' ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges)
  )
    return undefined;
  return graph as unknown as Graph;
}

export function conditionValue(field: string, operator: string, value: string): Json {
  const values = operator === 'in' ? value.split(',').map((item) => item.trim()) : [value];
  const typed: Json[] =
    field === 'status'
      ? values
      : values.map((item) => {
          if (item !== 'true' && item !== 'false')
            throw new Error('State conditions require boolean values.');
          return item === 'true';
        });
  return operator === 'in' ? typed : typed[0];
}

export type RunControlAction = 'pause' | 'resume' | 'cancel';
export function runControlNotice(
  action: RunControlAction,
  run: Pick<Run, 'status' | 'pause_requested' | 'cancel_requested'> | undefined,
  confirmed = false,
): { pending: boolean; message: string } {
  if (run && ['completed', 'failed', 'cancelled'].includes(run.status))
    return { pending: false, message: `Run ${run.status}.` };
  if (action === 'pause' && run?.status === 'paused')
    return { pending: false, message: 'Run paused. Active executions have drained.' };
  if (
    action === 'resume' &&
    run?.status === 'running' &&
    !run.pause_requested &&
    !run.cancel_requested
  )
    return { pending: false, message: 'Run resumed. Eligible work can dispatch.' };
  if (confirmed)
    return {
      pending: false,
      message: `${action} command confirmed. Current run state: ${run?.status ?? 'unknown'}.`,
    };
  return {
    pending: true,
    message: `${action} command persisted. Waiting for ledger confirmation.`,
  };
}

/** Project the current node attempt without changing the execution history. */
export function latestNodeStatuses(
  nodes: readonly Pick<NodeRun, 'node_id' | 'attempt' | 'status'>[],
): Record<string, string> {
  const latest = new Map<string, (typeof nodes)[number]>();
  for (const node of nodes) {
    const previous = latest.get(node.node_id);
    // Equal attempts retain the selected canonical row; history has no transition ordering.
    if (!previous || node.attempt > previous.attempt) latest.set(node.node_id, node);
  }
  return Object.fromEntries([...latest].map(([id, node]) => [id, node.status]));
}
