import type { Graph, Json, Run } from './models.ts';

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
