#!/bin/sh
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run this again."
  exit 1
fi

echo "AI Engine is starting at http://localhost:3000 (press Ctrl+C to stop)"
( sleep 2; (open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1 ) &
node server.js
