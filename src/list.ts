import { loadConfig, type WorkflowDefinition } from "./config";

interface ProviderInput {
  id: string;
  label: string;
  placeholder?: string;
  required: boolean;
  deriveFrom?: string;
}

interface ProviderItem {
  id: string;
  name: string;
  subtitle: string;
  inputs?: ProviderInput[];
}

function workflowInputs(workflow: WorkflowDefinition): ProviderInput[] {
  const inputs: ProviderInput[] = [];

  const branchFrom = workflow.branch_from || "session";

  if (branchFrom === "pr_url") {
    // PR-based: ask for PR URL, derive branch from it
    const prInput = workflow.inputs?.find((i) => i.id === "pr_url");
    inputs.push({
      id: "pr_url",
      label: prInput?.label || "PR URL",
      placeholder: prInput?.placeholder || "e.g. https://github.com/org/repo/pull/123",
      required: true,
    });
  } else {
    // Session-based (default): ask for session name, derive branch
    inputs.push({
      id: "session",
      label: "Session Name",
      placeholder: "e.g. fix login bug",
      required: true,
    });
    inputs.push({
      id: "branch",
      label: "Branch Name",
      placeholder: "auto-generated from session name",
      required: false,
      deriveFrom: "session",
    });
  }

  // Add any additional custom inputs from the workflow
  if (workflow.inputs) {
    for (const input of workflow.inputs) {
      // Skip pr_url if already added
      if (input.id === "pr_url" && branchFrom === "pr_url") continue;
      inputs.push({
        id: input.id,
        label: input.label,
        placeholder: input.placeholder,
        required: input.required ?? false,
      });
    }
  }

  return inputs;
}

export function list() {
  const config = loadConfig();
  const items: ProviderItem[] = [];

  for (const project of config.projects) {
    if (!project.worktree) {
      // Simple project — no workflows
      items.push({
        id: project.id,
        name: project.name,
        subtitle: project.path.replace(process.env.HOME || "", "~"),
      });
      continue;
    }

    const workflows = project.workflows?.length
      ? project.workflows
      : [{ name: "Blank" }]; // default workflow if none defined

    for (const workflow of workflows) {
      const itemId = `${project.id}::${slugify(workflow.name)}`;
      items.push({
        id: itemId,
        name: `${project.name} — ${workflow.name}`,
        subtitle: project.path.replace(process.env.HOME || "", "~"),
        inputs: workflowInputs(workflow),
      });
    }
  }

  return { items };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
