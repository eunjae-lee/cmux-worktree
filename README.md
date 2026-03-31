# cmux-worktree

A workspace provider for [cmux](https://github.com/manaflow-ai/cmux) that creates workspaces from a YAML project config.

## Setup

1. Create a config file at `~/.config/cmux-worktree/projects.yml`:

```yaml
projects:
  - id: cmux
    name: cmux
    path: ~/workspace/cmux
    tabs:
      - name: Shell
      - name: Git
        command: lazygit
```

2. Add the provider to your cmux config (`~/.config/cmux/cmux.json`):

```json
{
  "workspace_providers": [
    {
      "id": "cmux-worktree",
      "name": "Projects",
      "list": "bun run ~/workspace/cmux-worktree/src/cli.ts list",
      "create": "bun run ~/workspace/cmux-worktree/src/cli.ts create"
    }
  ]
}
```

3. Click the "+" button in cmux's titlebar to see your projects.

## Config Reference

```yaml
projects:
  - id: my-project          # unique id
    name: My Project         # display name
    path: ~/workspace/proj   # project directory
    color: "#3498DB"         # optional workspace color
    tabs:                    # optional tab definitions
      - name: Shell          # tab name
      - name: Dev
        command: bun run dev # command to run in the tab
      - name: Browser
        type: browser        # browser tab
        url: http://localhost:3000
```
