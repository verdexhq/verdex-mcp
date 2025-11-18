#!/bin/bash
# Verdex MCP - Git Hooks Setup Script
# 
# This script installs git hooks to run tests before pushing code.
# This ensures code quality and catches regressions early.

set -e

echo "========================================"
echo "Verdex MCP - Git Hooks Setup"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository root"
    echo "   Run this script from the verdex-mcp project root"
    exit 1
fi

# Create pre-push hook
echo "📝 Creating pre-push hook..."
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash
# Verdex MCP Pre-Push Test Hook
# 
# This hook runs the full test suite before allowing a push.
# It can be bypassed with 'git push --no-verify' (not recommended).

echo ""
echo "🧪 Running Verdex MCP test suite before push..."
echo "   (This ensures no regressions are pushed to the repository)"
echo ""

# Run the test suite
npm test

# Capture exit code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed! Proceeding with push..."
  exit 0
else
  echo "❌ Tests failed! Push blocked."
  echo ""
  echo "   Please fix the failing tests before pushing."
  echo "   Or bypass with: git push --no-verify (not recommended)"
  echo ""
  exit 1
fi
EOF

# Make hook executable
chmod +x .git/hooks/pre-push

echo -e "${GREEN}✅ Pre-push hook installed successfully!${NC}"
echo ""

# Optional: Create pre-commit hook (commented out by default)
echo "📝 Do you want to install a pre-commit hook too? (runs critical tests before every commit)"
echo "   This will slow down commits but catch issues earlier."
read -p "   Install pre-commit hook? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Verdex MCP Pre-Commit Test Hook (Critical Tests Only)
# 
# This hook runs critical tests before allowing a commit.
# It can be bypassed with 'git commit --no-verify' (not recommended).

echo ""
echo "🧪 Running critical Verdex MCP tests before commit..."
echo ""

# Run only critical tests for speed
npx playwright test \
  tests/mcp-server-integration.spec.ts \
  tests/bridge-lifecycle.spec.ts \
  tests/role-management.spec.ts \
  --reporter=list

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Critical tests passed! Proceeding with commit..."
  exit 0
else
  echo "❌ Tests failed! Commit blocked."
  echo ""
  echo "   Please fix the failing tests before committing."
  echo "   Or bypass with: git commit --no-verify (not recommended)"
  echo ""
  exit 1
fi
EOF
    
    chmod +x .git/hooks/pre-commit
    echo -e "${GREEN}✅ Pre-commit hook installed successfully!${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping pre-commit hook installation${NC}"
fi

echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "What happens now:"
echo "  • Before every push: Full test suite runs (~2-3 minutes)"
if [[ $REPLY =~ ^[Yy]$ ]]; then
echo "  • Before every commit: Critical tests run (~1 minute)"
fi
echo ""
echo "Bypassing hooks (not recommended):"
echo "  • git push --no-verify"
echo "  • git commit --no-verify"
echo ""
echo "Testing the setup:"
echo "  • npm test"
echo ""

