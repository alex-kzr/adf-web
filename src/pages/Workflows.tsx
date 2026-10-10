import {
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type Node as FlowNode,
  Handle,
  MiniMap,
  type NodeChange,
  type NodeProps,
  type OnMoveStart,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from '@xyflow/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { errorMessage } from '../api';
import { conditionValue } from '../evidence';
import {
  captureNodeGeometry,
  graphFitOptions,
  type NodeGeometry,
  ResizeFitPolicy,
} from '../flowViewport';
import { useApi, useCommand, useList, useRecord } from '../hooks';
import type {
  Agent,
  Graph,
  Json,
  JsonObject,
  RegistryEntry,
  Run,
  Task,
  Workflow,
  WorkflowNodeType,
  WorkflowVersion,
} from '../models';
import { nodeTypes } from '../models';
import {
  ActionForm,
  Badge,
  Button,
  Field,
  Icon,
  LoadMore,
  Modal,
  PageTitle,
  QueryState,
  shortId,
  text,
} from '../ui';
import {
  developmentGraph,
  emptyGraph,
  graphPositions,
  lines,
  nodeLabels,
  ports,
  validateGraph,
} from '../workflow';

type FactoryNode = FlowNode<{ kind: WorkflowNodeType; label: string; status?: string }, 'factory'>;
const FactoryNodeView = memo(function FactoryNodeView({ data, selected }: NodeProps<FactoryNode>) {
  return (
    <div className={`factory-node kind-${data.kind} ${selected ? 'selected' : ''}`}>
      <div className="node-icon">
        <Icon
          name={
            data.kind === 'agent_task' || data.kind === 'planner'
              ? 'agents'
              : data.kind === 'approval'
                ? 'lock'
                : data.kind === 'git_commit'
                  ? 'branch'
                  : 'workflows'
          }
        />
      </div>
      <div>
        <small>{nodeLabels[data.kind]}</small>
        <strong>{data.label}</strong>
        {data.status && <Badge value={data.status} />}
      </div>
      {data.kind !== 'start' && <Handle id="in" type="target" position={Position.Left} />}{' '}
      {ports(data.kind).map((port, i) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={Position.Right}
          style={{ top: ports(data.kind).length > 1 ? 25 + i * 30 : '50%' }}
          aria-label={`${port} output`}
        />
      ))}
      {data.kind === 'condition' && (
        <div className="port-labels">
          <span>true</span>
          <span>false</span>
        </div>
      )}
    </div>
  );
});
const flowTypes = { factory: FactoryNodeView };
function useFlowViewport(documentKey: string) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ReactFlowInstance<FactoryNode, Edge> | null>(null);
  const policy = useRef(new ResizeFitPolicy());
  const frame = useRef<number | undefined>(undefined);
  const fit = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      if (policy.current.automatic) void instance.current?.fitView(graphFitOptions);
    });
  }, []);
  const onInit = useCallback(
    (flow: ReactFlowInstance<FactoryNode, Edge>) => {
      instance.current = flow;
      fit();
    },
    [fit],
  );
  const preserve = useCallback(() => policy.current.preserve(), []);
  const reset = useCallback(() => policy.current.reset(), []);
  const onMoveStart = useCallback<OnMoveStart>(
    (event) => {
      if (event) preserve();
    },
    [preserve],
  );
  useEffect(() => {
    // Switching the selected immutable graph is an explicit request to see that document.
    if (!documentKey) return;
    policy.current.reset();
    fit();
  }, [documentKey, fit]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && policy.current.resize(entry.contentRect.width, entry.contentRect.height)) fit();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [fit]);
  return { container, onInit, onMoveStart, preserve, reset };
}

