import { useEffect, useMemo, useRef, useState } from 'react';
import {
  currentPlanGraph,
  latestNodeStatuses,
  type RunControlAction,
  runControlNotice,
  usageSummary,
} from '../evidence';
import { useApi, useCommand, useList, useRecord, useRunEvents } from '../hooks';
import type {
  Approval,
  Artifact,
  DomainEvent,
  Execution,
  GitChange,
  NodeRun,
  Project,
  Run,
  Task,
  WorkflowVersion,
} from '../models';
import {
  ActionForm,
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Icon,
  JsonView,
  LoadMore,
  Modal,
  PageTitle,
  QueryState,
  shortId,
  Time,
  tabKeyboard,
} from '../ui';
import { PlanEditor } from './PlanEditor';
import { GraphView } from './Workflows';

const terminal = (status: string) => ['completed', 'failed', 'cancelled'].includes(status);
export function Runs({ navigate }: { navigate: (route: string) => void }) {
  const [status, setStatus] = useState('');
  const runs = useList<Run>('runs', { status });
  const tasks = useList<Task>('tasks');
  const projects = useList<Project>('projects');
  return (
    <>
      <PageTitle
        eyebrow="Execution ledger"
        title="Runs"
        description="Pinned versions, durable execution state and a separate integration branch for every run."
      />
      <div className="toolbar">
        <Field label="Filter by state">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All states</option>
            {['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Button onClick={() => void runs.refetch()}>
          <Icon name="refresh" />
          Refresh
        </Button>
      </div>
      <QueryState pending={runs.isPending} error={runs.error} retry={() => void runs.refetch()}>
        {!runs.data?.items.length ? (
          <Empty
            title="No runs yet"
            action={
              <Button onClick={() => navigate('workflows')}>
                Open workflow studio
                <Icon name="arrow" />
              </Button>
            }
          >
            Publish a validated workflow version, choose a task and queue your first bounded run.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run / task</th>
                  <th>Project</th>
                  <th>State</th>
                  <th>Integration</th>
                  <th>Created</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.data.items.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => navigate(`runs/${run.id}`)}
                      >
                        {tasks.data?.items.find((task) => task.id === run.task_id)?.title ??
                          shortId(run.task_id)}
                      </button>
                      <small className="mono muted">{run.id}</small>
                    </td>
                    <td>
                      {projects.data?.items.find((project) => project.id === run.project_id)
                        ?.name ?? shortId(run.project_id)}
                    </td>
                    <td>
                      <Badge value={run.status} />
                    </td>
                    <td>
                      <Badge value={run.integration_status ?? 'pending'} />
                    </td>
                    <td>
                      <Time value={run.created_at} />
                    </td>
                    <td>
                      <Button
                        aria-label={`Open run ${run.id}`}
                        onClick={() => navigate(`runs/${run.id}`)}
                      >
                        <Icon name="arrow" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      <LoadMore query={runs} />
    </>
  );
}
export function RunDetail({ id, navigate }: { id: string; navigate: (route: string) => void }) {
  const api = useApi();
  const command = useCommand();
  const run = useRecord<Run>(`/api/runs/${id}`);
  const nodes = useList<NodeRun>(`runs/${id}/nodes`);
  const artifacts = useList<Artifact>(`runs/${id}/artifacts`);
  const changes = useList<GitChange>(`runs/${id}/git-changes`);
  const approvals = useList<Approval>(`runs/${id}/approvals`);
  const history = useList<DomainEvent>(`runs/${id}/event-history`);
  const tasks = useList<Task>('tasks');
  const versions = useRecord<{ items: WorkflowVersion[] }>(
    `/api/workflows/${String((run.data as Run & { workflow_id?: string })?.workflow_id ?? '')}/versions`,
    Boolean((run.data as Run & { workflow_id?: string })?.workflow_id),
  );
  const stream = useRunEvents(id, run.data?.status);
  const [editingPlan, setEditingPlan] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [tab, setTab] = useState<'activity' | 'executions' | 'git' | 'plan'>('activity');
  const [approval, setApproval] = useState<Approval | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [control, setControl] = useState<RunControlAction | null>(null);
  const [requestedControl, setRequestedControl] = useState<{
    action: RunControlAction;
    confirmed: boolean;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [artifactPending, setArtifactPending] = useState('');
  const artifactAbort = useRef<AbortController | null>(null);
  useEffect(() => () => artifactAbort.current?.abort(), []);
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const events = useMemo(() => {
    const all = new Map<string, DomainEvent>();
    [...(history.data?.items ?? []), ...stream.events].forEach((event) => {
      all.set(event.event_id, event);
    });
    return [...all.values()]
      .sort((a, b) => (a.run_sequence ?? a.sequence ?? 0) - (b.run_sequence ?? b.sequence ?? 0))
      .slice(-200);
  }, [history.data, stream.events]);
  const record = run.data;
  const controlNotice = requestedControl
    ? runControlNotice(requestedControl.action, record, requestedControl.confirmed)
    : undefined;
  const controlPending = controlNotice?.pending;
  useEffect(() => {
    if (requestedControl && !requestedControl.confirmed && controlPending === false)
      setRequestedControl({ ...requestedControl, confirmed: true });
  }, [requestedControl, controlPending]);
  const executions = record?.executions ?? [];
  const nodeItems = nodes.data?.items ?? record?.nodes ?? [];
  const pendingApprovals = (approvals.data?.items ?? record?.approvals ?? []).filter(
    (value) =>
      !value.decision &&
      (!value.expires_at || new Date(value.expires_at).getTime() > Date.now()) &&
      !terminal(record?.status ?? ''),
  );
  const workflowGraph =
    versions.data?.items.find((version) => version.id === record?.workflow_version_id)
      ?.graph_json ??
    (record as Run & { workflow_graph?: WorkflowVersion['graph_json'] })?.workflow_graph ??
    record?.graph_json;
  const viewArtifact = async (artifact: Artifact) => {
    setError(null);
    artifactAbort.current?.abort();
    const controller = new AbortController();
    artifactAbort.current = controller;
    setArtifactPending(artifact.id);
    try {
      if ((artifact.size_bytes ?? artifact.size ?? 0) > 2097152)
        throw new Error(
          'This artifact is larger than the 2 MiB inline preview limit. Download it to inspect.',
        );
      const blob = await api.artifact(artifact.id, controller.signal);
      if (blob.size > 2097152) throw new Error('Artifact exceeded the inline preview limit.');
      setPreview({ name: artifact.kind, text: await blob.text() });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause);
    } finally {
      if (!controller.signal.aborted) setArtifactPending('');
    }
  };
  const downloadArtifact = async (id: string) => {
    setError(null);
    artifactAbort.current?.abort();
    const controller = new AbortController();
    artifactAbort.current = controller;
    setArtifactPending(id);
    try {
      await api.downloadArtifact(id, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause);
    } finally {
      if (!controller.signal.aborted) setArtifactPending('');
    }
  };
  const graphProposal = currentPlanGraph(record);
  const trace =
    record?.trace_url && /^https?:\/\//.test(record.trace_url) ? record.trace_url : undefined;
  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="text-button" onClick={() => navigate('runs')}>
          Runs
        </button>
        <span>/</span>
        <span className="mono">{shortId(id)}</span>
      </div>
      <PageTitle
        eyebrow="Run detail"
        title={
          tasks.data?.items.find((task) => task.id === record?.task_id)?.title ??
          `Run ${shortId(id)}`
        }
        description="Review the exact scope and evidence. Controls remain pending until the ledger confirms them."
        action={
          record && (
            <div className="toolbar-actions">
              <Badge value={record.status} />
              <Button
                disabled={
                  terminal(record.status) || record.status === 'paused' || record.pause_requested
                }
                onClick={() => setControl('pause')}
              >
                Pause
              </Button>
              <Button disabled={record.status !== 'paused'} onClick={() => setControl('resume')}>
                Resume
              </Button>
              <Button
                variant="danger"
                disabled={terminal(record.status) || record.cancel_requested}
                onClick={() => setControl('cancel')}
              >
                Cancel run
              </Button>
            </div>
          )
        }
      />
      <QueryState pending={run.isPending} error={run.error} retry={() => void run.refetch()}>
        {record && (
          <>
            <div className="run-summary">
              <div>
                <small>Run ID</small>
                <code>{record.id}</code>
              </div>
              <div>
                <small>Workflow version</small>
                <code>{record.workflow_version_id}</code>
              </div>
              <div>
                <small>Root base SHA</small>
                <code>{record.root_base_sha ?? 'Awaiting verified Git base'}</code>
              </div>
              <div>
                <small>Integration</small>
                <Badge value={record.integration_status ?? 'pending'} />
              </div>
            </div>
            {(record.pause_requested || record.cancel_requested) && !terminal(record.status) && (
              <div className="notice">
                {record.cancel_requested
                  ? 'Cancellation requested. Waiting for process-group termination and persisted results.'
                  : 'Pause requested. Active executions drain; new dispatch is stopped.'}
              </div>
            )}
            {(controlNotice || notice) && (
              <div
                className={`notice ${controlPending ? '' : record.status === 'failed' ? 'error' : 'success'}`}
                role="status"
              >
                {notice || controlNotice?.message}
              </div>
            )}
            {error && <ErrorNotice error={error} />}
            {pendingApprovals.length > 0 && (
              <section className="approval-section">
                <div className="section-title">
                  <h2>Approval required</h2>
                  <span>{pendingApprovals.length} pending snapshots</span>
                </div>
                {pendingApprovals.map((item) => (
                  <article className="approval-card" key={item.id}>
                    <div className="row">
                      <div className="row">
                        <Icon name="lock" />
                        <strong>{item.action.replaceAll('_', ' ')}</strong>
                      </div>
                      <Badge value={item.status ?? 'pending'} />
                    </div>
                    <p>
                      Approval applies only to this exact plan, base, policy and permission
                      snapshot.
                    </p>
                    <div className="hash-block">
                      <small>Snapshot SHA-256</small>
                      <code>{item.snapshot_hash}</code>
                    </div>
                    <div className="row">
                      <small>
                        Expires:{' '}
                        {item.expires_at ? <Time value={item.expires_at} /> : 'server policy'}
                      </small>
                      <Button variant="primary" onClick={() => setApproval(item)}>
                        Review scope
                        <Icon name="arrow" />
                      </Button>
                    </div>
                  </article>
                ))}
              </section>
            )}
            {workflowGraph && (
              <section className="panel run-graph">
                <h2>Pinned workflow</h2>
                <GraphView graph={workflowGraph} states={latestNodeStatuses(nodeItems)} />
              </section>
            )}
            <div className="tabs" role="tablist" aria-label="Run evidence" onKeyDown={tabKeyboard}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'activity'}
                tabIndex={tab === 'activity' ? 0 : -1}
                id="run-activity-tab"
                aria-controls="run-evidence-panel"
                onClick={() => setTab('activity')}
              >
                Live activity
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'executions'}
                tabIndex={tab === 'executions' ? 0 : -1}
                id="run-executions-tab"
                aria-controls="run-evidence-panel"
                onClick={() => setTab('executions')}
              >
                Executions <span>{executions.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'git'}
                tabIndex={tab === 'git' ? 0 : -1}
                id="run-git-tab"
                aria-controls="run-evidence-panel"
                onClick={() => setTab('git')}
              >
                Git & evidence
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'plan'}
                tabIndex={tab === 'plan' ? 0 : -1}
                id="run-plan-tab"
                aria-controls="run-evidence-panel"
                onClick={() => setTab('plan')}
              >
                Plan & snapshots
              </button>
            </div>
            <div role="tabpanel" id="run-evidence-panel" aria-labelledby={`run-${tab}-tab`}>
              {tab === 'activity' && (
                <div className="run-columns">
                  <section className="panel event-panel">
                    <div className="section-title">
                      <h2>Persisted event stream</h2>
                      <span className={`stream-state ${stream.state}`}>
                        <span />
                        {stream.state === 'live' ? 'Live' : stream.state}
                      </span>
                    </div>
                    {stream.error && <div className="notice small">{stream.error}</div>}
                    {history.error && <ErrorNotice error={history.error} />}
                    <section className="event-list" aria-label="Latest run events">
                      {!events.length ? (
                        <p className="muted">
                          Waiting for events. The stream replays persisted records after a
                          reconnect.
                        </p>
                      ) : (
                        events.map((event) => (
                          <article className="event-row" key={event.event_id}>
                            <div className="event-dot" />
                            <div>
                              <div className="row">
                                <strong>{event.type.replaceAll('_', ' ')}</strong>
                                <small className="mono muted">
                                  #{event.run_sequence ?? event.sequence}
                                </small>
                              </div>
                              <div className="muted small">
                                <Time value={event.time} />
                                {event.execution_id &&
                                  ` · execution ${shortId(event.execution_id)}`}
                              </div>
                              <details>
                                <summary>Event context</summary>
                                <JsonView value={event.payload} />
                                {event.trace_id && (
                                  <code className="small">trace {event.trace_id}</code>
                                )}
                              </details>
                            </div>
                          </article>
                        ))
                      )}
                    </section>
                    <p className="muted small">
                      Latest 200 events in memory. Full persisted records remain available through
                      the ledger.
                    </p>
                  </section>
                  <aside className="panel">
                    <h2>Node states</h2>
                    {nodes.error && <ErrorNotice error={nodes.error} />}
                    <div className="node-state-list">
                      {nodeItems.length ? (
                        nodeItems.map((node, index) => (
                          <div className="row" key={node.id ?? `${node.node_id}-${index}`}>
                            <span>
                              <strong>{node.node_id}</strong>
                              <small>Attempt {node.attempt}</small>
                            </span>
                            <Badge value={node.status} />
                          </div>
                        ))
                      ) : (
                        <p className="muted">Scheduler has not dispatched nodes yet.</p>
                      )}
                    </div>
                    <h3>Tracing</h3>
                    {trace ? (
                      <a
                        className="button secondary"
                        href={trace}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Open Langfuse
                        <Icon name="arrow" />
                      </a>
                    ) : (
                      <p className="muted">
                        Trace link is available when the configured backend supplies one.
                      </p>
                    )}
                    {record.trace_id && <code className="small break-all">{record.trace_id}</code>}
                  </aside>
                </div>
              )}
              {tab === 'executions' && (
                <section>
                  {!executions.length ? (
                    <Empty title="No executions dispatched">
                      Approval and scheduler eligibility determine when the worker receives a job.
                    </Empty>
                  ) : (
                    <div className="execution-grid">
                      {executions.map((item) => (
                        <button
                          type="button"
                          className="execution-card"
                          key={item.id ?? item.execution_id}
                          onClick={() => setExecution(item)}
                        >
                          <div className="row">
                            <strong>{item.node_id ?? item.operation ?? 'Execution'}</strong>
                            <Badge value={item.status} />
                          </div>
                          <code>{shortId(item.id ?? item.execution_id)}</code>
                          <dl className="details">
                            <div>
                              <dt>Provider</dt>
                              <dd>{item.provider ?? 'pinned config'}</dd>
                            </div>
                            <div>
                              <dt>Lease epoch</dt>
                              <dd>{item.epoch ?? '—'}</dd>
                            </div>
                            <div>
                              <dt>Usage</dt>
                              <dd>{usageSummary(item.usage ?? item.result?.usage)}</dd>
                            </div>
                          </dl>
                          <span className="text-link">
                            Inspect execution <Icon name="arrow" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {tab === 'git' && (
                <div className="run-columns">
                  <section className="panel">
                    <h2>Git changes</h2>
                    <p className="muted">
                      Task commits and integration evidence are separate from the original default
                      branch.
                    </p>
                    <QueryState
                      pending={changes.isPending}
                      error={changes.error}
                      retry={() => void changes.refetch()}
                    >
                      {!changes.data?.items.length ? (
                        <p>No accepted commits recorded yet.</p>
                      ) : (
                        changes.data.items.map((change) => (
                          <article className="git-change" key={change.id}>
                            <div className="row">
                              <Icon name="branch" />
                              <strong className="mono">{change.branch ?? 'Recorded change'}</strong>
                              <Badge value={change.status} />
                            </div>
                            <dl className="details">
                              <div>
                                <dt>Base SHA</dt>
                                <dd className="mono break-all">{change.base_sha ?? '—'}</dd>
                              </div>
                              <div>
                                <dt>Commit SHA</dt>
                                <dd className="mono break-all">{change.commit_sha ?? '—'}</dd>
                              </div>
                              <div>
                                <dt>Tree SHA</dt>
                                <dd className="mono break-all">{change.tree_sha ?? '—'}</dd>
                              </div>
                            </dl>
                            {change.diff && <pre className="diff-view">{change.diff}</pre>}
                            {change.result && (
                              <details>
                                <summary>Test / review evidence</summary>
                                <JsonView value={change.result} />
                              </details>
                            )}
                          </article>
                        ))
                      )}
                    </QueryState>
                    {record.integration_status === 'needs_resolution' && (
                      <div className="notice error">
                        <Icon name="warning" />
                        <div>
                          <strong>Integration needs resolution</strong>
                          <p>
                            The worker preserved task branches and the default branch. Review
                            conflicting files and the exact resolution approval before resuming.
                          </p>
                          <JsonView value={record.result} />
                          <Button onClick={() => setResolving(true)}>
                            Propose exact resolution tree
                          </Button>
                        </div>
                      </div>
                    )}
                    {record.result && (
                      <details>
                        <summary>Integration result</summary>
                        <JsonView value={record.result} />
                      </details>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Artifacts</h2>
                    <QueryState
                      pending={artifacts.isPending}
                      error={artifacts.error}
                      retry={() => void artifacts.refetch()}
                    >
                      {!artifacts.data?.items.length ? (
                        <p className="muted">
                          Bounded redacted test, review and diff artifacts appear here.
                        </p>
                      ) : (
                        artifacts.data.items.map((artifact) => (
                          <div className="artifact-row" key={artifact.id}>
                            <div>
                              <strong>{artifact.kind}</strong>
                              <small>
                                {artifact.media_type} ·{' '}
                                {artifact.size_bytes === undefined && artifact.size === undefined
                                  ? 'size unknown'
                                  : `${Math.ceil((artifact.size_bytes ?? artifact.size ?? 0) / 1024)} KiB`}
                              </small>
                              <code>{shortId(artifact.sha256)}</code>
                            </div>
                            <div className="card-actions">
                              {[
                                'text/plain',
                                'application/json',
                                'text/x-diff',
                                'text/markdown',
                              ].includes(artifact.media_type) && (
                                <Button
                                  disabled={Boolean(artifactPending)}
                                  onClick={() => void viewArtifact(artifact)}
                                >
                                  {artifactPending === artifact.id ? 'Loading...' : 'Preview'}
                                </Button>
                              )}
                              <Button
                                disabled={Boolean(artifactPending)}
                                onClick={() => void downloadArtifact(artifact.id)}
                              >
                                Download
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </QueryState>
                  </section>
                </div>
              )}
              {tab === 'plan' && (
                <div className="settings-grid">
                  <section className="panel">
                    <h2>Approved / proposed plan</h2>
                    {record.plan ? (
                      <JsonView value={record.plan} />
                    ) : (
                      <p className="muted">
                        Manual task uses its pinned task and acceptance criteria.
                      </p>
                    )}
                    <div className="card-actions">
                      <Button onClick={() => navigate('tasks')}>Inspect task definitions</Button>
                      {record.plan &&
                        !executions.some((item) =>
                          ['agent_task', 'git_commit', 'integrate'].includes(item.operation ?? ''),
                        ) && (
                          <Button onClick={() => setEditingPlan(true)}>Edit proposed plan</Button>
                        )}
                    </div>
                    {record.plan && !graphProposal && (
                      <p className="notice">
                        A workflow proposal for this exact plan is pending. Refresh after the
                        planner reconciles it.
                      </p>
                    )}
                    {graphProposal && (
                      <>
                        <h3>Generated workflow proposal</h3>
                        <GraphView graph={graphProposal} />
                        <p className="muted small">
                          This proposal is separate from the planning run version. Validate and
                          publish it before execution.
                        </p>
                        <Button
                          variant="primary"
                          disabled={command.isPending}
                          onClick={() =>
                            void command
                              .mutateAsync({
                                path: '/api/workflows',
                                body: {
                                  name: `Plan for ${record.task?.title ?? shortId(record.task_id)}`,
                                  graph_json: graphProposal,
                                },
                              })
                              .then((result) =>
                                navigate(
                                  `workflows/${(result as { id: string }).id}/plan/${id}/${record.plan_hash}`,
                                ),
                              )
                              .catch(setError)
                          }
                        >
                          Create workflow from this plan
                          <Icon name="arrow" />
                        </Button>
                      </>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Approval history</h2>
                    {(approvals.data?.items ?? []).map((item) => (
                      <details className="approval-history" key={item.id}>
                        <summary>
                          {item.action} · {item.decision ?? item.status} ·{' '}
                          {shortId(item.snapshot_hash)}
                        </summary>
                        <JsonView value={item.snapshot} />
                        <code className="small break-all">{item.snapshot_hash}</code>
                      </details>
                    ))}
                    <h3>Controls and limits</h3>
                    <JsonView
                      value={{
                        controls: record.controls ?? record.control,
                        pause_requested: record.pause_requested,
                        cancel_requested: record.cancel_requested,
                        limits: record.limits ?? record.policy,
                      }}
                    />
                  </section>
                </div>
              )}
            </div>
          </>
        )}
      </QueryState>
      {editingPlan && record?.plan && (
        <PlanEditor
          runId={id}
          revision={record.revision}
          plan={record.plan}
          close={() => setEditingPlan(false)}
        />
      )}
      {resolving && (
        <Modal
          title="Propose integration resolution"
          description="Resolve the preserved conflict worktree on the host first. This proposal requests approval of its exact tree SHA; it does not grant new paths or tools."
          close={() => setResolving(false)}
        >
          <ActionForm
            label="Request resolution approval"
            cancel={() => setResolving(false)}
            submit={async (data) => {
              await command.mutateAsync({
                path: `/api/runs/${id}/resolution`,
                body: {
                  execution_id: String(data.get('execution_id')),
                  tree_sha: String(data.get('tree_sha')).trim(),
                },
              });
              setResolving(false);
              setNotice('Resolution snapshot proposed. Review its new approval before resuming.');
            }}
          >
            <Field label="Conflicted integration execution">
              <select name="execution_id" required>
                {executions
                  .filter((item) => item.operation === 'integrate')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} · {item.status}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Exact resolved tree SHA (40 lowercase hex characters)">
              <input
                name="tree_sha"
                required
                pattern="[0-9a-f]{40}"
                className="mono"
                placeholder="From the preserved integration worktree"
              />
            </Field>
          </ActionForm>
        </Modal>
      )}
      {approval && (
        <Modal
          title={`Review ${approval.action.replaceAll('_', ' ')}`}
          description="A changed or expired snapshot is rejected by the server. This decision cannot grant unrelated permissions."
          close={() => setApproval(null)}
        >
          <div className="hash-block">
            <small>Exact snapshot SHA-256</small>
            <code>{approval.snapshot_hash}</code>
          </div>
          <JsonView value={approval.snapshot} />
          <p className="small muted">
            Expires: {approval.expires_at ?? 'as defined by server policy'} · Revision{' '}
            {approval.revision}
          </p>
          <ActionForm
            label="Approve this snapshot"
            cancel={() => setApproval(null)}
            submit={async (data) => {
              if (data.get('confirmed') !== 'on')
                throw new Error('Confirm that you reviewed the concrete scope.');
              await command.mutateAsync({
                path: `/api/approvals/${approval.id}/decision`,
                body: {
                  decision: 'approve',
                  snapshot_hash: approval.snapshot_hash,
                  revision: approval.revision,
                },
              });
              setApproval(null);
              setNotice('Approval persisted. The scheduler will reconcile this exact decision.');
            }}
          >
            <label className="checkbox">
              <input name="confirmed" type="checkbox" required />
              <span>
                I reviewed the plan, base, paths, tools and limits in this exact snapshot.
              </span>
            </label>
          </ActionForm>
          <Button
            variant="danger"
            disabled={command.isPending}
            onClick={() =>
              void command
                .mutateAsync({
                  path: `/api/approvals/${approval.id}/decision`,
                  body: {
                    decision: 'reject',
                    snapshot_hash: approval.snapshot_hash,
                    revision: approval.revision,
                  },
                })
                .then(() => {
                  setApproval(null);
                  setNotice('Snapshot rejected.');
                })
                .catch(setError)
            }
          >
            Reject snapshot
          </Button>
        </Modal>
      )}
      {control && (
        <Modal
          title={`${control === 'cancel' ? 'Cancel' : control === 'pause' ? 'Pause' : 'Resume'} run`}
          description={
            control === 'pause'
              ? 'New dispatch stops. Active executions drain before the run becomes paused.'
              : control === 'cancel'
                ? 'The worker terminates the process group and preserves committed artifacts. Cancellation is not instantaneous.'
                : 'The scheduler reconciles persisted state before dispatching eligible work.'
          }
          close={() => setControl(null)}
        >
          <ActionForm
            label={control === 'cancel' ? 'Request cancellation' : `Request ${control}`}
            cancel={() => setControl(null)}
            submit={async () => {
              await command.mutateAsync({ path: `/api/runs/${id}/${control}` });
              setRequestedControl({ action: control, confirmed: false });
              setNotice('');
              setControl(null);
            }}
          >
            <p className="mono">{id}</p>
          </ActionForm>
        </Modal>
      )}
      {execution && (
        <Modal
          title={`Execution ${shortId(execution.id ?? execution.execution_id)}`}
          description="Result evidence and provider-reported usage. Raw host credentials are never exposed."
          close={() => setExecution(null)}
        >
          <div className="row">
            <Badge value={execution.status} />
            <Badge value={execution.operation ?? 'agent_task'} />
          </div>
          <dl className="details">
            <div>
              <dt>Branch</dt>
              <dd className="mono">{execution.branch ?? 'Recorded in result'}</dd>
            </div>
            <div>
              <dt>Worktree key</dt>
              <dd className="mono">{execution.worktree_key ?? 'Recorded in result'}</dd>
            </div>
            <div>
              <dt>Usage</dt>
              <dd>{usageSummary(execution.usage ?? execution.result?.usage)}</dd>
            </div>
          </dl>
          <JsonView value={execution.result ?? execution} />
        </Modal>
      )}
      {preview && (
        <Modal
          title={preview.name}
          description="Escaped artifact text; HTML and scripts are not executed."
          close={() => setPreview(null)}
        >
          <pre className="diff-view">{preview.text}</pre>
        </Modal>
      )}
    </>
  );
}
