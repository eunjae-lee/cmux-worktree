#!/usr/bin/env bun
import { list } from "./list";
import { create } from "./create";
import { destroy } from "./destroy";

function parseArgs(args: string[]): {
  command: string;
  id?: string;
  cwd?: string;
  inputs: Record<string, string>;
} {
  const command = args[0];
  let id: string | undefined;
  let cwd: string | undefined;
  const inputs: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--id" && args[i + 1]) {
      id = args[i + 1];
      i++;
    } else if (args[i] === "--cwd" && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === "--input" && args[i + 1]) {
      const [key, ...rest] = args[i + 1].split("=");
      inputs[key] = rest.join("=");
      i++;
    }
  }

  return { command, id, cwd, inputs };
}

const args = process.argv.slice(2);
const { command, id, cwd, inputs } = parseArgs(args);

try {
  switch (command) {
    case "list": {
      const result = list();
      console.log(JSON.stringify(result));
      break;
    }
    case "create": {
      if (!id) {
        console.error("--id is required");
        process.exit(1);
      }
      create(id, inputs);
      break;
    }
    case "destroy": {
      if (!id) {
        console.error("--id is required");
        process.exit(1);
      }
      destroy(id, inputs, cwd);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error(
        "Usage: cmux-worktree <list|create|destroy> [--id <id>] [--input key=value] [--cwd <path>]"
      );
      process.exit(1);
  }
} catch (err: any) {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
}
