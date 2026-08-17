#!/usr/bin/env bash
# Registers Classicomp in the desktop app menu (user-local, no root needed).
# Re-run after moving the project directory.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
electron_bin="$project_root/node_modules/electron/dist/electron"

if [[ ! -x "$electron_bin" ]]; then
  echo "Electron binary not found — run 'npm install' first." >&2
  exit 1
fi

icon_dir="$HOME/.local/share/icons/hicolor/512x512/apps"
apps_dir="$HOME/.local/share/applications"
mkdir -p "$icon_dir" "$apps_dir"

cp "$project_root/electron/icon.png" "$icon_dir/classicomp.png"

cat > "$apps_dir/classicomp.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Classicomp
Comment=Classic recomp store and launcher
Exec=$electron_bin $project_root
Icon=classicomp
Terminal=false
Categories=Game;
StartupWMClass=Classicomp
EOF

update-desktop-database "$apps_dir" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "Installed: $apps_dir/classicomp.desktop"
