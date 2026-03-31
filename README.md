# cmux-worktree

A workspace provider for [cmux](https://github.com/manaflow-ai/cmux) that creates workspaces from a YAML project config — with git worktree support, workflows, split panes, and suspended tabs.

## Setup

1. Install dependencies:

```bash
cd ~/workspace/cmux-worktree
bun install
```

2. Create a config file at `~/.config/cmux-worktree/projects.yml` (see examples below).

3. Add the provider to `~/.config/cmux/cmux.json`:

```json
{
  "workspace_providers": [
    {
      "id": "cmux-worktree",
      "name": "Projects",
      "list": "/path/to/bun run /path/to/cmux-worktree/src/cli.ts list",
      "create": "/path/to/bun run /path/to/cmux-worktree/src/cli.ts create",
      "destroy": "/path/to/bun run /path/to/cmux-worktree/src/cli.ts destroy"
    }
  ]
}
```

> **Note:** Use the full path to `bun` (e.g. from `which bun`) since the app may not have your shell's PATH.

4. Click the "+" button in cmux's titlebar to see your projects.

## Config Reference

### Simple project (no worktree)

Opens a workspace at the project directory with configured tabs.

```yaml
projects:
  - id: my-app
    name: My App
    path: ~/workspace/my-app
    color: "#3498DB"
    tabs:
      - name: Shell
      - name: Dev
        command: bun run dev
      - name: Browser
        type: browser
        url: http://localhost:3000
```

### Worktree project

Creates git worktrees in `~/.cmux/workspaces/<project-id>/<branch>/`. Prompts for a session name and auto-generates the branch name.

```yaml
projects:
  - id: my-app
    name: My App
    path: ~/workspace/my-app
    worktree: true
    setup: bun install
    tabs:
      - name: Shell
      - name: Git
        command: lazygit
        suspended: true
```

### Workflows

Different creation flows per project. Each workflow can have its own inputs and setup script (runs after the base `setup`).

```yaml
projects:
  - id: my-app
    name: My App
    path: ~/workspace/my-app
    worktree: true
    setup: bun install
    workflows:
      - name: Blank

      - name: From PR
        branch_from: pr_url
        inputs:
          - id: pr_url
            label: PR URL
            required: true
        setup: echo "Checking out PR..."

      - name: Dev Session
        setup: bun run db:migrate
    tabs:
      - name: Shell
      - name: Git
        command: lazygit
        suspended: true
```

This shows three items in the "+" menu:
- **My App — Blank** → prompts for session name → creates worktree → runs base setup
- **My App — From PR** → prompts for PR URL → extracts branch via `gh` CLI → creates worktree → runs base setup + workflow setup
- **My App — Dev Session** → prompts for session name → creates worktree → runs base setup + workflow setup

### Split pane layout

Matches cmux's JSON layout schema. Use `layout` instead of `tabs` for split panes.

```yaml
projects:
  - id: my-app
    name: My App
    path: ~/workspace/my-app
    worktree: true
    setup: bun install
    layout:
      direction: horizontal
      split: 0.6
      children:
        - pane:
            surfaces:
              - name: Shell
              - name: Git
                command: lazygit
                suspended: true
        - pane:
            surfaces:
              - name: Dev
                command: bun run dev
                suspended: true
```

## Full config schema

### Project

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique project ID |
| `name` | string | Display name |
| `path` | string | Project directory (supports `~/`) |
| `color` | string? | Workspace color hex (e.g. `"#3498DB"`) |
| `worktree` | bool? | Enable git worktree mode |
| `setup` | string? | Base setup command (runs after worktree creation) |
| `workflows` | array? | Workflow definitions (worktree projects only) |
| `tabs` | array? | Shorthand: surfaces as tabs in a single pane |
| `layout` | object? | Full layout with splits (takes precedence over `tabs`) |

### Workflow

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Workflow name (shown in "+" menu) |
| `branch_from` | string? | `"session"` (default) or `"pr_url"` |
| `inputs` | array? | Additional input fields |
| `setup` | string? | Extra setup command (runs after base setup) |

### Surface

| Field | Type | Description |
|-------|------|-------------|
| `type` | string? | `"terminal"` (default) or `"browser"` |
| `name` | string? | Tab name |
| `command` | string? | Command to run (terminal only) |
| `url` | string? | URL to load (browser only) |
| `cwd` | string? | Working directory override |
| `env` | object? | Per-surface environment variables |
| `focus` | bool? | Focus this surface on creation |
| `suspended` | bool? | Show "Press Enter to run" prompt instead of auto-executing |

### Layout node

| Field | Type | Description |
|-------|------|-------------|
| `pane` | object? | Pane with `surfaces` array |
| `direction` | string? | `"horizontal"` or `"vertical"` |
| `split` | number? | Split position 0.0–1.0 (default 0.5) |
| `children` | array? | Exactly 2 child layout nodes |

## Environment variables

Provider workspaces set these env vars on all terminals:

| Variable | Description |
|----------|-------------|
| `CMUX_PROVIDER_PROJECT` | Project ID |
| `CMUX_PROVIDER_WORKFLOW` | Workflow name (or "default") |
| `CMUX_PROVIDER_SESSION` | Session name |
| `CMUX_PROVIDER_BRANCH` | Branch name |
| `CMUX_PROVIDER_INPUT_*` | Custom workflow inputs (e.g. `CMUX_PROVIDER_INPUT_PR_URL`) |

## Workspace lifecycle

- **Create**: "+" menu → select project/workflow → enter inputs → setup runs in live terminal → layout applied on success
- **Stop**: Right-click → "Stop" suspends the workspace (tears down terminals, dims in sidebar). Click to re-activate.
- **Delete**: Right-click → "Delete" calls the destroy command (removes git worktree) and closes the workspace.
- **Session restore**: Provider workspaces restore as suspended (dimmed). Click to activate.

## CLI

```bash
# List projects
bun run src/cli.ts list

# Create workspace (writes JSON to $CMUX_PROVIDER_OUTPUT)
CMUX_PROVIDER_OUTPUT=/tmp/out.json bun run src/cli.ts create --id my-app::blank --input session=feature-x

# Destroy workspace (removes worktree)
bun run src/cli.ts destroy --id my-app::blank --cwd /path/to/worktree
```
