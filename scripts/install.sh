#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${1:-$HOME/.local/bin}"

cd "$PROJECT_DIR"

echo "==> Compiling..."
bun build src/cli.ts --compile --outfile cmux-worktree

echo "==> Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp cmux-worktree "$INSTALL_DIR/"
rm cmux-worktree

echo "==> Done! Installed at $INSTALL_DIR/cmux-worktree"
echo ""
echo "Update ~/.config/cmux/cmux.json to use:"
echo "  $INSTALL_DIR/cmux-worktree list"
echo "  $INSTALL_DIR/cmux-worktree create"
echo "  $INSTALL_DIR/cmux-worktree destroy"
