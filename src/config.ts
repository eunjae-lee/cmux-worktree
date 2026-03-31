import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

export interface TabDefinition {
  name: string;
  command?: string;
  type?: "terminal" | "browser";
  url?: string;
  suspended?: boolean;
}

export interface WorkflowInput {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface WorkflowDefinition {
  name: string;
  branch_from?: string; // "pr_url" or "session" (default: "session")
  inputs?: WorkflowInput[];
  setup?: string; // additional setup on top of project base setup
}

export interface ProjectDefinition {
  id: string;
  name: string;
  path: string;
  color?: string;
  worktree?: boolean;
  setup?: string; // base setup command, always runs for worktree projects
  workflows?: WorkflowDefinition[];
  tabs?: TabDefinition[];
}

export interface Config {
  projects: ProjectDefinition[];
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return resolve(homedir(), p.slice(2));
  }
  return p;
}

const CONFIG_PATHS = [
  "~/.config/cmux-worktree/projects.yml",
  "~/.config/cmux-worktree/projects.yaml",
];

export function loadConfig(): Config {
  for (const configPath of CONFIG_PATHS) {
    const resolved = expandHome(configPath);
    if (existsSync(resolved)) {
      const raw = readFileSync(resolved, "utf-8");
      const parsed = parse(raw) as Config;
      // Expand ~ in project paths
      if (parsed.projects) {
        for (const project of parsed.projects) {
          project.path = expandHome(project.path);
        }
      }
      return parsed;
    }
  }
  return { projects: [] };
}
