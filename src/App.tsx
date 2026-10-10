import { Background, Controls, ReactFlow, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
const names = ['Plan', 'Approve scope', 'Execute in worktree', 'Test and review', 'Integrate branch'];
const nodes: Node[] = names.map((label, index) => ({ id: String(index), position: { x: index * 220, y: 50 }, data: { label } }));
const edges: Edge[] = names.slice(1).map((_, index) => ({ id: `e${index}`, source: String(index), target: String(index + 1) }));
export default function App() {
  return <main><p className="eyebrow">AI DEVELOPMENT FACTORY</p><h1>From a goal to reviewed commits.</h1>
    <p className="intro">A local factory for parallel coding agents, bounded autonomy and durable workflows.</p>
    <p className="status" role="status">Design foundation · live execution is not implemented</p>
    <section aria-labelledby="flow-title"><h2 id="flow-title">Intended workflow</h2><p>This read-only diagram illustrates the design. It does not start agents.</p>
      <div className="flow"><ReactFlow nodes={nodes} edges={edges} nodesDraggable={false} nodesConnectable={false} fitView><Background /><Controls /></ReactFlow></div></section>
    <section className="cards" aria-label="Architecture boundaries"><article><h2>Control</h2><p>React UI, FastAPI API and versioned LangGraph orchestration.</p></article><article><h2>Execution</h2><p>A WSL2 host worker with a separate Git worktree for every writer.</p></article><article><h2>Evidence</h2><p>Tests, independent review, integration results and redacted trace links.</p></article></section>
    <p>Read the umbrella README and docs/README.md in your checkout for contracts, acceptance criteria and the implementation backlog.</p></main>;
}
