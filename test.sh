#!/bin/bash

set -e

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COLLECTION_FILE="$PROJECT_DIR/generated/collections/postman_collection.json"
REPORT_FILE="$PROJECT_DIR/generated/reports/report.html"
NEWMAN_JSON_FILE="$PROJECT_DIR/generated/response/newman-results.json"
RESPONSE_DIR="$PROJECT_DIR/generated/response"

# ========================================
# Parse arguments
# ========================================

ENVIRONMENT="${1:-dev}"
MODE="${2:-report}"

case "$ENVIRONMENT" in
    dev|stag|prod)
        ;;
    *)
        echo "Error: Invalid environment '$ENVIRONMENT'."
        echo "Usage:"
        echo "  $0 <dev|stag|prod> [cli]"
        echo ""
        echo "Examples:"
        echo "  $0 dev"
        echo "  $0 stag"
        echo "  $0 prod"
        echo "  $0 dev cli"
        echo "  $0 prod cli"
        exit 1
        ;;
esac

if [[ "$MODE" != "cli" && "$MODE" != "report" ]]; then
    echo "Error: Invalid mode '$MODE'. Use 'cli' or omit it for HTML report."
    echo "Usage: $0 <dev|stag|prod> [cli]"
    exit 1
fi

ENV_FILE="$PROJECT_DIR/environments/${ENVIRONMENT}.json"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: Environment file not found:"
    echo "$ENV_FILE"
    exit 1
fi

echo ""
echo "========================================"
echo "⏳  Checking required commands"
echo "========================================"

command -v node >/dev/null 2>&1 || {
    echo "Error: Node.js is not installed."
    exit 1
}

command -v newman >/dev/null 2>&1 || {
    echo "Error: Newman is not installed."
    exit 1
}

node -e "require('yaml')" >/dev/null 2>&1 || {
    echo "Error: The Node.js package 'yaml' is not installed. Run: npm install yaml"
    exit 1
}

cd "$PROJECT_DIR"

echo ""
echo "========================================"
echo "🔄  Generating Postman collection"
echo "========================================"

# Response artifacts are per-run: discard the previous run before generating
# the collection and recreate the directory for this run.
rm -rf "$RESPONSE_DIR"
mkdir -p "$(dirname "$COLLECTION_FILE")" "$(dirname "$REPORT_FILE")" "$RESPONSE_DIR"
node scripts/builder.js "$ENVIRONMENT"
echo "Collection created: $COLLECTION_FILE"

echo ""
echo "========================================"
echo "🔫  Running API tests"
echo "========================================"
echo "Environment: $ENV_FILE"
echo "Test data:   $PROJECT_DIR/testdata/testdata.json"

set +e
if [[ "$MODE" == "cli" ]]; then

    newman run "$COLLECTION_FILE" \
        -e "$ENV_FILE" \
        -d "$PROJECT_DIR/testdata/testdata.json" \
        -r cli,json \
        --reporter-json-export "$NEWMAN_JSON_FILE"
else
    newman run "$COLLECTION_FILE" \
        -e "$ENV_FILE" \
        -d "$PROJECT_DIR/testdata/testdata.json" \
        -r htmlextra,json \
        --reporter-json-export "$NEWMAN_JSON_FILE" \
        --reporter-htmlextra-export "$REPORT_FILE" \
        --reporter-htmlextra-title "Flowman - API Test Report" \
        --reporter-htmlextra-browserTitle "Flowman" \
        --reporter-htmlextra-titleSize 3 \
        --reporter-htmlextra-logs \
        --reporter-htmlextra-showEnvironmentData \
        --reporter-htmlextra-displayProgressBar
fi
NEWMAN_STATUS=$?
set -e

node "$PROJECT_DIR/scripts/save-responses.js" "$NEWMAN_JSON_FILE" "$RESPONSE_DIR"
rm -f "$NEWMAN_JSON_FILE"

if [[ "$NEWMAN_STATUS" -ne 0 ]]; then
    echo "Test run completed with failures. Saved responses, if configured, are in: $RESPONSE_DIR"
    exit "$NEWMAN_STATUS"
fi


echo ""
echo "========================================"
echo "✅ Test run completed successfully"
echo "========================================"

if [[ "$MODE" != "cli" ]]; then
    echo ""
    echo "📝 HTML report: $REPORT_FILE"

    case "$OSTYPE" in
        darwin*)
            open "$REPORT_FILE"
            ;;
        linux*)
            xdg-open "$REPORT_FILE" >/dev/null 2>&1 &
            ;;
        msys*|cygwin*)
            start "" "$REPORT_FILE"
            ;;
    esac
fi

echo ""
