import {
  loadConfig,
  type ProjectDefinition,
  type TabDefinition,
  type WorkflowDefinition,
} from "./config";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

interface Surface {
  type: "terminal" | "browser";
  name: string;
  command?: string;
  url?: string;
  suspended?: boolean;
}

interface LayoutNode {
  direction?: "horizontal" | "vertical";
  children?: LayoutNode[];
  pane?: { surfaces: Surface[] };
}

interface WorkspaceDefinition {
  title: string;
  cwd: string;
  color?: string;
  env?: Record<string, string>;
  layout?: LayoutNode;
}

function buildSurface(tab: TabDefinition): Surface {
  if (tab.type === "browser") {
    return {
      type: "browser",
      name: tab.name,
      url: tab.url || "about:blank",
    };
  }
  return {
    type: "terminal",
    name: tab.name,
    ...(tab.command ? { command: tab.command } : {}),
    ...(tab.suspended ? { suspended: true } : {}),
  };
}

function progress(msg: string) {
  console.log(`progress: ${msg}`);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Extract branch name from a GitHub PR URL using `gh` CLI */
function branchFromPrUrl(prUrl: string): string {
  try {
    const result = execSync(
      `gh pr view ${shellEscape(prUrl)} --json headRefName --jq .headRefName`,
      { stdio: "pipe" }
    );
    const branch = result.toString().trim();
    if (!branch) throw new Error("Empty branch name from gh pr view");
    return branch;
  } catch (err: any) {
    throw new Error(`Failed to get branch from PR URL: ${err.message}`);
  }
}

function resolveBranch(
  workflow: WorkflowDefinition | undefined,
  inputs: Record<string, string>
): { branch: string; session: string } {
  const branchFrom = workflow?.branch_from || "session";

  if (branchFrom === "pr_url") {
    const prUrl = inputs.pr_url;
    if (!prUrl) throw new Error("PR URL is required");
    progress(`Fetching branch from PR...`);
    const branch = branchFromPrUrl(prUrl);
    return { branch, session: branch };
  }

  // Default: session-based
  const session = inputs.session;
  if (!session) throw new Error("Session name is required");
  const branch = inputs.branch?.trim() || slugify(session);
  return { branch, session };
}

function createWorktree(
  project: ProjectDefinition,
  workflow: WorkflowDefinition | undefined,
  branch: string,
  session: string
): WorkspaceDefinition {
  const repoPath = project.path;
  const worktreePath = resolve(
    homedir(),
    ".cmux",
    "workspaces",
    project.id,
    branch
  );

  if (existsSync(worktreePath)) {
    progress(`Worktree already exists at ${worktreePath}`);
  } else {
    progress(`Creating worktree "${branch}"...`);

    // Check if branch exists
    let branchExists = false;
    try {
      execSync(
        `git -C ${shellEscape(repoPath)} rev-parse --verify ${shellEscape(branch)} 2>/dev/null`,
        { stdio: "pipe" }
      );
      branchExists = true;
    } catch {
      try {
        execSync(
          `git -C ${shellEscape(repoPath)} rev-parse --verify origin/${shellEscape(branch)} 2>/dev/null`,
          { stdio: "pipe" }
        );
        branchExists = true;
      } catch {
        // will create new branch
      }
    }

    if (branchExists) {
      execSync(
        `git -C ${shellEscape(repoPath)} worktree add ${shellEscape(worktreePath)} ${shellEscape(branch)}`,
        { stdio: "pipe" }
      );
    } else {
      execSync(
        `git -C ${shellEscape(repoPath)} worktree add -b ${shellEscape(branch)} ${shellEscape(worktreePath)}`,
        { stdio: "pipe" }
      );
    }
  }

  // Run base setup
  if (project.setup) {
    runSetup("base", project.setup, worktreePath);
  }

  // Run workflow setup
  if (workflow?.setup) {
    runSetup("workflow", workflow.setup, worktreePath);
  }

  const title = `${session} · ${project.name}`;
  const result: WorkspaceDefinition = {
    title,
    cwd: worktreePath,
    env: {
      CMUX_PROJECT: project.id,
      CMUX_WORKFLOW: workflow?.name ?? "default",
      CMUX_SESSION: session,
      CMUX_BRANCH: branch,
    },
  };

  if (project.color) {
    result.color = project.color;
  }

  if (project.tabs && project.tabs.length > 0) {
    result.layout = {
      pane: {
        surfaces: project.tabs.map(buildSurface),
      },
    };
  }

  return result;
}

function runSetup(label: string, command: string, cwd: string) {
  progress(`Running ${label} setup...`);
  const result = Bun.spawnSync(["bash", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString().trim();
  if (stdout) {
    for (const line of stdout.split("\n")) {
      if (line.trim()) progress(line.trim());
    }
  }
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(
      `${label} setup failed: ${stderr || `exit code ${result.exitCode}`}`
    );
  }
}

function createSimple(project: ProjectDefinition): WorkspaceDefinition {
  const result: WorkspaceDefinition = {
    title: project.name,
    cwd: project.path,
  };

  if (project.color) {
    result.color = project.color;
  }

  if (project.tabs && project.tabs.length > 0) {
    result.layout = {
      pane: {
        surfaces: project.tabs.map(buildSurface),
      },
    };
  }

  return result;
}

export function create(
  itemId: string,
  inputs: Record<string, string>
): WorkspaceDefinition {
  // itemId is either "projectId" or "projectId::workflowSlug"
  const [projectId, workflowSlug] = itemId.split("::");
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.worktree) {
    return createSimple(project);
  }

  // Find the workflow
  let workflow: WorkflowDefinition | undefined;
  if (workflowSlug && project.workflows) {
    workflow = project.workflows.find(
      (w) => slugify(w.name) === workflowSlug
    );
  }

  const { branch, session } = resolveBranch(workflow, inputs);
  return createWorktree(project, workflow, branch, session);
}
