#!/bin/bash

# Render.com startup script for Trading Dashboard
echo "🚀 Starting Trading Dashboard on Render.com..."
echo "📍 Current directory: $(pwd)"
echo "🐍 Python version: $(python --version)"
echo "📦 Installed packages:"
pip list | head -10

# Navigate to backend directory and start the application
cd backend
echo "📂 Starting from: $(pwd)"
echo "🔥 Launching Flask-SocketIO server..."

# Set production environment
export FLASK_ENV=production

# Start the server
python stock_service.py
