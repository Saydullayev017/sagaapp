#!/bin/bash

# Kill existing Electron processes
pkill -9 -f "electron" 2>/dev/null
sleep 2

# Start dev server
npm run dev 2>&1 &

echo "🚀 Starting Japp Markdown Editor..."
echo "⏳ Wait a few seconds..."
echo ""
echo "💡 If window doesn't appear, look for Electron icon in Dock and click it"
