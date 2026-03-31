import { loadConfig } from "./config";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

export function destroy(
  projectId: string,
  inputs: Record<string, string>,
  cwd?: string
) {
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    return;
  }

  if (!project.worktree) {
    // Non-worktree projects have nothing to clean up
    return;
  }

  // Determine worktree path from cwd or reconstruct from inputs
  const branch = inputs.branch || inputs.session;
  if (!branch && !cwd) {
    console.error("Cannot determine worktree path: no branch/session input and no cwd");
    return;
  }

  const worktreePath =
    cwd || resolve(homedir(), ".cmux", "workspaces", project.id, branch);

  if (!existsSync(worktreePath)) {
    console.error(`Worktree path does not exist: ${worktreePath}`);
    return;
  }

  try {
    execSync(
      `git -C ${shellEscape(project.path)} worktree remove ${shellEscape(worktreePath)} --force`,
      { stdio: "pipe" }
    );
    console.log(`Removed worktree: ${worktreePath}`);
  } catch (err: any) {
    console.error(`Failed to remove worktree: ${err.message}`);
  }
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
