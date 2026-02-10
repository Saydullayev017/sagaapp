#!/bin/bash

# Kill existing processes
pkill -9 -f "electron" 2>/dev/null
pkill -9 -f "electron-vite" 2>/dev/null
sleep 1

# Start dev server in background
echo "Starting dev server..."
npm run dev > /tmp/electron-dev.log 2>&1 &
DEV_PID=$!

# Wait for dev server
sleep 5

# Get the port from log
PORT=$(grep -o "localhost:[0-9]*" /tmp/electron-dev.log | head -1 | cut -d: -f2)
if [ -z "$PORT" ]; then
    PORT=5173
fi

echo "Dev server running on port $PORT"

# Start Electron manually
echo "Starting Electron..."
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --remote-debugging-port=9223 &

wait $DEV_PID