export function GraphView({
  graph,
  states = {},
}: {
  graph: Graph;
  states?: Record<string, string>;
}) {
  const viewport = useFlowViewport(
    `${graph.nodes.map((node) => node.id).join(',')}|${graph.edges.map((edge) => `${edge.source}:${edge.target}`).join(',')}`,
  );
  const layout = useMemo(() => graphPositions(graph), [graph]);
  const nodes: FactoryNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'factory',
    position: layout[node.id],
    data: { kind: node.type, label: node.id, status: states[node.id] },
  }));
  return (
    <div
      className="flow-readonly"
      ref={viewport.container}
      onPointerDownCapture={viewport.preserve}
      onFocusCapture={viewport.preserve}
    >
      <ReactFlow<FactoryNode, Edge>
        nodes={nodes}
        edges={graph.edges.map((edge, i) => ({
          id: edge.id ?? String(i),
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.source_port,
          targetHandle: edge.target_port,
        }))}
        nodeTypes={flowTypes}
        fitView
        minZoom={graphFitOptions.minZoom}
        fitViewOptions={graphFitOptions}
        onInit={viewport.onInit}
        onMoveStart={viewport.onMoveStart}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background gap={24} />
        <Controls
          showInteractive={false}
          fitViewOptions={graphFitOptions}
          onZoomIn={viewport.preserve}
          onZoomOut={viewport.preserve}
          onFitView={viewport.reset}
        />
      </ReactFlow>
    </div>
  );
}
export function Workflows({
  navigate,
  initialId,
  sourceRunId,
  sourcePlanHash,
}: {
  navigate: (route: string) => void;
  initialId?: string;
  sourceRunId?: string;
  sourcePlanHash?: string;
}) {
  const api = useApi();
  const workflowDetail = useRecord<Workflow>(`/api/workflows/${initialId}`, Boolean(initialId));
  const sourceRun = useRecord<Run>(`/api/runs/${sourceRunId}`, Boolean(sourceRunId));
  const workflows = useList<Workflow>('workflows');
  const tasks = useList<Task>('tasks');
  const agents = useList<Agent>('agents');
  const policies = useList<RegistryEntry>('policies');
  const command = useCommand();
  const [current, setCurrent] = useState<Workflow | null>(null);
  const viewport = useFlowViewport(current?.id ?? 'new');
  const [graph, setGraph] = useState<Graph>(emptyGraph);
  const [name, setName] = useState('');
  const [geometry, setGeometry] = useState<Record<string, NodeGeometry>>(() =>
    Object.fromEntries(
      Object.entries(graphPositions(emptyGraph())).map(([id, position]) => [id, { position }]),
    ),
  );
  const [selected, setSelected] = useState('');
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [palette, setPalette] = useState<WorkflowNodeType>('agent_task');
  const versions = useRecord<{ items: WorkflowVersion[] }>(
    `/api/workflows/${current?.id}/versions`,
    Boolean(current),
  );
  const node = graph.nodes.find((n) => n.id === selected);
  const nodes: FactoryNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'factory',
    ...(geometry[n.id] ?? { position: { x: 50, y: 50 } }),
    selected: selected === n.id,
    data: { kind: n.type, label: n.id },
  }));
  const edges: Edge[] = graph.edges.map((edge, index) => ({
    id: edge.id ?? `edge-${index}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.source_port,
    targetHandle: edge.target_port,
  }));
  const open = useCallback((workflow: Workflow) => {
    setCurrent(workflow);
    setGraph(structuredClone(workflow.graph_json));
    setName(workflow.name);
    setGeometry(
      Object.fromEntries(
        Object.entries(graphPositions(workflow.graph_json)).map(([id, position]) => [
          id,
          { position },
        ]),
      ),
    );
    setSelected('');
    setDirty(false);
    setMessages([]);
    setNotice('');
  }, []);
  useEffect(() => {
    if (workflowDetail.data && current?.id !== workflowDetail.data.id) open(workflowDetail.data);
  }, [workflowDetail.data, current?.id, open]);
  const changeGraph = useCallback((next: Graph) => {
    setGraph(next);
    setDirty(true);
    setMessages([]);
    setNotice('');
  }, []);
  const updateConfig = (key: string, value: Json) => {
    if (!node) return;
    changeGraph({
      ...graph,
      nodes: graph.nodes.map((item) =>
        item.id === node.id
          ? {
              ...item,
              config:
                value === '' && key !== 'value'
                  ? Object.fromEntries(Object.entries(item.config).filter(([name]) => name !== key))
                  : { ...item.config, [key]: value },
            }
          : item,
      ),
    });
  };
  const addNode = () => {
    const suffix = graph.nodes.filter((n) => n.type === palette).length + 1;
    let id = `${palette}_${suffix}`;
    while (graph.nodes.some((n) => n.id === id)) id += '_new';
    const config: JsonObject =
      palette === 'condition'
        ? { field: 'status', operator: 'eq', value: 'succeeded' }
        : palette === 'parallel_join'
          ? { policy: 'all_success', fork_id: '' }
          : palette === 'parallel_fork'
            ? { join_id: '' }
            : palette === 'test'
              ? { check_ids: [], timeout_sec: 120 }
              : palette === 'approval'
                ? { action: 'execute_plan' }
                : {};
    changeGraph({ ...graph, nodes: [...graph.nodes, { id, type: palette, config }] });
    setGeometry((value) => ({
      ...value,
      [id]: {
        position: {
          x: 180 + (graph.nodes.length % 4) * 260,
          y: 220 + Math.floor(graph.nodes.length / 4) * 120,
        },
      },
    }));
    setSelected(id);
  };
  const connect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const edge = {
      id: crypto.randomUUID(),
      source: connection.source,
      target: connection.target,
      source_port: (connection.sourceHandle ?? 'out') as 'out' | 'true' | 'false',
      target_port: 'in' as const,
    };
    if (
      graph.edges.some(
        (e) =>
          e.source === edge.source &&
          e.target === edge.target &&
          e.source_port === edge.source_port,
      )
    )
      return;
    const next = { ...graph, edges: [...graph.edges, edge] };
    const errors = validateGraph(next).filter(
      (message) => message.includes('cycle') || message.includes('ports'),
    );
    if (errors.length) {
      setMessages(errors);
      return;
    }
    changeGraph(next);
  };
  const handleNodes = useCallback(
    (changes: NodeChange<FactoryNode>[]) => {
      const selection = changes.find((change) => change.type === 'select' && change.selected);
      if (selection?.type === 'select') setSelected(selection.id);
      const changed = applyNodeChanges(changes, nodes);
      setGeometry(captureNodeGeometry(changed));
      const deleted = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id);
      if (deleted.length)
        changeGraph({
          ...graph,
          nodes: graph.nodes.filter((n) => !deleted.includes(n.id)),
          edges: graph.edges.filter(
            (e) => !deleted.includes(e.source) && !deleted.includes(e.target),
          ),
        });
    },
    [nodes, graph, changeGraph],
  );
  const save = async (): Promise<Workflow> => {
    if (!name.trim()) throw new Error('Give the workflow a name.');
    const result = (await command.mutateAsync({
      path: current ? `/api/workflows/${current.id}` : '/api/workflows',
      method: current ? 'PATCH' : 'POST',
      revision: current?.revision,
      body: { name: name.trim(), graph_json: graph },
    })) as Workflow;
    setCurrent(result);
    setDirty(false);
    return result;
  };
  const runAction = async (action: 'save' | 'validate' | 'publish') => {
    setMessages([]);
    setNotice('');
    try {
      if (action === 'save') {
        await save();
        setNotice('Draft saved. Published versions remain immutable.');
        return;
      }
      const local = validateGraph(graph);
      if (local.length) {
        setMessages(local);
        return;
      }
      const record = current && !dirty ? current : await save();
      const validation = (await command.mutateAsync({
        path: `/api/workflows/${record.id}/validate`,
        body: { graph_json: graph },
      })) as { valid: boolean; errors: (string | { message: string })[] };
      if (!validation.valid) {
        setMessages(
          validation.errors.map((value) => (typeof value === 'string' ? value : value.message)),
        );
        return;
      }
      if (action === 'publish') {
        await command.mutateAsync({ path: `/api/workflows/${record.id}/versions`, body: {} });
        setNotice('Immutable version published. Choose this exact version when launching.');
      } else setNotice('Graph passed server validation.');
    } catch (error) {
      setMessages([errorMessage(error)]);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="Workflow studio"
        title="Build a bounded workflow"
        description="Connect typed nodes, validate the DAG, then publish an immutable execution version."
        action={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" />
            New workflow
          </Button>
        }
      />
      <div className="workflow-layout">
        <aside className="workflow-library">
          <h2>Workflows</h2>
          <QueryState
            pending={workflows.isPending}
            error={workflows.error}
            retry={() => void workflows.refetch()}
          >
            {!workflows.data?.items.length ? (
              <p className="muted">Create your first workflow.</p>
            ) : (
              workflows.data.items.map((workflow) => (
                <button
                  type="button"
                  key={workflow.id}
                  className={`library-item ${current?.id === workflow.id ? 'active' : ''}`}
                  onClick={() => {
                    open(workflow);
                    navigate(`workflows/${workflow.id}`);
                  }}
                >
                  <Icon name="workflows" />
                  <span>
                    {workflow.name}
                    <small>Draft revision {workflow.revision}</small>
                  </span>
                </button>
              ))
            )}
          </QueryState>
          <LoadMore query={workflows} />
          <div className="library-divider" />
          <h2>Immutable versions</h2>
          {versions.isPending && current ? (
            <p className="muted">Loading versions…</p>
          ) : versions.error ? (
            <p className="error-text">{errorMessage(versions.error)}</p>
          ) : versions.data?.items.length ? (
            versions.data.items.map((version) => (
              <div className="version-item" key={version.id}>
                <Badge value={`v${version.version}`} />
                <span className="mono">{shortId(version.graph_hash)}</span>
              </div>
            ))
          ) : (
            <p className="muted">Validate and publish a version.</p>
          )}
        </aside>
        <section className="workflow-editor">
          <div className="editor-toolbar">
            <input
              className="workflow-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              aria-label="Workflow name"
              placeholder="Workflow name"
            />
            <Badge value={dirty ? 'unsaved' : 'draft'} />
            <div className="toolbar-actions">
              <Button disabled={command.isPending} onClick={() => void runAction('save')}>
                Save draft
              </Button>
              {current && (
                <Button
                  onClick={() => {
                    const latest = workflows.data?.items.find((item) => item.id === current.id);
                    if (latest) open(latest);
                  }}
                >
                  Reload server draft
                </Button>
              )}
              <Button disabled={command.isPending} onClick={() => void runAction('validate')}>
                Validate
              </Button>
              <Button disabled={command.isPending} onClick={() => void runAction('publish')}>
                Publish version
              </Button>
              <Button
                variant="primary"
                disabled={
                  !versions.data?.items.length ||
                  Boolean(
                    sourceRunId &&
                      (!sourcePlanHash || sourceRun.data?.plan_hash !== sourcePlanHash),
                  )
                }
                onClick={() => setLaunching(true)}
              >
                <Icon name="runs" />
                Launch
              </Button>
            </div>
          </div>
          <div className="node-palette">
            <select
              aria-label="Node type to add"
              value={palette}
              onChange={(e) => setPalette(e.target.value as WorkflowNodeType)}
            >
              {nodeTypes.map((type) => (
                <option value={type} key={type}>
                  {nodeLabels[type]}
                </option>
              ))}
            </select>
            <Button onClick={addNode}>
              <Icon name="plus" />
              Add node
            </Button>
            <small>
              Connect handles. Select a node to configure. Delete selected edges with Backspace.
            </small>
          </div>
          <div
            className="flow-editor"
            ref={viewport.container}
            onPointerDownCapture={viewport.preserve}
            onFocusCapture={viewport.preserve}
          >
            <ReactFlow<FactoryNode, Edge>
              nodes={nodes}
              edges={edges}
              nodeTypes={flowTypes}
              onNodesChange={handleNodes}
              onConnect={connect}
              onNodeClick={(_, selectedNode) => setSelected(selectedNode.id)}
              onEdgesDelete={(deleted) =>
                changeGraph({
                  ...graph,
                  edges: graph.edges.filter(
                    (edge, index) =>
                      !deleted.some((item) => item.id === (edge.id ?? `edge-${index}`)),
                  ),
                })
              }
              onPaneClick={() => setSelected('')}
              fitView
              minZoom={graphFitOptions.minZoom}
              fitViewOptions={graphFitOptions}
              onInit={viewport.onInit}
              onMoveStart={viewport.onMoveStart}
            >
              <Background gap={24} color="#d9dfda" />
              <MiniMap pannable zoomable />
              <Controls
                fitViewOptions={graphFitOptions}
                onZoomIn={viewport.preserve}
                onZoomOut={viewport.preserve}
                onFitView={viewport.reset}
              />
            </ReactFlow>
          </div>
          {notice && (
            <div className="notice success" role="status">
              <Icon name="check" />
              {notice}
            </div>
          )}
          {messages.length > 0 && (
            <div className="notice error" role="alert">
              <div>
                <strong>Workflow needs attention</strong>
                <ul>
                  {messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
        <aside className="node-settings">
          <h2>{node ? nodeLabels[node.type] : 'Node settings'}</h2>
          {!node ? (
            <p className="muted">
              Select a node on the canvas or with the keyboard to edit its typed configuration.
            </p>
          ) : (
            <>
              <Field label="Node ID">
                <input value={node.id} readOnly className="mono" />
              </Field>
              {['planner', 'agent_task', 'review'].includes(node.type) && (
                <Field label="Agent config version">
                  <select
                    value={String(node.config.agent_config_version_id ?? '')}
                    onChange={(e) => updateConfig('agent_config_version_id', e.target.value)}
                  >
                    <option value="">Run default agent</option>
                    {agents.data?.items.map((agent) => (
                      <option value={agent.config_version_id} key={agent.id}>
                        {agent.name} · {agent.role}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {node.type === 'agent_task' && (
                <>
                  <Field label="Task binding">
                    <select
                      value={String(node.config.task_id ?? '')}
                      onChange={(e) => updateConfig('task_id', e.target.value)}
                    >
                      <option value="">Run task / approved plan</option>
                      {tasks.data?.items.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Expected files (one per line)">
                    <textarea
                      key={`${node.id}-files`}
                      defaultValue={
                        Array.isArray(node.config.expected_files)
                          ? node.config.expected_files.join('\n')
                          : ''
                      }
                      onChange={(e) => updateConfig('expected_files', lines(e.target.value))}
                    />
                  </Field>
                </>
              )}
              {['test', 'review', 'git_commit', 'condition'].includes(node.type) && (
                <Field
                  label={node.type === 'condition' ? 'Source evidence node' : 'Target agent node'}
                >
                  <select
                    value={String(
                      node.config[node.type === 'condition' ? 'source_node' : 'target_node'] ?? '',
                    )}
                    onChange={(e) =>
                      updateConfig(
                        node.type === 'condition' ? 'source_node' : 'target_node',
                        e.target.value,
                      )
                    }
                  >
                    <option value="">Default ancestor</option>
                    {graph.nodes
                      .filter(
                        (n) =>
                          n.id !== node.id &&
                          (node.type === 'condition' || n.type === 'agent_task'),
                      )
                      .map((n) => (
                        <option key={n.id}>{n.id}</option>
                      ))}
                  </select>
                </Field>
              )}
              {node.type === 'condition' && (
                <>
                  <Field label="State field">
                    <select
                      value={String(node.config.field ?? 'status')}
                      onChange={(e) => {
                        const field = e.target.value;
                        changeGraph({
                          ...graph,
                          nodes: graph.nodes.map((item) =>
                            item.id === node.id
                              ? {
                                  ...item,
                                  config: {
                                    ...item.config,
                                    field,
                                    value: conditionValue(
                                      field,
                                      String(item.config.operator ?? 'eq'),
                                      field === 'status' ? 'succeeded' : 'true',
                                    ),
                                  },
                                }
                              : item,
                          ),
                        });
                      }}
                    >
                      {['status', 'test_passed', 'review_approved', 'planner_has_tasks'].map(
                        (field) => (
                          <option key={field}>{field}</option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Operator">
                    <select
                      value={String(node.config.operator ?? 'eq')}
                      onChange={(e) => {
                        const operator = e.target.value;
                        const value = Array.isArray(node.config.value)
                          ? node.config.value.join(',')
                          : String(
                              node.config.value ??
                                (node.config.field === 'status' ? 'succeeded' : true),
                            );
                        changeGraph({
                          ...graph,
                          nodes: graph.nodes.map((item) =>
                            item.id === node.id
                              ? {
                                  ...item,
                                  config: {
                                    ...item.config,
                                    operator,
                                    value: conditionValue(
                                      String(item.config.field ?? 'status'),
                                      operator,
                                      operator === 'eq' ? value.split(',')[0] : value,
                                    ),
                                  },
                                }
                              : item,
                          ),
                        });
                      }}
                    >
                      <option value="eq">Equals</option>
                      <option value="in">One of</option>
                    </select>
                  </Field>
                  <Field label="Value">
                    {String(node.config.field ?? 'status') === 'status' ? (
                      <input
                        key={`${node.id}-${node.config.operator ?? 'eq'}-status`}
                        defaultValue={
                          Array.isArray(node.config.value)
                            ? node.config.value.join(', ')
                            : String(node.config.value ?? '')
                        }
                        onChange={(e) =>
                          updateConfig(
                            'value',
                            conditionValue(
                              'status',
                              String(node.config.operator ?? 'eq'),
                              e.target.value,
                            ),
                          )
                        }
                        placeholder={
                          node.config.operator === 'in' ? 'succeeded, skipped' : 'succeeded'
                        }
                      />
                    ) : (
                      <select
                        value={
                          Array.isArray(node.config.value)
                            ? node.config.value.join(',')
                            : String(node.config.value ?? true)
                        }
                        onChange={(e) =>
                          updateConfig(
                            'value',
                            conditionValue(
                              String(node.config.field),
                              String(node.config.operator ?? 'eq'),
                              e.target.value,
                            ),
                          )
                        }
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                        {node.config.operator === 'in' && (
                          <option value="true,false">True or false</option>
                        )}
                      </select>
                    )}
                  </Field>
                </>
              )}
              {node.type === 'parallel_fork' && (
                <Field label="Paired join">
                  <select
                    value={String(node.config.join_id ?? '')}
                    onChange={(e) => updateConfig('join_id', e.target.value)}
                  >
                    <option value="">Select join</option>
                    {graph.nodes
                      .filter((n) => n.type === 'parallel_join')
                      .map((n) => (
                        <option key={n.id}>{n.id}</option>
                      ))}
                  </select>
                </Field>
              )}
              {node.type === 'parallel_join' && (
                <>
                  <Field label="Paired fork">
                    <select
                      value={String(node.config.fork_id ?? '')}
                      onChange={(e) => updateConfig('fork_id', e.target.value)}
                    >
                      <option value="">Select fork</option>
                      {graph.nodes
                        .filter((n) => n.type === 'parallel_fork')
                        .map((n) => (
                          <option key={n.id}>{n.id}</option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Join policy">
                    <input value="All selected branches must succeed" readOnly />
                  </Field>
                </>
              )}
              {node.type === 'test' && (
                <>
                  <Field label="Registered check IDs">
                    <textarea
                      key={`${node.id}-checks`}
                      defaultValue={
                        Array.isArray(node.config.check_ids) ? node.config.check_ids.join('\n') : ''
                      }
                      onChange={(e) => updateConfig('check_ids', lines(e.target.value))}
                      placeholder="unit"
                    />
                  </Field>
                  <Field label="Timeout (seconds)">
                    <input
                      type="number"
                      min={1}
                      max={1800}
                      value={Number(node.config.timeout_sec ?? 120)}
                      onChange={(e) => updateConfig('timeout_sec', Number(e.target.value))}
                    />
                  </Field>
                </>
              )}
              {node.type === 'approval' && (
                <Field label="Bounded action">
                  <select
                    value={String(node.config.action ?? 'execute_plan')}
                    onChange={(e) => updateConfig('action', e.target.value)}
                  >
                    {['execute_plan', 'execution', 'plan', 'commit', 'integrate'].map((action) => (
                      <option key={action}>{action}</option>
                    ))}
                  </select>
                </Field>
              )}
              {node.type === 'git_commit' && (
                <>
                  <Field label="Test evidence node">
                    <select
                      value={String(node.config.test_node ?? '')}
                      onChange={(e) => updateConfig('test_node', e.target.value)}
                    >
                      <option value="">Default preceding test</option>
                      {graph.nodes
                        .filter((n) => n.type === 'test')
                        .map((n) => (
                          <option key={n.id}>{n.id}</option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Review evidence node">
                    <select
                      value={String(node.config.review_node ?? '')}
                      onChange={(e) => updateConfig('review_node', e.target.value)}
                    >
                      <option value="">Default preceding review</option>
                      {graph.nodes
                        .filter((n) => n.type === 'review')
                        .map((n) => (
                          <option key={n.id}>{n.id}</option>
                        ))}
                    </select>
                  </Field>
                </>
              )}
              <p className="muted small">
                Server validation enforces the node schema, approved policy and matching fork / join
                scopes.
              </p>
              <Button
                variant="danger"
                onClick={() => {
                  changeGraph({
                    ...graph,
                    nodes: graph.nodes.filter((n) => n.id !== node.id),
                    edges: graph.edges.filter((e) => e.source !== node.id && e.target !== node.id),
                  });
                  setSelected('');
                }}
              >
                Remove node
              </Button>
            </>
          )}
        </aside>
      </div>
      {creating && (
        <Modal
          title="New workflow"
          description="The initial draft includes approval, a task agent, tests, independent review and commit. Register an independent Reviewer before launching."
          close={() => setCreating(false)}
        >
          <ActionForm
            label="Create draft"
            cancel={() => setCreating(false)}
            submit={async (data) => {
              const result = (await command.mutateAsync({
                path: '/api/workflows',
                body: { name: text(data, 'name'), graph_json: developmentGraph() },
              })) as Workflow;
              open(result);
              setCreating(false);
            }}
          >
            <Field label="Workflow name">
              <input name="name" required maxLength={120} autoFocus />
            </Field>
          </ActionForm>
        </Modal>
      )}
      {launching && current && (
        <Modal
          title="Launch immutable version"
          description="The run pins workflow, agent and policy snapshots. Approval may block dispatch."
          close={() => setLaunching(false)}
        >
          <ActionForm
            label="Queue run"
            cancel={() => setLaunching(false)}
            submit={async (data) => {
              const plannedRun = sourceRunId
                ? await api.get<Run>(`/api/runs/${sourceRunId}`)
                : undefined;
              if (sourceRunId && (!sourcePlanHash || plannedRun?.plan_hash !== sourcePlanHash))
                throw new Error(
                  'The source plan changed. Create a new workflow from its current proposal before launching.',
                );
              if (plannedRun && text(data, 'task') !== plannedRun.task_id)
                throw new Error(
                  'A generated workflow must launch the root task of its source plan.',
                );
              const result = (await command.mutateAsync({
                path: '/api/runs',
                body: {
                  task_id: text(data, 'task'),
                  workflow_version_id: text(data, 'version'),
                  agent_config_version_id: text(data, 'agent') || undefined,
                  policy_id:
                    text(data, 'policy') || String(plannedRun?.policy?.id ?? '') || undefined,
                  root_base_sha: plannedRun?.root_base_sha ?? undefined,
                  plan: plannedRun?.plan ?? undefined,
                },
              })) as Run;
              setLaunching(false);
              navigate(`runs/${result.id}`);
            }}
          >
            {sourceRun.data?.plan && (
              <div className="notice">
                This launch includes the exact plan from planning run {shortId(sourceRunId)} and
                requests fresh execution approval.
              </div>
            )}
            {sourceRunId && sourceRun.data?.plan_hash !== sourcePlanHash && (
              <p className="notice error">
                The source plan changed. Return to its run and create a current workflow proposal.
              </p>
            )}
            <Field label="Workflow version">
              <select name="version" required>
                {versions.data?.items.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version} · {shortId(version.graph_hash)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Task">
              <select name="task" required defaultValue={sourceRun.data?.task_id ?? ''}>
                <option value="">Select an eligible task</option>
                {tasks.data?.items
                  .filter(
                    (task) =>
                      !['running', 'done', 'cancelled'].includes(task.status) &&
                      (!sourceRunId || task.id === sourceRun.data?.task_id),
                  )
                  .map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Default agent version">
              <select name="agent">
                <option value="">Workflow configured agents</option>
                {agents.data?.items.map((agent) => (
                  <option value={agent.config_version_id} key={agent.id}>
                    {agent.name} · {agent.provider}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Execution policy">
              <select name="policy" defaultValue={String(sourceRun.data?.policy?.id ?? '')}>
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
