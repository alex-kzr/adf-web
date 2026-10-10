import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  developmentGraph,
  emptyGraph,
  graphPositions,
  lines,
  parseObject,
  ports,
  validateGraph,
} from '../src/workflow.ts';

test('bounded development template includes scope approval and exact evidence bindings', () => {
  const graph = developmentGraph();
  assert.deepEqual(validateGraph(graph), []);
  assert.equal(graph.nodes.find((node) => node.type === 'approval')?.config.action, 'execute_plan');
  assert.deepEqual(graph.nodes.find((node) => node.type === 'git_commit')?.config, {
    target_node: 'develop',
    test_node: 'test',
    review_node: 'review',
  });
});
test('invalid ports, cycles and unreachable nodes are rejected in the editor', () => {
  const graph = emptyGraph();
  graph.edges.push({ source: 'end', target: 'start', source_port: 'out', target_port: 'in' });
  assert.ok(validateGraph(graph).some((message) => message.includes('cycle')));
  assert.ok(validateGraph(graph).some((message) => message.includes('ports')));
  const unreachable = emptyGraph();
  unreachable.nodes.push({ id: 'orphan', type: 'agent_task', config: {} });
  assert.ok(validateGraph(unreachable).some((message) => message.includes('reachable')));
});
test('fork pairing and condition outputs are explicit; end has no output', () => {
  const graph = emptyGraph();
  graph.nodes.push({ id: 'fork', type: 'parallel_fork', config: { join_id: 'missing' } });
  assert.ok(validateGraph(graph).some((message) => message.includes('matching Parallel join')));
  assert.deepEqual(ports('condition'), ['true', 'false']);
  assert.deepEqual(ports('end'), []);
});
test('criteria normalization and manifest parsing reject executable-shaped scalar input', () => {
  assert.deepEqual(lines(' criterion one\n\n criterion two '), ['criterion one', 'criterion two']);
  assert.deepEqual(parseObject('{"trusted":true}'), { trusted: true });
  assert.throws(() => parseObject('[]'), /JSON object/);
  assert.throws(() => parseObject('"script"'), /JSON object/);
});

test('parallel branches share dependency columns and remain visibly distinct', () => {
  const graph = emptyGraph();
  graph.nodes.splice(
    1,
    0,
    { id: 'fork', type: 'parallel_fork', config: { join_id: 'join' } },
    { id: 'left', type: 'agent_task', config: {} },
    { id: 'right', type: 'agent_task', config: {} },
    { id: 'join', type: 'parallel_join', config: { fork_id: 'fork', policy: 'all_success' } },
  );
  graph.edges = [
    ['start', 'fork'],
    ['fork', 'left'],
    ['fork', 'right'],
    ['left', 'join'],
    ['right', 'join'],
    ['join', 'end'],
  ].map(([source, target]) => ({ source, target, source_port: 'out', target_port: 'in' }));
  const positions = graphPositions(graph);
  assert.equal(positions.left.x, positions.right.x);
  assert.notEqual(positions.left.y, positions.right.y);
  assert.ok(positions.join.x > positions.left.x);
  assert.ok(positions.end.x > positions.join.x);
});
