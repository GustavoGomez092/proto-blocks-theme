# Blocks

Scaffold Proto-Blocks here, one folder per block (`block.json` + `template.php`).
See the Proto-Blocks plugin docs / WP-CLI: `wp proto-blocks create <name> …`.
This folder ships empty in the starter.

## Escaping in templates

Block attributes are contributor-controlled JSON. WordPress validates them
against the schema types in `block.json` but **never runs them through kses**,
and Proto-Blocks does not escape or sanitise them for you either: whatever
`template.php` echoes is the final front-end HTML. Escape every value for the
context it lands in:

| Output context | Use |
|---|---|
| Text node (`<h2>…</h2>`) | `esc_html( $value )` |
| HTML attribute (`alt=""`, `data-*=""`) | `esc_attr( $value )` |
| `href` / `src` | `esc_url( $value )` |
| Colour inside `style=""` | `sanitize_hex_color( $value ) ?: '#000'` — never `esc_attr()` |
| CSS `url(...)` inside `style=""` | `proto_blocks_css_url( $value )` — never `esc_url()` on its own |
| JSON in an attribute (`data-wp-context`) | `esc_attr( wp_json_encode( $data ) )` in a double-quoted attribute |
| Value inside an inline `<script>` | `wp_json_encode( $value, JSON_HEX_TAG \| JSON_HEX_AMP \| JSON_HEX_APOS \| JSON_HEX_QUOT )` |
| WYSIWYG / rich text | `wp_kses_post( $value )` |
| Nested blocks | `echo $innerBlocksContent ?? ''` **raw** — core's already-rendered HTML; `wp_kses_post()` would strip core block markup |

`esc_attr()` leaves `;`, `(`, `)` and `:` intact, so inside `style=""` a stored
"colour" of `red;position:fixed;inset:0` becomes a full-viewport overlay.
Validate values that reach CSS; do not just escape them. Never print
`$_GET['s']` / `get_search_query( false )` yourself — use the `core/search`
and `core/query-title` blocks, which escape the query.

The plugin README's "Escaping in templates" section has the full table.
