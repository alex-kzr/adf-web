import { useState } from 'react';
import { useCommand } from '../hooks';
import type { JsonObject } from '../models';
import { ActionForm, Button, Field, Icon, Modal } from '../ui';
import { lines } from '../workflow';

interface PlanTaskDraft {
  id: string;
  title: string;
  description: string;
  criteria: string;
  files: string;
  dependency_ids: string[];
}
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
export function PlanEditor({
  runId,
  revision,
  plan,
  close,
}: {
  runId: string;
  revision: number;
  plan: JsonObject;
  close: () => void;
}) {
  const command = useCommand();
  const [tasks, setTasks] = useState<PlanTaskDraft[]>(() =>
    Array.isArray(plan.tasks)
      ? plan.tasks.map((raw, index) => {
          const task = (
            raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
          ) as JsonObject;
          return {
            id: String(task.id ?? index),
            title: String(task.title ?? ''),
            description: String(task.description ?? ''),
            criteria: stringList(task.acceptance_criteria).join('\n'),
            files: stringList(task.expected_files).join('\n'),
            dependency_ids: stringList(task.dependency_ids),
          };
        })
      : [],
  );
  const update = (id: string, values: Partial<PlanTaskDraft>) =>
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...values } : task)));
  return (
    <Modal
      title="Edit proposed plan"
      description="Saving creates a new immutable plan snapshot and invalidates prior approval scope. Writing executions must not have started."
      close={close}
    >
      <ActionForm
        label="Save new plan snapshot"
        cancel={close}
        submit={async () => {
          await command.mutateAsync({
            path: `/api/runs/${runId}/plan`,
            method: 'PATCH',
            revision,
            body: {
              revision,
              tasks: tasks.map((task) => ({
                id: task.id,
                title: task.title.trim(),
                description: task.description.trim(),
                acceptance_criteria: lines(task.criteria),
                expected_files: lines(task.files),
                dependency_ids: task.dependency_ids,
              })),
            },
          });
          close();
        }}
      >
        {tasks.map((task, index) => (
          <section className="plan-task-edit" key={task.id}>
            <div className="row">
              <h3>Task {index + 1}</h3>
              <Button
                variant="ghost"
                onClick={() =>
                  setTasks((current) =>
                    current
                      .filter((item) => item.id !== task.id)
                      .map((item) => ({
                        ...item,
                        dependency_ids: item.dependency_ids.filter((id) => id !== task.id),
                      })),
                  )
                }
                disabled={tasks.length <= 1}
                aria-label={`Remove task ${index + 1}`}
              >
                <Icon name="close" />
              </Button>
            </div>
            <Field label="Title">
              <input
                required
                value={task.title}
                onChange={(e) => update(task.id, { title: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={2}
                value={task.description}
                onChange={(e) => update(task.id, { description: e.target.value })}
              />
            </Field>
            <Field label="Acceptance criteria (one per line)">
              <textarea
                rows={2}
                required
                value={task.criteria}
                onChange={(e) => update(task.id, { criteria: e.target.value })}
              />
            </Field>
            <Field label="Expected files (one per line)">
              <textarea
                rows={2}
                value={task.files}
                onChange={(e) => update(task.id, { files: e.target.value })}
              />
            </Field>
            <Field label="Dependencies">
              <select
                multiple
                size={Math.min(4, Math.max(2, tasks.length - 1))}
                value={task.dependency_ids}
                onChange={(e) =>
                  update(task.id, {
                    dependency_ids: Array.from(e.target.selectedOptions, (option) => option.value),
                  })
                }
              >
                {tasks
                  .filter((item) => item.id !== task.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || item.id}
                    </option>
                  ))}
              </select>
            </Field>
          </section>
        ))}
        <Button
          disabled={tasks.length >= 12}
          onClick={() =>
            setTasks((current) => [
              ...current,
              {
                id: `task_${crypto.randomUUID()}`,
                title: '',
                description: '',
                criteria: '',
                files: '',
                dependency_ids: [],
              },
            ])
          }
        >
          <Icon name="plus" />
          Add task ({tasks.length}/12)
        </Button>
      </ActionForm>
    </Modal>
  );
}
