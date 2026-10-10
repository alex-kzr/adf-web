import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyNodeChanges, getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { captureNodeGeometry, graphFitOptions, ResizeFitPolicy } from '../src/flowViewport.ts';

test('wide DAG bounds fit the desktop and mobile canvas without clipping', () => {
  for (const [width, height] of [
    [931, 260],
    [275, 260],
  ]) {
    for (const bounds of [
      { x: 0, y: 80, width: 2500, height: 450 },
      { x: 0, y: 0, width: 28000, height: 100 },
    ]) {
      const viewport = getViewportForBounds(
        bounds,
        width,
        height,
        graphFitOptions.minZoom,
        graphFitOptions.maxZoom,
        graphFitOptions.padding,
      );
      assert.ok(viewport.zoom < 0.5);
      assert.ok(viewport.x + bounds.x * viewport.zoom >= 0);
      assert.ok(viewport.y + bounds.y * viewport.zoom >= 0);
      assert.ok(viewport.x + (bounds.x + bounds.width) * viewport.zoom <= width);
      assert.ok(viewport.y + (bounds.y + bounds.height) * viewport.zoom <= height);
    }
  }
});
test('resize fitting preserves user zoom and focus until explicit fit or graph switch', () => {
  const policy = new ResizeFitPolicy();
  assert.equal(policy.resize(931, 260), true);
  assert.equal(policy.resize(931, 260), false);
  assert.equal(policy.resize(275, 260), true);
  policy.preserve();
  assert.equal(policy.resize(931, 260), false);
  assert.equal(policy.automatic, false);
  policy.reset();
  assert.equal(policy.automatic, true);
  assert.equal(policy.resize(275, 260), true);
  assert.equal(policy.resize(0, 0), false);
});

test('controlled editor keeps measured bounds through selection and dragging', () => {
  let nodes: Node[] = [{ id: 'develop', position: { x: 50, y: 80 }, data: {} }];
  nodes = applyNodeChanges(
    [{ type: 'dimensions', id: 'develop', dimensions: { width: 184, height: 68 } }],
    nodes,
  );
  const measured = captureNodeGeometry(nodes);
  nodes = [{ id: 'develop', data: {}, ...measured.develop }];
  assert.deepEqual(getNodesBounds(nodes), { x: 50, y: 80, width: 184, height: 68 });
  nodes = applyNodeChanges(
    [
      { type: 'select', id: 'develop', selected: true },
      { type: 'position', id: 'develop', position: { x: 120, y: 160 }, dragging: true },
    ],
    nodes,
  );
  const dragged = captureNodeGeometry(nodes);
  nodes = [{ id: 'develop', data: {}, ...dragged.develop }];
  assert.deepEqual(getNodesBounds(nodes), { x: 120, y: 160, width: 184, height: 68 });
  assert.equal(nodes[0].dragging, true);
  assert.equal('selected' in dragged.develop, false);
});
