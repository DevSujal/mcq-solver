#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID=${1:-"<YOUR_PROJECT_ID>"}
FUNCTION_NAME=${2:-"mcq-solver"}
ZIP_NAME="deploy.zip"

# Build and package
echo "Packaging function..."
zip -r "$ZIP_NAME" . -x "node_modules/*" ".git/*"

if ! command -v appwrite >/dev/null 2>&1; then
  echo "Appwrite CLI not installed. Install from https://appwrite.io/" >&2
  exit 1
fi

echo "Creating or updating function..."
FUNC_ID=$(appwrite functions list --project "$PROJECT_ID" --format json | jq -r ".[] | select(.name==\"$FUNCTION_NAME\") | .$id")
if [ -z "$FUNC_ID" ]; then
  echo "Function not found. Creating..."
  appwrite functions create --project "$PROJECT_ID" --name "$FUNCTION_NAME" --runtime node-20 --entrypoint index.js
  FUNC_ID=$(appwrite functions list --project "$PROJECT_ID" --format json | jq -r ".[] | select(.name==\"$FUNCTION_NAME\") | .id")
fi

echo "Uploading deployment..."
appwrite functions create-deployment --project "$PROJECT_ID" --functionId "$FUNC_ID" --code "$ZIP_NAME" --activate

echo "Deployment configured. ID: $FUNC_ID"
