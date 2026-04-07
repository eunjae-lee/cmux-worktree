import { loadConfig } from "./config";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

export function destroy(
  itemId: string,
  inputs: Record<string, string>,
  cwd?: string
) {
  const [projectId] = itemId.split("::");
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    return;
  }

  if (!project.worktree) {
    return;
  }

  const branch = inputs.branch || inputs.session;
  if (!branch && !cwd) {
    console.error(
      "Cannot determine worktree path: no branch/session input and no cwd"
    );
    return;
  }

  const worktreePath =
    cwd || resolve(homedir(), ".cmux", "workspaces", project.id, branch);

  if (!existsSync(worktreePath)) {
    console.error(`Worktree path does not exist: ${worktreePath}`);
    return;
  }

  // Run project cleanup command if configured (e.g. drop database)
  if (project.cleanup) {
    try {
      console.log(`Running cleanup...`);
      execSync(project.cleanup, {
        cwd: worktreePath,
        stdio: "inherit",
        env: {
          ...process.env,
          CMUX_PROVIDER_PROJECT: project.id,
          CMUX_PROVIDER_BRANCH: branch || "",
          CMUX_PROVIDER_SESSION: inputs.session || "",
        },
      });
    } catch (err: any) {
      console.error(`Cleanup failed: ${err.message}`);
      // Continue with worktree removal even if cleanup fails
    }
  }

  // Remove the worktree
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
