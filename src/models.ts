export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export interface Entity {
  id: string;
  revision: number;
  created_at?: string;
  updated_at?: string;
}
export interface Page<T> {
  items: T[];
  next_cursor: string | number | null;
}
export interface Check {
  id: string;
  argv: string[];
  timeout_sec: number;
}
export interface Project extends Entity {
  name: string;
  repo_path: string;
  default_branch: string;
  allowed_root: string;
  trusted: boolean;
  checks: Check[];
}
export type TaskStatus =
  | 'draft'
  | 'ready'
  | 'blocked'
  | 'running'
  | 'review'
  | 'done'
  | 'failed'
  | 'cancelled';
export interface Task extends Entity {
  project_id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  priority: number;
  status: TaskStatus;
  dependency_ids: string[];
  expected_files: string[];
}
export const nodeTypes = [
  'start',
  'planner',
  'agent_task',
  'condition',
  'parallel_fork',
  'parallel_join',
  'test',
  'review',
  'approval',
  'git_commit',
  'end',
] as const;
export type WorkflowNodeType = (typeof nodeTypes)[number];
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  config: JsonObject;
}
export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  source_port: 'out' | 'true' | 'false';
  target_port: 'in';
}
export interface Graph {
  schema_version: '1';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
export interface Workflow extends Entity {
  name: string;
  graph_json: Graph;
}
export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  graph_json: Graph;
  graph_hash: string;
}
export interface Agent extends Entity {
  name: string;
  role: string;
  provider: 'codex' | 'claude' | 'mock';
  model: string | null;
  prompt: string;
  skill_ids: string[];
  tool_ids: string[];
  mcp_server_ids: string[];
  permission_profile: 'observe' | 'trusted-development';
  limits: JsonObject;
  config_version_id: string;
  config_hash: string;
}
export interface RegistryEntry extends Entity {
  name: string;
  manifest: JsonObject;
  version?: number;
  manifest_hash?: string;
  config_hash?: string;
}
export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export interface NodeRun {
  id?: string;
  node_id: string;
  attempt: number;
  status: string;
  result?: JsonObject;
}
export interface Execution {
  id: string;
  execution_id?: string;
  node_id?: string;
  status: string;
  provider?: string;
  operation?: string;
  attempt?: number;
  epoch?: number;
  branch?: string;
  worktree_key?: string;
  result?: JsonObject;
  usage?: JsonObject | null;
  trace_id?: string;
}
export interface Approval extends Entity {
  action: string;
  snapshot: JsonObject;
  snapshot_hash: string;
  status?: string;
  decision?: string | null;
  expires_at?: string | null;
  run_id: string;
}
export interface Artifact extends Entity {
  kind: string;
  media_type: string;
  sha256: string;
  size_bytes?: number;
  size?: number;
  execution_id?: string;
}
export interface GitChange extends Entity {
  execution_id?: string;
  branch?: string;
  base_sha?: string;
  commit_sha?: string;
  tree_sha?: string;
  status?: string;
  diff?: string;
  result?: JsonObject;
}
export interface Run extends Entity {
  task_id: string;
  project_id: string;
  workflow_version_id: string;
  status: RunStatus;
  root_base_sha?: string;
  integration_status?: string;
  integration_branch?: string;
  result?: JsonObject;
  plan?: JsonObject;
  plan_hash?: string;
  pause_requested?: boolean;
  cancel_requested?: boolean;
  controls?: JsonObject;
  control?: JsonObject;
  graph_json?: Graph;
  task?: Task;
  policy?: JsonObject;
  resolution?: JsonObject;
  nodes?: NodeRun[];
  executions?: Execution[];
  approvals?: Approval[];
  trace_id?: string;
  trace_url?: string;
  limits?: JsonObject;
}
export interface DomainEvent {
  event_id: string;
  run_id?: string;
  run_sequence?: number;
  sequence?: number;
  type: string;
  time?: string;
  execution_id?: string;
  node_id?: string;
  trace_id?: string;
  payload: JsonObject;
}
export interface ProviderHealth {
  provider: string;
  available?: boolean;
  healthy?: boolean;
  installed?: boolean;
  auth?: string;
  health?: string;
  worker_id?: string;
  authenticated?: boolean | null;
  auth_status?: string;
  version?: string;
  message?: string;
  capabilities?: JsonObject;
}
export interface Settings {
  allowed_roots?: string[];
  telemetry_enabled?: boolean;
  langfuse_enabled?: boolean;
  runtime_ready?: boolean;
  limits?: JsonObject;
  [key: string]: Json | undefined;
}
export const defaultLimits: JsonObject = {
  max_parallel_agents: 3,
  max_tasks_per_plan: 12,
  max_retries: 2,
  max_execution_minutes: 30,
  max_run_minutes: 180,
  max_output_bytes: 20971520,
  max_disk_bytes: 5368709120,
};
