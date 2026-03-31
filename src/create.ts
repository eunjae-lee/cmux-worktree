import {
  loadConfig,
  type ProjectDefinition,
  type TabDefinition,
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

function createWorktree(
  project: ProjectDefinition,
  branch: string,
  session: string
): WorkspaceDefinition {
  const repoPath = project.path;
  const worktreeBase = resolve(homedir(), ".cmux", "workspaces", project.id, branch);
  const worktreePath = worktreeBase;

  if (existsSync(worktreePath)) {
    // Worktree already exists — just open it
    progress(`Worktree already exists at ${worktreePath}`);
  } else {
    progress(`Creating worktree "${branch}"...`);

    // Check if branch exists remotely or locally
    let branchExists = false;
    try {
      execSync(`git -C ${shellEscape(repoPath)} rev-parse --verify ${shellEscape(branch)} 2>/dev/null`, {
        stdio: "pipe",
      });
      branchExists = true;
    } catch {
      // branch doesn't exist locally, check remote
      try {
        execSync(
          `git -C ${shellEscape(repoPath)} rev-parse --verify origin/${shellEscape(branch)} 2>/dev/null`,
          { stdio: "pipe" }
        );
        branchExists = true;
      } catch {
        // branch doesn't exist anywhere — will create new
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

    // Run setup command if configured
    if (project.setup) {
      progress(`Running setup...`);
      const result = Bun.spawnSync(["bash", "-c", project.setup], {
        cwd: worktreePath,
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
        throw new Error(`Setup failed: ${stderr || `exit code ${result.exitCode}`}`);
      }
    }
  }

  const title = `${session} · ${project.name}`;
  const result: WorkspaceDefinition = {
    title,
    cwd: worktreePath,
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

export function create(
  projectId: string,
  inputs: Record<string, string>
): WorkspaceDefinition {
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (project.worktree) {
    const session = inputs.session;
    if (!session) {
      throw new Error("Session name is required for worktree projects");
    }
    const branch = inputs.branch?.trim() || slugify(session);
    return createWorktree(project, branch, session);
  }

  return createSimple(project);
}
