import type { Graph, JsonObject, WorkflowNodeType } from './models.ts';
export const nodeLabels: Record<WorkflowNodeType, string> = {
  start: 'Start',
  planner: 'Planner',
  agent_task: 'Agent task',
  condition: 'Condition',
  parallel_fork: 'Parallel fork',
  parallel_join: 'Parallel join',
  test: 'Test',
  review: 'Review',
  approval: 'Approval',
  git_commit: 'Git commit',
  end: 'End',
};
export const ports = (type: WorkflowNodeType): ('out' | 'true' | 'false')[] =>
  type === 'end' ? [] : type === 'condition' ? ['true', 'false'] : ['out'];
export function validateGraph(graph: Graph): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) errors.push('Node IDs must be unique.');
  if (graph.nodes.length > 100) errors.push('A workflow can contain at most 100 nodes.');
  if (graph.nodes.filter((n) => n.type === 'start').length !== 1)
    errors.push('A workflow needs exactly one Start node.');
  if (graph.nodes.filter((n) => n.type === 'end').length !== 1)
    errors.push('A workflow needs exactly one End node.');
  for (const node of graph.nodes)
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(node.id)) errors.push(`Invalid node ID: ${node.id}.`);
  const adjacency = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  const reverse = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  for (const edge of graph.edges) {
    const source = graph.nodes.find((n) => n.id === edge.source);
    const target = graph.nodes.find((n) => n.id === edge.target);
    if (!source || !target) {
      errors.push('An edge references a missing node.');
      continue;
    }
    if (
      !ports(source.type).includes(edge.source_port) ||
      target.type === 'start' ||
      edge.target_port !== 'in'
    )
      errors.push(`Invalid ports on ${edge.source} → ${edge.target}.`);
    adjacency.get(edge.source)?.push(edge.target);
    reverse.get(edge.target)?.push(edge.source);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (adjacency.get(id)?.some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (graph.nodes.some((n) => visit(n.id))) errors.push('Workflows cannot contain a cycle.');
  const reachable = (start: string, map: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      map.get(id)?.forEach(walk);
    };
    walk(start);
    return seen;
  };
  const start = graph.nodes.find((n) => n.type === 'start');
  const end = graph.nodes.find((n) => n.type === 'end');
  if (start && reachable(start.id, adjacency).size !== ids.size)
    errors.push('Every node must be reachable from Start.');
  if (end && reachable(end.id, reverse).size !== ids.size)
    errors.push('Every node must lead to End.');
  for (const node of graph.nodes) {
    if (
      node.type === 'condition' &&
      ports(node.type).some(
        (port) => !graph.edges.some((e) => e.source === node.id && e.source_port === port),
      )
    )
      errors.push(`${node.id} needs both true and false branches.`);
    if (node.type === 'parallel_fork') {
      const join = graph.nodes.find((n) => n.id === node.config.join_id);
      if (join?.type !== 'parallel_join' || join.config.fork_id !== node.id)
        errors.push(`${node.id} needs its matching Parallel join.`);
    }
    if (node.type === 'parallel_join') {
      const fork = graph.nodes.find((n) => n.id === node.config.fork_id);
      if (fork?.type !== 'parallel_fork' || fork.config.join_id !== node.id)
        errors.push(`${node.id} needs its matching Parallel fork.`);
    }
  }
  return [...new Set(errors)];
}
export const emptyGraph = (): Graph => ({
  schema_version: '1',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { id: 'start-end', source: 'start', target: 'end', source_port: 'out', target_port: 'in' },
  ],
});
export const lines = (value: string): string[] =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
export function parseObject(value: string): Record<string, import('./models.ts').Json> {
  const result: unknown = JSON.parse(value);
  if (typeof result !== 'object' || result === null || Array.isArray(result))
    throw new Error('Enter a JSON object.');
  return result as Record<string, import('./models.ts').Json>;
}

export const developmentGraph = (): Graph => {
  const types: WorkflowNodeType[] = [
    'start',
    'approval',
    'agent_task',
    'test',
    'review',
    'git_commit',
    'end',
  ];
  const ids = ['start', 'approve_scope', 'develop', 'test', 'review', 'commit', 'end'];
  return {
    schema_version: '1',
    nodes: types.map((type, index) => {
      const config: JsonObject = {};
      if (type === 'test' || type === 'review') config.target_node = 'develop';
      if (type === 'git_commit')
        Object.assign(config, { target_node: 'develop', test_node: 'test', review_node: 'review' });
      if (type === 'approval') config.action = 'execute_plan';
      return { id: ids[index], type, config };
    }),
    edges: ids.slice(1).map((target, index) => ({
      source: ids[index],
      target,
      source_port: 'out',
      target_port: 'in',
    })),
  };
};

/** Layout dependency ranks as columns and parallel nodes as separate rows. */
export function graphPositions(graph: Graph): Record<string, { x: number; y: number }> {
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const links = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const rank = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    if (!degree.has(edge.source) || !degree.has(edge.target)) continue;
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    links.get(edge.source)?.push(edge.target);
  }
  const queue = graph.nodes.filter((node) => degree.get(node.id) === 0).map((node) => node.id);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    for (const target of links.get(id) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(id) ?? 0) + 1));
      degree.set(target, (degree.get(target) ?? 0) - 1);
      if (degree.get(target) === 0) queue.push(target);
    }
  }
  const columns = new Map<number, string[]>();
  graph.nodes.forEach((node, index) => {
    const column = degree.get(node.id) ? index : (rank.get(node.id) ?? 0);
    columns.set(column, [...(columns.get(column) ?? []), node.id]);
  });
  const rows = Math.max(1, ...[...columns.values()].map((column) => column.length));
  return Object.fromEntries(
    [...columns].flatMap(([column, nodes]) =>
      nodes.map((id, index) => [
        id,
        {
          x: column * 280,
          y: 80 + (index + (rows - nodes.length) / 2) * 150,
        },
      ]),
    ),
  );
}
