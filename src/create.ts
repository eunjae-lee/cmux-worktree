import {
  loadConfig,
  type ProjectDefinition,
  type SurfaceDefinition,
  type LayoutNode as ConfigLayoutNode,
  type WorkflowDefinition,
} from "./config";
import { execSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
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
  wait_for?: string;
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
  if (surface.wait_for) out.wait_for = surface.wait_for;
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
  return { pane: { surfaces: [{ type: "terminal" }] } };
}

function projectLayout(
  project: ProjectDefinition
): OutputLayoutNode | undefined {
  if (project.layout) {
    return buildLayout(project.layout);
  }
  if (project.tabs && project.tabs.length > 0) {
    return {
      pane: {
        surfaces: project.tabs.map(buildSurface),
      },
    };
  }
  return undefined;
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
    console.log("Fetching branch from PR...");
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
    console.log(`Worktree already exists at ${worktreePath}`);
  } else {
    console.log(`Creating worktree "${branch}"...`);

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
        { stdio: "inherit" }
      );
    } else {
      execSync(
        `git -C ${shellEscape(repoPath)} worktree add -b ${shellEscape(branch)} ${shellEscape(worktreePath)}`,
        { stdio: "inherit" }
      );
    }
  }

  // Run base setup
  if (project.setup) {
    console.log(`\n▶ Running base setup...`);
    execSync(project.setup, { cwd: worktreePath, stdio: "inherit" });
  }

  // Run workflow setup
  if (workflow?.setup) {
    console.log(`\n▶ Running workflow setup...`);
    execSync(workflow.setup, { cwd: worktreePath, stdio: "inherit" });
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
): void {
  const [projectId, workflowSlug] = itemId.split("::");
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  let result: WorkspaceDefinition;

  if (project.worktree) {
    let workflow: WorkflowDefinition | undefined;
    if (workflowSlug && project.workflows) {
      workflow = project.workflows.find(
        (w) => slugify(w.name) === workflowSlug
      );
    }
    const { branch, session } = resolveBranch(workflow, inputs);
    result = createWorktree(project, workflow, branch, session, inputs);
  } else {
    result = createSimple(project);
  }

  // Write result to CMUX_PROVIDER_OUTPUT if set, otherwise stdout
  const outputPath = process.env.CMUX_PROVIDER_OUTPUT;
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(result));
    console.log(`\n✅ Setup complete`);
  } else {
    // Fallback for testing: output to stdout
    console.log(JSON.stringify(result));
  }
}
