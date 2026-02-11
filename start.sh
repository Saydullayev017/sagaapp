#!/bin/bash
pkill -9 -f "electron" 2>/dev/null
sleep 2

# Start dev server
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!

# Wait for server
echo "Waiting for dev server..."
sleep 8

# Start Electron with visible window
ELECTRON_ENABLE_LOGGING=1 ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . &

echo "Electron started! Check your Dock for Electron icon."
echo "If window doesn't appear, click on Electron icon in Dock."
