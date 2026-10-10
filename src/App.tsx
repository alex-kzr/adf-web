import { useQueryClient } from '@tanstack/react-query';
import { useActionState, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient, errorMessage } from './api';
import { usageSummary } from './evidence';
import { ApiContext, useList, useRecord } from './hooks';
import type { Agent, JsonObject, Project, Run, Task } from './models';
import { Agents, Registry, SettingsPage } from './pages/AgentsRegistry';
import { Projects, Tasks } from './pages/ProjectsTasks';
import { RunDetail, Runs } from './pages/Runs';
import { Workflows } from './pages/Workflows';
import { Badge, Button, Empty, Icon, PageTitle, QueryState, shortId, Time } from './ui';

const navigation = [
  { id: 'dashboard', title: 'Overview', icon: 'dashboard' },
  { id: 'projects', title: 'Projects', icon: 'projects' },
  { id: 'tasks', title: 'Tasks & goals', icon: 'tasks' },
  { id: 'workflows', title: 'Workflow studio', icon: 'workflows' },
  { id: 'agents', title: 'Agents', icon: 'agents' },
  { id: 'registry', title: 'Registry & policies', icon: 'registry' },
  { id: 'runs', title: 'Runs', icon: 'runs' },
  { id: 'settings', title: 'Settings', icon: 'settings' },
];
function Dashboard({ navigate }: { navigate: (route: string) => void }) {
  const projects = useList<Project>('projects');
  const tasks = useList<Task>('tasks');
  const runs = useList<Run>('runs');
  const agents = useList<Agent>('agents');
  const metrics = useRecord<JsonObject>('/api/metrics/overview');
  const currentRuns = runs.data?.items ?? [];
  const active = currentRuns.filter((run) => ['queued', 'running', 'paused'].includes(run.status));
  const needsAttention = currentRuns.filter(
    (run) =>
      run.status === 'failed' ||
      run.integration_status === 'needs_resolution' ||
      run.status === 'paused',
  );
  return (
    <>
      <PageTitle
        eyebrow="Local development factory"
        title="Your work, orchestrated."
        description="Turn a clear goal into reviewed changes, with parallel agents and human control."
        action={
          <Button variant="primary" onClick={() => navigate('tasks')}>
            <Icon name="plus" />
            Create task
          </Button>
        }
      />
      <div className="metric-grid">
        {[
          {
            label: 'Registered projects',
            value: projects.data
              ? `${projects.data.items.length}${projects.hasNextPage ? '+' : ''}`
              : undefined,
            detail: 'WSL repositories',
            icon: 'projects',
          },
          {
            label: 'Active runs',
            value: runs.data ? `${active.length}${runs.hasNextPage ? '+' : ''}` : undefined,
            detail: `${currentRuns.filter((run) => run.status === 'queued').length} queued`,
            icon: 'runs',
          },
          {
            label: 'Ready tasks',
            value: tasks.data
              ? `${tasks.data.items.filter((task) => task.status === 'ready').length}${tasks.hasNextPage ? '+' : ''}`
              : undefined,
            detail: 'Bounded acceptance criteria',
            icon: 'tasks',
          },
          {
            label: 'Agent definitions',
            value: agents.data
              ? `${agents.data.items.length}${agents.hasNextPage ? '+' : ''}`
              : undefined,
            detail: 'Versioned configurations',
            icon: 'agents',
          },
        ].map((metric) => (
          <article className="metric" key={metric.label}>
            <div className="row">
              <span>{metric.label}</span>
              <Icon name={metric.icon} />
            </div>
            <strong>{metric.value ?? '—'}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
      {(projects.hasNextPage || tasks.hasNextPage || agents.hasNextPage || runs.hasNextPage) && (
        <p className="muted small">
          Counts with + are partial loaded snapshots. Open the corresponding list to load more
          records.
        </p>
      )}
      <div className="dashboard-columns">
        <section className="panel">
          <div className="section-title">
            <h2>Recent runs</h2>
            <Button variant="ghost" onClick={() => navigate('runs')}>
              View all
              <Icon name="arrow" />
            </Button>
          </div>
          <QueryState pending={runs.isPending} error={runs.error} retry={() => void runs.refetch()}>
            {!currentRuns.length ? (
              <Empty
                title="Ready when you are"
                action={
                  <Button onClick={() => navigate('projects')}>
                    Register a project
                    <Icon name="arrow" />
                  </Button>
                }
              >
                Connect a trusted repository, configure specialists and publish a workflow.
              </Empty>
            ) : (
              <div className="recent-runs">
                {currentRuns.slice(0, 6).map((run) => (
                  <button type="button" key={run.id} onClick={() => navigate(`runs/${run.id}`)}>
                    <span className="recent-icon">
                      <Icon name="runs" />
                    </span>
                    <span>
                      <strong>
                        {tasks.data?.items.find((task) => task.id === run.task_id)?.title ??
                          `Run ${shortId(run.id)}`}
                      </strong>
                      <small>
                        <Time value={run.created_at} /> · {shortId(run.id)}
                      </small>
                    </span>
                    <Badge value={run.status} />
                    <Icon name="arrow" />
                  </button>
                ))}
              </div>
            )}
          </QueryState>
        </section>
        <aside className="panel next-step">
          <div className="eyebrow">Bounded autonomy</div>
          <h2>Every change has a trail.</h2>
          <p>
            Task criteria, approved scope, isolated worktrees, test results and independent review
            stay tied to the exact Git tree.
          </p>
          <ol>
            <li>Register a clean WSL repository</li>
            <li>Configure Developer and Reviewer roles</li>
            <li>Publish a validated workflow</li>
            <li>Approve the exact run snapshot</li>
          </ol>
          <Button onClick={() => navigate('workflows')}>
            Open workflow studio
            <Icon name="arrow" />
          </Button>
        </aside>
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <h2>Needs attention</h2>
          {needsAttention.length ? (
            needsAttention.map((run) => (
              <button
                type="button"
                className="attention-row"
                key={run.id}
                onClick={() => navigate(`runs/${run.id}`)}
              >
                <Icon name="warning" />
                <span>Run {shortId(run.id)}</span>
                <Badge
                  value={
                    run.integration_status === 'needs_resolution' ? 'needs_resolution' : run.status
                  }
                />
                <Icon name="arrow" />
              </button>
            ))
          ) : (
            <div className="quiet-state">
              <Icon name="check" />
              <span>
                No paused runs, failed runs or unresolved integrations in the current snapshot.
              </span>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Factory limits & usage</h2>
          {metrics.error ? (
            <p className="error-text">
              Metrics unavailable. Inspect service health and worker registration.
            </p>
          ) : (
            <dl className="details">
              <div>
                <dt>Parallel writers</dt>
                <dd>
                  {String(
                    metrics.data?.active_executions ?? metrics.data?.concurrency ?? 'unknown',
                  )}{' '}
                  / 3 maximum
                </dd>
              </div>
              <div>
                <dt>Queue depth</dt>
                <dd>{String(metrics.data?.queue_depth ?? 'unknown')}</dd>
              </div>
              <div>
                <dt>Provider token usage</dt>
                <dd>{usageSummary(metrics.data?.usage)}</dd>
              </div>
              <div>
                <dt>Subscription cost</dt>
                <dd>unknown</dd>
              </div>
            </dl>
          )}
          <p className="muted small">
            Unknown values are never converted into zero or estimated spend.
          </p>
        </section>
      </div>
    </>
  );
}
function Login({ connected }: { connected: (token: string) => void }) {
  const [error, action, pending] = useActionState(async (_: string, data: FormData) => {
    const token = String(data.get('token') ?? '').trim();
    if (!token) return 'Enter the local admin bearer token.';
    try {
      await new ApiClient(token).get('/api/projects?limit=1');
      connected(token);
      return '';
    } catch (cause) {
      return errorMessage(cause);
    }
  }, '');
  return (
    <div className="login-page">
      <div className="login-brand">
        <span className="brand-symbol">
          <Icon name="workflows" size={30} />
        </span>
        <span>
          ADF<span className="brand-caption">Agent Development Factory</span>
        </span>
      </div>
      <main className="login-card">
        <div className="eyebrow">Your local control plane</div>
        <h1>
          Build with agents.
          <br />
          Stay in control.
        </h1>
        <p>
          Connect to your workstation to manage tasks, approve bounded workflows and review the
          resulting Git changes.
        </p>
        <form action={action}>
          <label className="field">
            <span>Local admin token</span>
            <input
              type="password"
              name="token"
              required
              autoComplete="off"
              autoFocus
              spellCheck={false}
              placeholder="Enter your admin bearer token"
              disabled={pending}
            />
            <small>
              From the local admin token file configured for the API. It stays in browser memory.
            </small>
          </label>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Connecting…' : 'Connect to factory'}
            <Icon name="arrow" />
          </Button>
        </form>
        <div className="login-footer">
          <Icon name="lock" />
          <span>Single user · loopback access · local execution</span>
        </div>
      </main>
      <p className="login-note">
        Authenticate Codex and Claude separately in the WSL host account. This page never asks for
        provider credentials.
      </p>
    </div>
  );
}
export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [route, setRoute] = useState(() => location.hash.slice(2) || 'dashboard');
  const [online, setOnline] = useState(navigator.onLine);
  const client = useQueryClient();
  const lock = useCallback(() => {
    void client.cancelQueries();
    client.clear();
    setToken(null);
  }, [client]);
  const api = useMemo(() => (token ? new ApiClient(token, lock) : null), [token, lock]);
  useEffect(() => {
    const onHash = () => {
      setRoute(location.hash.slice(2) || 'dashboard');
      document.getElementById('page-content')?.focus();
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  const navigate = (next: string) => {
    location.hash = `/${next}`;
    setRoute(next);
  };
  const current = route.split('/')[0];
  if (!api) return <Login connected={setToken} />;
  return (
    <ApiContext.Provider value={api}>
      <a className="skip-link" href="#page-content">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <button
            type="button"
            className="brand"
            onClick={() => navigate('dashboard')}
            aria-label="ADF overview"
          >
            <span className="brand-symbol">
              <Icon name="workflows" size={24} />
            </span>
            <span>
              ADF<small>Development factory</small>
            </span>
          </button>
          <div className="sidebar-label">Workspace</div>
          <nav aria-label="Primary navigation">
            {navigation.map((item) => (
              <button
                type="button"
                key={item.id}
                className={current === item.id ? 'active' : ''}
                aria-current={current === item.id ? 'page' : undefined}
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.title}</span>
                {current === item.id && <span className="nav-mark" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-status">
              <span className="dot" />
              <span>
                Local workstation<small>WSL host worker</small>
              </span>
            </div>
            <Button variant="ghost" onClick={lock}>
              <Icon name="lock" />
              Lock session
            </Button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <span>
              Workspace <span className="topbar-slash">/</span>{' '}
              {navigation.find((item) => item.id === current)?.title ?? 'Run detail'}
            </span>
            <div className="row">
              <span className="topbar-local">
                <span className={`dot ${online ? '' : 'offline'}`} />
                {online ? 'Browser online' : 'Browser offline'}
              </span>
              <Button variant="ghost" onClick={lock} aria-label="Lock session">
                <Icon name="lock" />
              </Button>
              <span className="user-mark" role="img" aria-label="Local administrator">
                YOU
              </span>
            </div>
          </header>
          {!online && (
            <div className="notice error">
              Browser is offline. Server snapshots may be stale; mutations require a live
              connection.
            </div>
          )}
          <main id="page-content" tabIndex={-1}>
            {current === 'dashboard' ? (
              <Dashboard navigate={navigate} />
            ) : current === 'projects' ? (
              <Projects />
            ) : current === 'tasks' ? (
              <Tasks navigate={navigate} />
            ) : current === 'workflows' ? (
              <Workflows
                navigate={navigate}
                initialId={route.split('/')[1]}
                sourceRunId={route.split('/')[2] === 'plan' ? route.split('/')[3] : undefined}
                sourcePlanHash={route.split('/')[2] === 'plan' ? route.split('/')[4] : undefined}
              />
            ) : current === 'agents' ? (
              <Agents />
            ) : current === 'registry' ? (
              <Registry />
            ) : current === 'runs' && route.split('/')[1] ? (
              <RunDetail key={route} id={route.split('/')[1]} navigate={navigate} />
            ) : current === 'runs' ? (
              <Runs navigate={navigate} />
            ) : current === 'settings' ? (
              <SettingsPage />
            ) : (
              <Empty
                title="Page not found"
                action={<Button onClick={() => navigate('dashboard')}>Open overview</Button>}
              >
                Choose a workspace screen from the navigation.
              </Empty>
            )}
          </main>
          <footer className="app-footer">
            <span>ADF · local single-user factory</span>
            <span>Default branches are preserved. Publication is a separate user action.</span>
          </footer>
        </div>
      </div>
    </ApiContext.Provider>
  );
}
