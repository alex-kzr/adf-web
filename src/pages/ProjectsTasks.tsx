import { useState } from 'react';
import { projectInput, taskInput } from '../forms';
import { useCommand, useList, useRecord } from '../hooks';
import type {
  Agent,
  Project,
  RegistryEntry,
  Run,
  Settings,
  Task,
  Workflow,
  WorkflowVersion,
} from '../models';
import {
  ActionForm,
  Badge,
  Button,
  Empty,
  Field,
  Icon,
  LoadMore,
  Modal,
  PageTitle,
  QueryState,
  Selection,
  shortId,
  text,
} from '../ui';
export function Projects() {
  const projects = useList<Project>('projects');
  const settings = useRecord<Settings>('/api/settings');
  const command = useCommand();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const current = editing && editing !== 'new' ? editing : undefined;
  return (
    <>
      <PageTitle
        eyebrow="Workspace"
        title="Projects"
        description="Trusted Git repositories on the WSL filesystem. Each writer gets its own worktree."
        action={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" />
            Register project
          </Button>
        }
      />
      <QueryState
        pending={projects.isPending}
        error={projects.error}
        retry={() => void projects.refetch()}
      >
        {!projects.data?.items.length ? (
          <Empty title="Start with a repository">
            Register a clean Git repository beneath a configured WSL root. Your default branch stays
            untouched.
          </Empty>
        ) : (
          <div className="project-grid">
            {projects.data.items.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="row">
                  <span className="project-symbol">
                    <Icon name="projects" size={26} />
                  </span>
                  <Badge value={project.trusted ? 'trusted' : 'untrusted'} />
                </div>
                <h2>{project.name}</h2>
                <p className="path">{project.repo_path}</p>
                <dl className="details">
                  <div>
                    <dt>Default branch</dt>
                    <dd>
                      <Icon name="branch" />
                      {project.default_branch}
                    </dd>
                  </div>
                  <div>
                    <dt>Checks</dt>
                    <dd>{project.checks.length} registered</dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd>{project.revision}</dd>
                  </div>
                </dl>
                <div className="checks">
                  {project.checks.map((check) => (
                    <span className="tag" key={check.id}>
                      {check.id}
                    </span>
                  ))}
                </div>
                <Button onClick={() => setEditing(project)}>Edit registration</Button>
              </article>
            ))}
          </div>
        )}
      </QueryState>
      <LoadMore query={projects} />
      {editing && (
        <Modal
          title={current ? 'Edit project' : 'Register project'}
          description="Credentials remain in the host CLI account. A worktree does not provide a security sandbox."
          close={() => setEditing(null)}
        >
          <ActionForm
            cancel={() => setEditing(null)}
            label={current ? 'Save revision' : 'Register repository'}
            submit={async (data) => {
              await command.mutateAsync({
                path: current ? `/api/projects/${current.id}` : '/api/projects',
                method: current ? 'PATCH' : 'POST',
                revision: current?.revision,
                body: projectInput(data),
              });
              setEditing(null);
            }}
          >
            <div className="form-grid">
              <Field label="Project name">
                <input name="name" required maxLength={120} defaultValue={current?.name} />
              </Field>
              <Field label="Default branch">
                <input
                  name="default_branch"
                  required
                  defaultValue={current?.default_branch ?? 'main'}
                />
              </Field>
            </div>
            <Field
              label="Repository path"
              hint="Linux ext4 path beneath an allowed root; /mnt/c is rejected."
            >
              <input
                name="repo_path"
                required
                placeholder="/home/worker/ai-factory/projects/example/repo"
                defaultValue={current?.repo_path}
              />
            </Field>
            <Field label="Allowed root">
              <select
                name="allowed_root"
                required
                defaultValue={current?.allowed_root ?? settings.data?.allowed_roots?.[0] ?? ''}
              >
                <option value="">Select a configured root</option>
                {(settings.data?.allowed_roots ?? []).map((root) => (
                  <option key={root}>{root}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Registered checks (argv JSON)"
              hint="Argument arrays are executed by the worker without a shell. Workflow nodes refer to check IDs."
            >
              <textarea
                className="code-input"
                name="checks"
                rows={6}
                defaultValue={JSON.stringify(
                  current?.checks ?? [
                    {
                      id: 'unit',
                      argv: ['python', '-m', 'unittest', 'discover'],
                      timeout_sec: 120,
                    },
                  ],
                  null,
                  2,
                )}
                required
              />
            </Field>
            <label className="checkbox">
              <input
                name="trusted"
                type="checkbox"
                required
                defaultChecked={current?.trusted ?? false}
              />
              <span>
                I trust this repository and the registered commands on this local workstation.
              </span>
            </label>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function Tasks({ navigate }: { navigate: (route: string) => void }) {
  const projects = useList<Project>('projects');
  const [projectId, setProjectId] = useState('');
  const tasks = useList<Task>('tasks', { project_id: projectId });
  const agents = useList<Agent>('agents');
  const workflows = useList<Workflow>('workflows');
  const policies = useList<RegistryEntry>('policies');
  const command = useCommand();
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [planning, setPlanning] = useState<Task | null>(null);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [formProject, setFormProject] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const versions = useRecord<{ items: WorkflowVersion[] }>(
    `/api/workflows/${workflowId}/versions`,
    Boolean(workflowId),
  );
  const current = editing && editing !== 'new' ? editing : undefined;
  const items = (tasks.data?.items ?? []).filter((task) =>
    task.title.toLowerCase().includes(search.toLowerCase()),
  );
  const openEditor = (task: Task | 'new') => {
    setFormProject(
      task === 'new' ? projectId || projects.data?.items[0]?.id || '' : task.project_id,
    );
    setEditing(task);
  };
  const card = (task: Task) => (
    <article className="task-card" key={task.id}>
      <div className="row">
        <span className="muted mono">{shortId(task.id)}</span>
        <Badge value={task.status} />
      </div>
      <h3>{task.title}</h3>
      <p>{task.description}</p>
      <div className="task-meta">
        <span>{task.acceptance_criteria.length} acceptance criteria</span>
        <span>{task.dependency_ids.length} dependencies</span>
      </div>
      {task.expected_files.length > 0 && (
        <div className="checks">
          {task.expected_files.map((path) => (
            <span key={path} className="tag mono">
              {path}
            </span>
          ))}
        </div>
      )}
      <div className="card-actions">
        <Button onClick={() => openEditor(task)}>Inspect / edit</Button>
        <Button
          onClick={() => setPlanning(task)}
          disabled={!['draft', 'ready', 'blocked'].includes(task.status)}
        >
          Decompose goal
        </Button>
      </div>
    </article>
  );
  return (
    <>
      <PageTitle
        eyebrow="Work queue"
        title="Tasks & goals"
        description="Define acceptance criteria and dependencies before granting execution scope."
        action={
          <Button variant="primary" onClick={() => openEditor('new')}>
            <Icon name="plus" />
            New task / goal
          </Button>
        }
      />
      <div className="toolbar">
        <Selection
          label="Project"
          options={projects.data?.items ?? []}
          value={projectId}
          onChange={setProjectId}
          empty="All projects"
        />
        <Field label="Search tasks">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title contains…"
          />
        </Field>
        <fieldset className="segmented">
          <legend className="sr-only">Task view</legend>
          <Button aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </Button>
          <Button aria-pressed={view === 'board'} onClick={() => setView('board')}>
            Board
          </Button>
        </fieldset>
      </div>
      <QueryState pending={tasks.isPending} error={tasks.error} retry={() => void tasks.refetch()}>
        {!items.length ? (
          <Empty title="A clear task is the starting point">
            Add a manual task or a goal for structured decomposition.
          </Empty>
        ) : view === 'list' ? (
          <div className="task-list">{items.map(card)}</div>
        ) : (
          <div className="kanban">
            {(['draft', 'ready', 'running', 'review', 'done'] as const).map((status) => (
              <section key={status}>
                <header>
                  <Badge value={status} />
                  <span>{items.filter((task) => task.status === status).length}</span>
                </header>
                {items.filter((task) => task.status === status).map(card)}
              </section>
            ))}
            <section>
              <header>Blocked / terminal</header>
              {items
                .filter((task) => ['blocked', 'failed', 'cancelled'].includes(task.status))
                .map(card)}
            </section>
          </div>
        )}
      </QueryState>
      <LoadMore query={tasks} />
      {editing && (
        <Modal
          title={current ? current.title : 'New task or goal'}
          description={
            current
              ? `Revision ${current.revision} · execution states are server controlled`
              : 'Use a goal for planning, or mark a bounded manual task ready.'
          }
          close={() => setEditing(null)}
        >
          <ActionForm
            disabled={Boolean(current && !['draft', 'ready', 'blocked'].includes(current.status))}
            cancel={() => setEditing(null)}
            submit={async (data) => {
              await command.mutateAsync({
                path: current ? `/api/tasks/${current.id}` : '/api/tasks',
                method: current ? 'PATCH' : 'POST',
                revision: current?.revision,
                body: taskInput(data, formProject),
              });
              setEditing(null);
            }}
          >
            <Selection
              label="Project"
              options={projects.data?.items ?? []}
              value={formProject}
              onChange={setFormProject}
            />
            <Field label="Title">
              <input name="title" required maxLength={200} defaultValue={current?.title} />
            </Field>
            <Field label="Description">
              <textarea name="description" required rows={4} defaultValue={current?.description} />
            </Field>
            <Field label="Acceptance criteria" hint="One observable criterion per line.">
              <textarea
                name="criteria"
                required
                rows={3}
                defaultValue={current?.acceptance_criteria.join('\n')}
              />
            </Field>
            <Field
              label="Expected files / path reservations"
              hint="One repository-relative path or approved glob per line."
            >
              <textarea
                name="files"
                rows={2}
                defaultValue={current?.expected_files.join('\n')}
                placeholder="src/example.py"
              />
            </Field>
            <Field
              label="Dependencies"
              hint="Select prerequisites from this project. The API rejects cycles."
            >
              <select
                name="dependencies"
                multiple
                size={4}
                defaultValue={current?.dependency_ids ?? []}
              >
                {(tasks.data?.items ?? [])
                  .filter((task) => task.project_id === formProject && task.id !== current?.id)
                  .map((task) => (
                    <option value={task.id} key={task.id}>
                      {task.title} · {task.status}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Initial state">
                <select name="status" defaultValue={current?.status ?? 'draft'}>
                  {['draft', 'ready', 'blocked'].includes(current?.status ?? 'draft') ? (
                    <>
                      <option value="draft">Draft</option>
                      <option value="ready">Ready</option>
                    </>
                  ) : (
                    <option value={current?.status}>{current?.status}</option>
                  )}
                </select>
              </Field>
              <Field label="Priority">
                <input
                  name="priority"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={current?.priority ?? 0}
                />
              </Field>
            </div>
          </ActionForm>
        </Modal>
      )}
      {planning && (
        <Modal
          title="Decompose goal"
          description="A planner proposes structured tasks. Execution still requires approval of the resulting snapshot."
          close={() => setPlanning(null)}
        >
          <ActionForm
            cancel={() => setPlanning(null)}
            label="Request plan"
            submit={async (data) => {
              const result = (await command.mutateAsync({
                path: `/api/tasks/${planning.id}/decompose`,
                body: {
                  agent_config_version_id: text(data, 'agent'),
                  workflow_version_id: text(data, 'version') || undefined,
                  policy_id: text(data, 'policy') || undefined,
                },
              })) as Run;
              setPlanning(null);
              navigate(`runs/${result.id}`);
            }}
          >
            <div className="notice">{planning.title}</div>
            <Field label="Planner agent version">
              <select name="agent" required>
                <option value="">Select a planner</option>
                {(agents.data?.items ?? [])
                  .filter((agent) => agent.role.toLowerCase() === 'planner')
                  .map((agent) => (
                    <option value={agent.config_version_id} key={agent.id}>
                      {agent.name} · {agent.provider} · {shortId(agent.config_hash)}
                    </option>
                  ))}
              </select>
            </Field>
            <Selection
              label="Workflow (optional)"
              options={workflows.data?.items ?? []}
              value={workflowId}
              onChange={setWorkflowId}
            />
            <Field label="Immutable workflow version">
              <select name="version">
                <option value="">Planner default</option>
                {versions.data?.items.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version} · {shortId(version.graph_hash)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Policy">
              <select name="policy">
                <option value="">Configured default</option>
                {policies.data?.items.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
