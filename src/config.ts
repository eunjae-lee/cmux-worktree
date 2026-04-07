import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

export interface SurfaceDefinition {
  type?: "terminal" | "browser"; // default: "terminal"
  name?: string;
  command?: string;
  url?: string;
  cwd?: string;
  env?: Record<string, string>;
  focus?: boolean;
  suspended?: boolean;
  wait_for?: string; // shell command that must exit 0 before browser loads URL
  log_to?: string; // file path to log terminal output in real time
}

export interface LayoutNode {
  // Pane node: has surfaces
  pane?: { surfaces: SurfaceDefinition[] };
  // Split node: has direction + children
  direction?: "horizontal" | "vertical";
  split?: number; // 0.0-1.0, default 0.5
  children?: LayoutNode[];
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
  cleanup?: string; // cleanup command run on destroy (e.g. drop database)
  workflows?: WorkflowDefinition[];
  // Shorthand: flat list of surfaces as tabs in a single pane
  tabs?: SurfaceDefinition[];
  // Full layout: matches cmux's JSON layout schema
  layout?: LayoutNode;
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
