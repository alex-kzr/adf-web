import type { Check } from './models.ts';
import { lines } from './workflow.ts';

const read = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
export function projectInput(data: FormData) {
  const checks: unknown = JSON.parse(read(data, 'checks'));
  if (
    !Array.isArray(checks) ||
    checks.some(
      (check) =>
        !check ||
        typeof check !== 'object' ||
        typeof check.id !== 'string' ||
        !check.id ||
        !Array.isArray(check.argv) ||
        !check.argv.length ||
        check.argv.some((arg: unknown) => typeof arg !== 'string' || !arg) ||
        !Number.isInteger(check.timeout_sec) ||
        check.timeout_sec < 1 ||
        check.timeout_sec > 1800,
    )
  )
    throw new Error(
      'Checks must contain id, nonempty argv string arrays and timeout_sec from 1 to 1800.',
    );
  return {
    name: read(data, 'name'),
    repo_path: read(data, 'repo_path'),
    default_branch: read(data, 'default_branch'),
    allowed_root: read(data, 'allowed_root'),
    checks: checks as Check[],
    trusted: data.get('trusted') === 'on',
  };
}
export function taskInput(data: FormData, projectId: string) {
  if (!projectId) throw new Error('Select a project for this task.');
  const criteria = lines(read(data, 'criteria'));
  if (!criteria.length) throw new Error('Add at least one observable acceptance criterion.');
  const priority = Number(read(data, 'priority'));
  if (!Number.isInteger(priority) || priority < -100 || priority > 100)
    throw new Error('Priority must be an integer from -100 to 100.');
  return {
    project_id: projectId,
    title: read(data, 'title'),
    description: read(data, 'description'),
    acceptance_criteria: criteria,
    priority,
    status: read(data, 'status'),
    dependency_ids: data.getAll('dependencies').map(String),
    expected_files: lines(read(data, 'files')),
  };
}
