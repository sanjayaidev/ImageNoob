#!/bin/bash
# Double-click this file on a Mac (or run ./start.command on Linux).
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo " Node.js is not installed yet."
  echo " 1. Go to https://nodejs.org"
  echo " 2. Download and install the LTS version"
  echo " 3. Run this file again"
  echo
  open https://nodejs.org 2>/dev/null || xdg-open https://nodejs.org 2>/dev/null
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Setting things up for the first time - this takes about a minute..."
  npm install --no-audit --no-fund || { echo "Install failed. Check your internet and try again."; read -n 1 -s -r; exit 1; }
fi

AUTO_OPEN=1 node server.js
