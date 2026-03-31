import {
  loadConfig,
  type ProjectDefinition,
  type SurfaceDefinition,
  type LayoutNode as ConfigLayoutNode,
  type WorkflowDefinition,
} from "./config";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

// Output types matching cmux's JSON schema exactly

interface OutputSurface {
  type: "terminal" | "browser";
  name?: string;
  command?: string;
  url?: string;
  cwd?: string;
  env?: Record<string, string>;
  focus?: boolean;
  suspended?: boolean;
}

interface OutputLayoutNode {
  pane?: { surfaces: OutputSurface[] };
  direction?: "horizontal" | "vertical";
  split?: number;
  children?: OutputLayoutNode[];
}

interface WorkspaceDefinition {
  title: string;
  cwd: string;
  color?: string;
  env?: Record<string, string>;
  layout?: OutputLayoutNode;
}

function buildSurface(surface: SurfaceDefinition): OutputSurface {
  const type = surface.type || "terminal";
  const out: OutputSurface = { type };
  if (surface.name) out.name = surface.name;
  if (surface.command) out.command = surface.command;
  if (surface.url) out.url = surface.url;
  if (surface.cwd) out.cwd = surface.cwd;
  if (surface.env) out.env = surface.env;
  if (surface.focus) out.focus = true;
  if (surface.suspended) out.suspended = true;
  return out;
}

function buildLayout(node: ConfigLayoutNode): OutputLayoutNode {
  if (node.pane) {
    return {
      pane: {
        surfaces: node.pane.surfaces.map(buildSurface),
      },
    };
  }
  if (node.direction && node.children) {
    const out: OutputLayoutNode = {
      direction: node.direction,
      children: node.children.map(buildLayout),
    };
    if (node.split != null) out.split = node.split;
    return out;
  }
  // Fallback: empty pane
  return { pane: { surfaces: [{ type: "terminal" }] } };
}

function projectLayout(project: ProjectDefinition): OutputLayoutNode | undefined {
  // Full layout takes precedence
  if (project.layout) {
    return buildLayout(project.layout);
  }
  // Shorthand: tabs → single pane
  if (project.tabs && project.tabs.length > 0) {
    return {
      pane: {
        surfaces: project.tabs.map(buildSurface),
      },
    };
  }
  return undefined;
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
    progress("Fetching branch from PR...");
    const branch = branchFromPrUrl(prUrl);
    return { branch, session: branch };
  }

  const session = inputs.session;
  if (!session) throw new Error("Session name is required");
  const branch = inputs.branch?.trim() || slugify(session);
  return { branch, session };
}

function createWorktree(
  project: ProjectDefinition,
  workflow: WorkflowDefinition | undefined,
  branch: string,
  session: string,
  inputs: Record<string, string>
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
      CMUX_PROVIDER_PROJECT: project.id,
      CMUX_PROVIDER_WORKFLOW: workflow?.name ?? "default",
      CMUX_PROVIDER_SESSION: session,
      CMUX_PROVIDER_BRANCH: branch,
      ...Object.fromEntries(
        Object.entries(inputs)
          .filter(([k]) => k !== "session" && k !== "branch")
          .map(([k, v]) => [`CMUX_PROVIDER_INPUT_${k.toUpperCase()}`, v])
      ),
    },
  };

  if (project.color) {
    result.color = project.color;
  }

  const layout = projectLayout(project);
  if (layout) {
    result.layout = layout;
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

  const layout = projectLayout(project);
  if (layout) {
    result.layout = layout;
  }

  return result;
}

export function create(
  itemId: string,
  inputs: Record<string, string>
): WorkspaceDefinition {
  const [projectId, workflowSlug] = itemId.split("::");
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.worktree) {
    return createSimple(project);
  }

  let workflow: WorkflowDefinition | undefined;
  if (workflowSlug && project.workflows) {
    workflow = project.workflows.find((w) => slugify(w.name) === workflowSlug);
  }

  const { branch, session } = resolveBranch(workflow, inputs);
  return createWorktree(project, workflow, branch, session, inputs);
}
