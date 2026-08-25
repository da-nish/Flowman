#!/bin/bash

set -e

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COLLECTION_FILE="$PROJECT_DIR/generated/collections/postman_collection.json"
REPORT_FILE="$PROJECT_DIR/generated/reports/newman-report.html"

echo ""
echo "========================================"
echo "⏳  Checking required commands"
echo "========================================"
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is not installed."; exit 1; }
command -v newman >/dev/null 2>&1 || { echo "Error: Newman is not installed."; exit 1; }
node -e "require('yaml')" >/dev/null 2>&1 || {
    echo "Error: The Node.js package 'yaml' is not installed. Run: npm install yaml"
    exit 1
}

cd "$PROJECT_DIR"

echo ""
echo "========================================"
echo "🔄  Generating Postman collection"
echo "========================================"
mkdir -p "$(dirname "$COLLECTION_FILE")" "$(dirname "$REPORT_FILE")"
node scripts/builder.js
echo "Collection created: $COLLECTION_FILE"

echo ""
echo "========================================"
echo "🔫  Running Newman tests"
echo "========================================"
echo "Environment: $PROJECT_DIR/environments/dev.json"
echo "Test data:   $PROJECT_DIR/testdata/testdata.json"

newman run "$COLLECTION_FILE" \
    -e "$PROJECT_DIR/environments/dev.json" \
    -d "$PROJECT_DIR/testdata/testdata.json" \
    -r htmlextra \
    --reporter-htmlextra-export "$REPORT_FILE" \
    --reporter-htmlextra-title "Flowman - API Test Report" \
    --reporter-htmlextra-browserTitle "Flowman" \
    --reporter-htmlextra-titleSize 3 \
    --reporter-htmlextra-logs \
    --reporter-htmlextra-showEnvironmentData \
    --reporter-htmlextra-displayProgressBar
    

echo ""
echo "========================================"
echo "✅ Test run completed successfully"
echo "========================================"
echo "HTML report: $REPORT_FILE"
echo ""
