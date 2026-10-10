import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  conditionValue,
  currentPlanGraph,
  latestNodeStatuses,
  runControlNotice,
  usageSummary,
} from '../src/evidence.ts';
import type { Run } from '../src/models.ts';
import { emptyGraph } from '../src/workflow.ts';

test('usage stays unknown when absent and preserves a provider-reported zero', () => {
  assert.equal(usageSummary(undefined), 'unknown');
  assert.equal(
    usageSummary({
      source: 'provider',
      input_tokens: null,
      output_tokens: null,
      is_complete: false,
    }),
    'unknown',
  );
  assert.equal(usageSummary({}), 'unknown');
  assert.equal(usageSummary({ input_tokens: 0, output_tokens: 0 }), '0 input / 0 output tokens');
  assert.equal(
    usageSummary({ input_tokens: 0, output_tokens: null }),
    '0 input / unknown output tokens',
  );
  assert.equal(usageSummary({ input_tokens: '100', output_tokens: -1 }), 'unknown');
});
test('a proposal belongs to its exact current plan and is hidden after a plan revision', () => {
  const graph = emptyGraph();
  const run = {
    plan_hash: 'current',
    result: { graph_proposal_plan_hash: 'current', graph_proposal: graph },
  } as unknown as Run;
  assert.equal(currentPlanGraph(run), graph);
  assert.equal(currentPlanGraph({ ...run, plan_hash: 'revised' }), undefined);
  assert.equal(currentPlanGraph({ ...run, result: { graph_proposal: graph as never } }), undefined);
  assert.equal(currentPlanGraph(undefined), undefined);
});
test('condition values preserve status strings and use real booleans for state fields', () => {
  assert.equal(conditionValue('status', 'eq', 'succeeded'), 'succeeded');
  assert.deepEqual(conditionValue('status', 'in', 'succeeded, skipped'), ['succeeded', 'skipped']);
  assert.equal(conditionValue('test_passed', 'eq', 'false'), false);
  assert.deepEqual(conditionValue('review_approved', 'in', 'true,false'), [true, false]);
  assert.throws(() => conditionValue('planner_has_tasks', 'eq', 'yes'), /boolean/);
});

test('control notices reconcile draining, resumed and terminal ledger outcomes', () => {
  assert.equal(
    runControlNotice('pause', { status: 'running', pause_requested: true }).pending,
    true,
  );
  assert.equal(
    runControlNotice('pause', { status: 'paused', pause_requested: true }).pending,
    false,
  );
  assert.equal(
    runControlNotice('resume', { status: 'paused', pause_requested: false }).pending,
    true,
  );
  assert.equal(
    runControlNotice('resume', { status: 'running', pause_requested: false }).pending,
    false,
  );
  for (const status of ['completed', 'cancelled', 'failed'] as const) {
    const result = runControlNotice('resume', { status });
    assert.equal(result.pending, false);
    assert.equal(result.message, `Run ${status}.`);
    assert.ok(!result.message.includes('Waiting'));
  }
  assert.equal(
    runControlNotice('resume', { status: 'paused', pause_requested: true }, true).pending,
    false,
  );
  assert.equal(
    runControlNotice('cancel', { status: 'running', cancel_requested: true }).pending,
    true,
  );
});

test('run graph chooses the highest attempt independently of unordered history rows', () => {
  const nodes = Object.freeze([
    Object.freeze({ node_id: 'end', attempt: 2, status: 'succeeded' }),
    Object.freeze({ node_id: 'review', attempt: 1, status: 'succeeded' }),
    Object.freeze({ node_id: 'end', attempt: 1, status: 'waiting_approval' }),
    Object.freeze({ node_id: 'develop', attempt: 3, status: 'running' }),
    Object.freeze({ node_id: 'develop', attempt: 1, status: 'succeeded' }),
  ]);
  const expected = { end: 'succeeded', review: 'succeeded', develop: 'running' };
  assert.deepEqual(latestNodeStatuses(nodes), expected);
  assert.deepEqual(latestNodeStatuses([...nodes].reverse()), expected);
  assert.equal(nodes[2].status, 'waiting_approval');
  assert.equal(nodes.length, 5);
});

test('empty node history and duplicate equal-attempt rows preserve canonical status', () => {
  assert.deepEqual(latestNodeStatuses([]), {});
  assert.deepEqual(
    latestNodeStatuses([
      { node_id: 'end', attempt: 2, status: 'succeeded' },
      { node_id: 'end', attempt: 2, status: 'succeeded' },
      { node_id: 'end', attempt: 1, status: 'waiting_approval' },
    ]),
    { end: 'succeeded' },
  );
});
