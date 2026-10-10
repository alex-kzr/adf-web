import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectInput, taskInput } from '../src/forms.ts';

test('task form serializes canonical criteria and dependencies; no missing project is submitted', () => {
  const form = new FormData();
  form.set('title', ' Implement feature ');
  form.set('description', 'Description');
  form.set('criteria', 'First criterion\n\nSecond criterion');
  form.set('files', 'src/main.py\ntests/test_main.py');
  form.set('priority', '3');
  form.set('status', 'ready');
  form.append('dependencies', 'task-a');
  form.append('dependencies', 'task-b');
  const body = taskInput(form, 'project-1');
  assert.equal(body.project_id, 'project-1');
  assert.equal(body.title, 'Implement feature');
  assert.deepEqual(body.acceptance_criteria, ['First criterion', 'Second criterion']);
  assert.deepEqual(body.dependency_ids, ['task-a', 'task-b']);
  assert.deepEqual(body.expected_files, ['src/main.py', 'tests/test_main.py']);
  assert.throws(() => taskInput(form, ''), /Select a project/);
  form.set('priority', 'NaN');
  assert.throws(() => taskInput(form, 'project-1'), /Priority/);
});
test('registered checks preserve argv boundaries and require bounded timeouts', () => {
  const form = new FormData();
  form.set('name', 'Test project');
  form.set('repo_path', '/home/worker/ai-factory/projects/repo');
  form.set('allowed_root', '/home/worker/ai-factory');
  form.set('default_branch', 'main');
  form.set('trusted', 'on');
  const check = {
    id: 'unit',
    argv: ['python', '-m', 'unittest', 'a name with spaces'],
    timeout_sec: 120,
  };
  form.set('checks', JSON.stringify([check]));
  const body = projectInput(form);
  assert.deepEqual(body.checks, [check]);
  assert.equal(body.trusted, true);
  form.set('checks', JSON.stringify([{ ...check, argv: 'python -m unittest' }]));
  assert.throws(() => projectInput(form), /argv string arrays/);
  form.set('checks', JSON.stringify([{ ...check, timeout_sec: 9999 }]));
  assert.throws(() => projectInput(form), /1800/);
});
