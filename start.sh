#!/bin/bash

# MCP Ethical Hacking Framework Startup Script

echo "🚀 MCP Ethics Framework - Startup"
echo "=================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check Ollama
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama not found. Installing..."
    curl -fsSL https://ollama.ai/install.sh | sh
fi

# Check if Ollama is running
echo "🔍 Checking Ollama service..."
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "🚀 Starting Ollama..."
    ollama serve > /tmp/ollama.log 2>&1 &
    sleep 4
fi

echo "✅ Ollama running"

# Pull model if needed
echo "📦 Ensuring AI model is available..."
ollama pull thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0 2>/dev/null

# Check scanning tools
echo ""
echo "🔍 Checking security tools..."

if command -v nmap &> /dev/null; then
    echo "✅ nmap installed"
else
    echo "⚠️  nmap not found. Install with: brew install nmap"
fi

if command -v nikto &> /dev/null; then
    echo "✅ nikto installed"
else
    echo "⚠️  nikto not found. Install with: brew install nikto"
fi

# Install npm dependencies if needed
echo ""
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
    echo "✅ Dependencies installed"
fi

# Start server
echo ""
echo "=================================="
echo "🎯 Starting MCP Server on http://localhost:3000"
echo "=================================="
echo ""

node server.js
