#!/usr/bin/env bun
import { list } from "./list";
import { create } from "./create";

function parseArgs(args: string[]): {
  command: string;
  id?: string;
  inputs: Record<string, string>;
} {
  const command = args[0];
  let id: string | undefined;
  const inputs: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--id" && args[i + 1]) {
      id = args[i + 1];
      i++;
    } else if (args[i] === "--input" && args[i + 1]) {
      const [key, ...rest] = args[i + 1].split("=");
      inputs[key] = rest.join("=");
      i++;
    }
  }

  return { command, id, inputs };
}

const args = process.argv.slice(2);
const { command, id, inputs } = parseArgs(args);

try {
  switch (command) {
    case "list": {
      const result = list();
      console.log(JSON.stringify(result));
      break;
    }
    case "create": {
      if (!id) {
        console.error('{"error":"--id is required"}');
        process.exit(1);
      }
      const result = create(id, inputs);
      console.log(JSON.stringify(result));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error(
        "Usage: cmux-worktree <list|create> [--id <project-id>] [--input key=value]"
      );
      process.exit(1);
  }
} catch (err: any) {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
}
