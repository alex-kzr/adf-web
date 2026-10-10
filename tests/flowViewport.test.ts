import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getViewportForBounds } from '@xyflow/react';
import { graphFitOptions, ResizeFitPolicy } from '../src/flowViewport.ts';

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
