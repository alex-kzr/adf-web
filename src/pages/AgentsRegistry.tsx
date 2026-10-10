import { useState } from 'react';
import { useCommand, useList, useRecord } from '../hooks';
import type { Agent, JsonObject, ProviderHealth, RegistryEntry, Settings } from '../models';
import { defaultLimits } from '../models';
import {
  ActionForm,
  Badge,
  Button,
  Empty,
  Field,
  Icon,
  JsonView,
  LoadMore,
  Modal,
  PageTitle,
  QueryState,
  shortId,
  tabKeyboard,
  text,
} from '../ui';
import { parseObject } from '../workflow';

const roles = ['Planner', 'Architect', 'Developer', 'Tester', 'Reviewer', 'Integrator'];
const limitFields = [
  { key: 'max_parallel_agents', label: 'Parallel agents', max: 3 },
  { key: 'max_tasks_per_plan', label: 'Tasks per plan', max: 12 },
  { key: 'max_retries', label: 'Retries after first attempt', max: 2 },
  { key: 'max_execution_minutes', label: 'Execution minutes', max: 30 },
  { key: 'max_run_minutes', label: 'Run minutes', max: 180 },
  { key: 'max_output_bytes', label: 'Output bytes', max: 20971520 },
  { key: 'max_disk_bytes', label: 'Disk bytes per run', max: 5368709120 },
  { key: 'max_steps', label: 'CLI steps (when measurable)', max: 1000 },
];
export function LimitInputs({ limits = defaultLimits }: { limits?: JsonObject }) {
  return (
    <div className="form-grid">
      {limitFields.map((field) => (
        <Field key={field.key} label={field.label}>
          <input
            name={field.key}
            type="number"
            min={field.key === 'max_retries' ? 0 : 1}
            max={field.max}
            required
            defaultValue={Number(
              limits[field.key] ?? (field.key === 'max_steps' ? 100 : field.max),
            )}
          />
        </Field>
      ))}
    </div>
  );
}
const readLimits = (data: FormData): JsonObject =>
  Object.fromEntries(limitFields.map((field) => [field.key, Number(text(data, field.key))]));
