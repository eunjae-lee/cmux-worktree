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

export interface ProjectDefinition {
  id: string;
  name: string;
  path: string;
  color?: string;
  worktree?: boolean;
  setup?: string; // shell command to run after worktree creation (e.g. "bun install")
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
