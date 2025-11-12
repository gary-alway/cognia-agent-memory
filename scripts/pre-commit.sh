#!/bin/bash

set -e

echo "Killing all running Cognia MCP processes..."
MCP_PIDS=$(pgrep -f "mcp-server.js" || true)
if [ -n "$MCP_PIDS" ]; then
  echo "Found MCP processes: $MCP_PIDS"
  kill -9 $MCP_PIDS
  echo "Killed all MCP processes"
else
  echo "No MCP processes running"
fi

rm -rf dist && yarn type-check && yarn lint --fix && yarn format && yarn test && yarn test:e2e && yarn build && git add . && git status

echo "Checking for remaining node processes:"
ps aux | grep -i node | grep -v grep || echo "No node processes running"