export function Agents() {
  const agents = useList<Agent>('agents');
  const skills = useList<RegistryEntry>('skills');
  const tools = useList<RegistryEntry>('tools');
  const mcp = useList<RegistryEntry>('mcp-servers');
  const health = useRecord<
    { items?: ProviderHealth[]; providers?: ProviderHealth[] } | ProviderHealth[]
  >('/api/providers/health');
  const command = useCommand();
  const [editing, setEditing] = useState<Agent | 'new' | null>(null);
  const current = editing && editing !== 'new' ? editing : undefined;
  const providerRows = Array.isArray(health.data)
    ? health.data
    : (health.data?.items ?? health.data?.providers ?? []);
  const providers: ProviderHealth[] = providerRows.flatMap((row) => {
    const worker = row as unknown as {
      worker_id?: string;
      online?: boolean;
      capabilities?: { providers?: Record<string, ProviderHealth> };
    };
    return worker.capabilities?.providers
      ? Object.entries(worker.capabilities.providers).map(([provider, status]) => ({
          ...status,
          provider,
          worker_id: worker.worker_id,
          health: worker.online === false ? 'worker offline' : status.health,
        }))
      : [row];
  });
  const assignments = (
    name: string,
    label: string,
    records: RegistryEntry[],
    selected: string[] = [],
  ) => (
    <Field label={label} hint="Immutable trusted registry versions are pinned by each run.">
      <select
        name={name}
        multiple
        size={Math.max(2, Math.min(4, records.length))}
        defaultValue={selected}
      >
        {records.map((record) => (
          <option value={record.id} key={record.id}>
            {record.name} · v{record.version ?? record.revision}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <>
      <PageTitle
        eyebrow="Agent configuration"
        title="Specialists with bounded scope"
        description="Versioned roles, prompts, CLI providers and trusted capabilities. Changes never alter an active run."
        action={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" />
            Create agent
          </Button>
        }
      />
      {health.error ? (
        <div className="notice error">
          Provider health unavailable. Refresh or run the host worker doctor.
        </div>
      ) : (
        <div className="provider-grid">
          {providers.map((provider) => (
            <article
              className="provider-card"
              key={`${provider.worker_id ?? 'host'}-${provider.provider}`}
            >
              <div className="row">
                <strong>{provider.provider}</strong>
                <Badge
                  value={
                    provider.authenticated === true
                      ? 'authenticated'
                      : (provider.health ??
                        provider.auth_status ??
                        (provider.installed || provider.available ? 'available' : 'unavailable'))
                  }
                />
              </div>
              <span className="mono muted">
                {provider.version ?? 'version unknown'} · auth {provider.auth ?? 'unknown'}
              </span>
              {provider.message && <p>{provider.message}</p>}
            </article>
          ))}
        </div>
      )}
      <QueryState
        pending={agents.isPending}
        error={agents.error}
        retry={() => void agents.refetch()}
      >
        {!agents.data?.items.length ? (
          <Empty title="Add your first specialist">
            Create a Planner and Developer, then an independent Reviewer to evaluate the exact
            candidate tree.
          </Empty>
        ) : (
          <div className="agent-grid">
            {agents.data.items.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <div className="row">
                  <span className="avatar">
                    <Icon name="agents" size={24} />
                  </span>
                  <Badge value={agent.provider} />
                </div>
                <h2>{agent.name}</h2>
                <p>
                  {agent.role} · {agent.model ?? 'CLI default model'}
                </p>
                <div className="agent-prompt">
                  {agent.prompt || 'No additional prompt configured.'}
                </div>
                <div className="checks">
                  <span className="tag">{agent.permission_profile}</span>
                  <span className="tag">{agent.skill_ids.length} skills</span>
                  <span className="tag">{agent.tool_ids.length} tools</span>
                  <span className="tag">{agent.mcp_server_ids.length} MCP</span>
                </div>
                <div className="row">
                  <small className="muted mono">Config {shortId(agent.config_hash)}</small>
                  <Button onClick={() => setEditing(agent)}>Edit new version</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </QueryState>
      <LoadMore query={agents} />
      {editing && (
        <Modal
          title={current ? `Edit ${current.name}` : 'Create agent'}
          description="Provider permissions are enforced by the host adapter. Unsupported capabilities fail closed."
          close={() => setEditing(null)}
        >
          <ActionForm
            label={current ? 'Create config version' : 'Create agent'}
            cancel={() => setEditing(null)}
            submit={async (data) => {
              await command.mutateAsync({
                path: current ? `/api/agents/${current.id}` : '/api/agents',
                method: current ? 'PATCH' : 'POST',
                revision: current?.revision,
                body: {
                  name: text(data, 'name'),
                  role: text(data, 'role'),
                  provider: text(data, 'provider'),
                  model: text(data, 'model') || null,
                  prompt: text(data, 'prompt'),
                  permission_profile: text(data, 'permission_profile'),
                  skill_ids: data.getAll('skills').map(String),
                  tool_ids: data.getAll('tools').map(String),
                  mcp_server_ids: data.getAll('mcp').map(String),
                  limits: readLimits(data),
                },
              });
              setEditing(null);
            }}
          >
            <div className="form-grid">
              <Field label="Agent name">
                <input name="name" required defaultValue={current?.name} />
              </Field>
              <Field label="Role">
                <select name="role" defaultValue={current?.role ?? 'Developer'}>
                  {roles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </Field>
              <Field label="CLI provider">
                <select name="provider" defaultValue={current?.provider ?? 'codex'}>
                  <option value="codex">Codex</option>
                  <option value="claude">Claude Code</option>
                  <option value="mock">Mock (test execution)</option>
                </select>
              </Field>
              <Field label="Model (optional)">
                <input
                  name="model"
                  defaultValue={current?.model ?? ''}
                  placeholder="Use CLI configured default"
                />
              </Field>
            </div>
            <Field label="Versioned system prompt">
              <textarea
                name="prompt"
                rows={6}
                defaultValue={current?.prompt}
                placeholder="Describe the role, criteria and expected evidence. No prompt can grant new permissions."
              />
            </Field>
            <Field label="Permission profile">
              <select
                name="permission_profile"
                defaultValue={current?.permission_profile ?? 'observe'}
              >
                <option value="observe">Observe / read only</option>
                <option value="trusted-development">Trusted development (bounded writes)</option>
              </select>
            </Field>
            {assignments('skills', 'Skills', skills.data?.items ?? [], current?.skill_ids)}
            {assignments('tools', 'Typed tools', tools.data?.items ?? [], current?.tool_ids)}
            {assignments(
              'mcp',
              'MCP server definitions',
              mcp.data?.items ?? [],
              current?.mcp_server_ids,
            )}
            <h3>Execution limits</h3>
            <LimitInputs limits={current?.limits} />
            <p className="muted small">
              Subscription cost and token usage stay unknown unless the CLI reports reliable values.
            </p>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
type RegistryKind = 'skills' | 'tools' | 'mcp-servers' | 'policies';
const registryTitles: Record<RegistryKind, string> = {
  skills: 'Skills',
  tools: 'Tools',
  'mcp-servers': 'MCP servers',
  policies: 'Policies',
};
const examples: Record<RegistryKind, JsonObject> = {
  skills: {
    path: '/home/worker/ai-factory/skills/example',
    version: '1.0.0',
    hash: '',
    trusted: true,
  },
  tools: {
    id: 'read_file',
    permission: 'read',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
    timeout_sec: 30,
    provider_mappings: { claude: ['Read', 'Glob', 'Grep'], mock: [] },
  },
  'mcp-servers': {
    transport: 'stdio',
    argv: [],
    allowed_tools: [],
    trusted: true,
    timeout_sec: 30,
    scope: { roots: [] },
  },
  policies: {
    ...defaultLimits,
    allowed_write_paths: ['**'],
    allow_commit: true,
    allow_integration: true,
    trusted_repository: true,
    allowed_tools: [],
    allowed_mcp_tools: [],
    env_allowlist: [],
  },
};
export function Registry() {
  const [kind, setKind] = useState<RegistryKind>('skills');
  const records = useList<RegistryEntry>(kind);
  const command = useCommand();
  const [editing, setEditing] = useState<RegistryEntry | 'new' | null>(null);
  const [inspecting, setInspecting] = useState<RegistryEntry | null>(null);
  const current = editing && editing !== 'new' ? editing : undefined;
  return (
    <>
      <PageTitle
        eyebrow="Trusted capabilities"
        title="Registry & policies"
        description="Review immutable manifests before assigning them to agents. Credentials are references, never manifest values."
        action={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" />
            Register {kind === 'mcp-servers' ? 'MCP server' : kind.slice(0, -1)}
          </Button>
        }
      />
      <div className="tabs" role="tablist" aria-label="Registry category" onKeyDown={tabKeyboard}>
        {(Object.keys(registryTitles) as RegistryKind[]).map((type) => (
          <button
            type="button"
            key={type}
            role="tab"
            aria-selected={type === kind}
            tabIndex={type === kind ? 0 : -1}
            id={`registry-${type}-tab`}
            aria-controls="registry-panel"
            onClick={() => {
              setKind(type);
              setInspecting(null);
              setEditing(null);
            }}
          >
            {registryTitles[type]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="registry-panel" aria-labelledby={`registry-${kind}-tab`}>
        <QueryState
          pending={records.isPending}
          error={records.error}
          retry={() => void records.refetch()}
        >
          {!records.data?.items.length ? (
            <Empty title={`No ${registryTitles[kind].toLowerCase()} registered`}>
              Register a reviewed definition to make it selectable by an agent or run.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Version</th>
                    <th>Manifest hash</th>
                    <th>Scope</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.data.items.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.name}</strong>
                        <small className="muted mono">{shortId(record.id)}</small>
                      </td>
                      <td>
                        <Badge value={`v${record.version ?? record.revision}`} />
                      </td>
                      <td className="mono">
                        {shortId(record.manifest_hash ?? record.config_hash)}
                      </td>
                      <td>
                        {String(
                          record.manifest.permission ??
                            record.manifest.transport ??
                            (record.manifest.trusted_repository
                              ? 'trusted repository'
                              : (record.manifest.path ?? 'defined by manifest')),
                        )}
                      </td>
                      <td>
                        <div className="card-actions">
                          <Button onClick={() => setInspecting(record)}>Inspect</Button>
                          <Button onClick={() => setEditing(record)}>New version</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
        <LoadMore query={records} />
      </div>
      {inspecting && (
        <Modal
          title={inspecting.name}
          description={`Immutable version ${inspecting.version ?? inspecting.revision}`}
          close={() => setInspecting(null)}
        >
          <JsonView value={inspecting.manifest} />
          <p className="mono small break-all">
            {inspecting.manifest_hash ?? inspecting.config_hash}
          </p>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`${current ? 'Version' : 'Register'} ${registryTitles[kind].toLowerCase()}`}
          description="Declarative JSON is validated by the server. Do not place tokens, passwords, shell command strings or executable code here."
          close={() => setEditing(null)}
        >
          <ActionForm
            cancel={() => setEditing(null)}
            label={current ? 'Create immutable version' : 'Register definition'}
            submit={async (data) => {
              const manifest = parseObject(text(data, 'manifest'));
              await command.mutateAsync({
                path: current ? `/api/${kind}/${current.id}` : `/api/${kind}`,
                method: current ? 'PATCH' : 'POST',
                revision: current?.revision,
                body: { name: text(data, 'name'), manifest },
              });
              setEditing(null);
            }}
          >
            <Field label="Definition name">
              <input name="name" required defaultValue={current?.name} />
            </Field>
            <Field
              label="Typed manifest (JSON)"
              hint={
                kind === 'skills'
                  ? 'Use a trusted host directory and verified content hash.'
                  : kind === 'tools'
                    ? 'Declare explicit provider_mappings. Claude supports reviewed CLI identifiers; Codex 0.157 rejects a narrow assigned registry.'
                    : kind === 'mcp-servers'
                      ? 'Use a trusted executable argv array and explicit tool allowlist.'
                      : 'Bounded grants bind the exact approved run snapshot.'
              }
            >
              <textarea
                className="code-input"
                name="manifest"
                rows={14}
                required
                defaultValue={JSON.stringify(current?.manifest ?? examples[kind], null, 2)}
              />
            </Field>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const settings = useRecord<Settings>('/api/settings');
  return (
    <>
      <PageTitle
        eyebrow="Workstation policy"
        title="Settings & readiness"
        description="Server configuration and privacy boundaries for this single-user workstation."
      />
      <QueryState
        pending={settings.isPending}
        error={settings.error}
        retry={() => void settings.refetch()}
      >
        <div className="settings-grid">
          <section className="panel">
            <h2>Allowed roots</h2>
            <p className="muted">
              Target repositories and worktrees are resolved beneath these WSL ext4 roots.
            </p>
            {settings.data?.allowed_roots?.length ? (
              settings.data.allowed_roots.map((root) => (
                <div className="path setting-root" key={root}>
                  {root}
                </div>
              ))
            ) : (
              <p>No roots configured. Configure ADF_ALLOWED_ROOTS on the server.</p>
            )}
          </section>
          <section className="panel">
            <h2>Telemetry</h2>
            <dl className="details">
              <div>
                <dt>OpenTelemetry</dt>
                <dd>
                  <Badge value={settings.data?.telemetry_enabled ? 'enabled' : 'disabled'} />
                </dd>
              </div>
              <div>
                <dt>Langfuse</dt>
                <dd>
                  <Badge
                    value={
                      settings.data?.langfuse_enabled || settings.data?.langfuse_url
                        ? 'configured'
                        : 'disabled'
                    }
                  />
                </dd>
              </div>
            </dl>
            <p className="muted">
              Code, prompts, environment values and raw output are excluded from telemetry by
              default.
            </p>
          </section>
          <section className="panel">
            <h2>Runtime readiness</h2>
            <Badge value={settings.data?.runtime_ready ? 'ready' : 'pending'} />
            <p className="muted">
              Readiness requires the documented acceptance gates and live worker / CLI diagnostics.
            </p>
          </section>
          <section className="panel">
            <h2>Credentials</h2>
            <p>
              CLI authentication stays in the WSL account used by the host worker. The admin bearer
              token remains in browser memory until you lock or reload.
            </p>
            <p className="muted">
              Use server secret-file references and host CLI login commands. No credential editor is
              provided.
            </p>
          </section>
        </div>
        <details className="panel advanced">
          <summary>Server configuration snapshot</summary>
          <JsonView value={settings.data} />
        </details>
      </QueryState>
    </>
  );
}
