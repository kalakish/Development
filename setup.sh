#!/bin/bash

echo "🚀 Setting up NOVA Framework..."

# Clean everything
echo "🧹 Cleaning old installations..."
rm -rf node_modules
rm -f package-lock.json
find packages -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null
find packages -name "package-lock.json" -type f -delete 2>/dev/null
find apps -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null
find apps -name "package-lock.json" -type f -delete 2>/dev/null

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install --no-package-lock

# Bootstrap with lerna
echo "🔄 Bootstrapping packages..."
npx lerna bootstrap --hoist --no-ci

# Build all packages
echo "🔨 Building packages..."
npm run build

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  cd apps/studio && npm start  - to start the development IDE"
echo "  npm test                     - to run tests"
