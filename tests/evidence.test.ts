import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conditionValue, currentPlanGraph, usageSummary } from '../src/evidence.ts';
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
