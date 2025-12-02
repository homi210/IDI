#!/usr/bin/env bash
# start-server.sh - wrapper script to ensure environment and start the demo server
# Safe for being invoked by macOS launchd (LaunchAgent)

# Set working directory
cd /Users/30lin_h/Desktop/Bank || exit 1

# Ensure logs dir exists
mkdir -p ./logs

# Use the absolute path to node installed by Homebrew to avoid PATH issues with launchd
NODE_PATH="/opt/homebrew/bin/node"
if [ ! -x "$NODE_PATH" ]; then
  # fall back to system node if present
  NODE_PATH="$(command -v node)"
fi

# Final command: run node against server.js
exec "$NODE_PATH" server.js >> ./logs/server.out.log 2>> ./logs/server.err.log
