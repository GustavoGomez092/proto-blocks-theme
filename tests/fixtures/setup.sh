#!/usr/bin/env bash
# Creates (or refreshes) the two pages the Taxi E2E suite navigates between.
# Idempotent: safe to re-run.
set -euo pipefail

WP_PATH="${WP_PATH:-/Users/gustavogomez/Local Sites/cadco/app/public}"
wp() { command wp --path="$WP_PATH" "$@"; }

upsert_page() {
  local slug="$1" title="$2" content="$3"
  local id
  id="$(wp post list --post_type=page --name="$slug" --field=ID --format=ids)"
  if [ -n "$id" ]; then
    wp post update "$id" --post_title="$title" --post_content="$content" --post_status=publish >/dev/null
    echo "updated $slug (ID $id)"
  else
    wp post create --post_type=page --post_title="$title" --post_name="$slug" \
      --post_content="$content" --post_status=publish --porcelain
  fi
}

upsert_page "taxi-test-a" "Taxi Test A" \
  '<!-- wp:proto-blocks/taxi-fixture-a /--><!-- wp:paragraph --><p><a href="/cart/">Cart</a> <a href="/cart-accessories/">Cart accessories</a></p><!-- /wp:paragraph -->'

upsert_page "taxi-test-b" "Taxi Test B" \
  '<!-- wp:proto-blocks/taxi-fixture-a /--><!-- wp:proto-blocks/taxi-fixture-b /-->'
