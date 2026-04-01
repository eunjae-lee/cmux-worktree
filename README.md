# cmux-worktree

A workspace provider for [cmux](https://github.com/eunjae-lee/cmux) that creates workspaces from a YAML project config — with git worktree support, workflows, split panes, and suspended tabs.

## Install

```bash
brew tap eunjae-lee/cmux
brew install cmux-worktree
```

Then add the provider to `~/.config/cmux/cmux.json`:

```json
{
  "workspace_providers": [
    {
      "id": "cmux-worktree",
      "name": "Projects",
      "list": "cmux-worktree list",
      "create": "cmux-worktree create",
      "destroy": "cmux-worktree destroy",
      "isolate_browser": true
    }
  ]
}
```

> **`isolate_browser`**: when true, each workspace gets its own browser storage (cookies, localStorage). Useful for testing with different accounts per worktree.

Click the "+" button in cmux's titlebar to see your projects.

## Project Config

Create `~/.config/cmux-worktree/projects.yml`:

### Simple project

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
- **My App — Blank** → session name → worktree → base setup
- **My App — From PR** → PR URL → extracts branch via `gh` CLI → worktree → base + workflow setup
- **My App — Dev Session** → session name → worktree → base + workflow setup

### Split pane layout

Use `layout` instead of `tabs` for split panes. Matches cmux's JSON layout schema.

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

## Config Reference

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
| `setup` | string? | Extra setup (runs after base setup) |

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
| `suspended` | bool? | "Press Enter to run" prompt instead of auto-executing |

### Layout node

| Field | Type | Description |
|-------|------|-------------|
| `pane` | object? | Pane with `surfaces` array |
| `direction` | string? | `"horizontal"` or `"vertical"` |
| `split` | number? | Split position 0.0–1.0 (default 0.5) |
| `children` | array? | Exactly 2 child layout nodes |

## Environment Variables

Provider workspaces set these on all terminals:

| Variable | Description |
|----------|-------------|
| `CMUX_PROVIDER_PROJECT` | Project ID |
| `CMUX_PROVIDER_WORKFLOW` | Workflow name (or "default") |
| `CMUX_PROVIDER_SESSION` | Session name |
| `CMUX_PROVIDER_BRANCH` | Branch name |
| `CMUX_PROVIDER_INPUT_*` | Custom workflow inputs (e.g. `CMUX_PROVIDER_INPUT_PR_URL`) |

## Workspace Lifecycle

| Action | What happens |
|--------|-------------|
| **Create** | "+" menu → select project/workflow → enter inputs → setup runs in terminal → layout applied |
| **Stop** | Right-click → "Stop" suspends (tears down terminals, dims in sidebar). Click to re-activate. |
| **Delete** | Right-click → "Delete" removes git worktree and closes workspace. |
| **App restart** | Provider workspaces restore as suspended. Click to activate. |

## Development

```bash
# Install dependencies
bun install

# Run directly
bun run src/cli.ts list
bun run src/cli.ts create --id my-app::blank --input session=test

# Compile to binary
bun build src/cli.ts --compile --outfile cmux-worktree

# Install locally
./scripts/install.sh
```
