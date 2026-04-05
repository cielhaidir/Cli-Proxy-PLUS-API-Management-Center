#!/usr/bin/env bash
set -euo pipefail

npm run build
cp "dist/index.html" "management.html"

printf 'Built dist/index.html and copied it to management.html\n'
