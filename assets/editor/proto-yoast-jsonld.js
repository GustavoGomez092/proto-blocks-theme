/**
 * Proto-theme — Custom JSON-LD row for the Yoast SEO editor UI.
 *
 * Yoast renders its editor rows through two SlotFill slots, "YoastMetabox"
 * (the metabox below the block editor) and "YoastSidebar" (the Yoast panel
 * in the editor sidebar), and sorts every fill child by its `renderPriority`
 * prop. This is the same extension point Yoast Premium uses. We add one
 * collapsible "JSON-LD" row to each, built from Yoast's own public
 * components (window.yoast.editorModules.components) so it looks native.
 *
 * The textarea edits the `_proto_jsonld` post meta (registered in
 * inc/proto-yoast-jsonld.php) and is saved with the normal Update button.
 * Plain script, no build step: wp.element.createElement only.
 */
( function () {
	var wp = window.wp || {};
	var plugins = wp.plugins;
	var components = wp.components;
	var data = wp.data;
	var element = wp.element;
	var i18n = wp.i18n;

	if ( ! plugins || ! components || ! data || ! element || ! i18n || ! components.Fill ) {
		return;
	}

	var el = element.createElement;
	var Fragment = element.Fragment;
	var useMemo = element.useMemo;
	var useSelect = data.useSelect;
	var useDispatch = data.useDispatch;
	var Fill = components.Fill;
	var Button = components.Button;
	var TextareaControl = components.TextareaControl;
	var __ = i18n.__;
	var _n = i18n._n;
	var sprintf = i18n.sprintf;

	var META_KEY = ( window.protoYoastJsonLd && window.protoYoastJsonLd.metaKey ) || '_proto_jsonld';

	// Yoast's own rows end at "Insights": priority 52 in the metabox, 32 in
	// the sidebar. Sit right after them.
	var METABOX_PRIORITY = 60;
	var SIDEBAR_PRIORITY = 40;

	var COLORS = { valid: '#007017', invalid: '#cc1818', empty: '#757575' };

	/**
	 * Yoast's public editor components (from the `yoast-seo-editor-modules`
	 * script, enqueued as our dependency), read lazily at render time.
	 */
	function yoastComponents() {
		var modules = window.yoast && window.yoast.editorModules;
		return ( modules && modules.components ) || null;
	}

	function isPlainObject( value ) {
		return !! value && typeof value === 'object' && ! Array.isArray( value );
	}

	/**
	 * Mirror of proto_jsonld_parse() in PHP: validate the JSON and the shape,
	 * and list the nodes that would be output.
	 *
	 * @return {{state: string, error: string, types: string[], skipped: number}}
	 */
	function analyse( raw ) {
		var result = { state: 'empty', error: '', types: [], skipped: 0 };
		if ( ! raw || ! raw.trim() ) { return result; }

		var parsed;
		try {
			parsed = JSON.parse( raw );
		} catch ( e ) {
			result.state = 'invalid';
			result.error = e.message;
			return result;
		}

		var nodes;
		if ( Array.isArray( parsed ) ) {
			nodes = parsed;
		} else if ( isPlainObject( parsed ) && parsed[ '@graph' ] !== undefined ) {
			nodes = Array.isArray( parsed[ '@graph' ] ) ? parsed[ '@graph' ] : [ parsed[ '@graph' ] ];
		} else if ( isPlainObject( parsed ) ) {
			nodes = [ parsed ];
		} else {
			result.state = 'invalid';
			result.error = __( 'Expected an object, an array of objects, or an object with @graph.', 'proto-theme' );
			return result;
		}

		nodes.forEach( function ( node ) {
			if ( ! isPlainObject( node ) || Object.keys( node ).filter( function ( k ) { return k !== '@context'; } ).length === 0 ) {
				result.skipped++;
				return;
			}
			var type = node[ '@type' ];
			var types = ( Array.isArray( type ) ? type : [ type ] ).filter( function ( t ) { return typeof t === 'string'; } );
			result.types.push( types.length ? types.join( ' + ' ) : __( '(no @type)', 'proto-theme' ) );
		} );

		result.state = 'valid';
		return result;
	}

	function StatusLine( props ) {
		var info = props.info;
		var text;

		if ( info.state === 'empty' ) {
			text = __( 'No custom JSON-LD. Yoast outputs its normal graph.', 'proto-theme' );
		} else if ( info.state === 'invalid' ) {
			text = sprintf(
				/* translators: %s: JSON parse error. */
				__( 'Invalid JSON: %s. It is saved as typed but not output until fixed.', 'proto-theme' ),
				info.error
			);
		} else {
			text = sprintf(
				/* translators: 1: node count, 2: comma-separated @type list. */
				_n( 'Valid JSON. %1$d node: %2$s', 'Valid JSON. %1$d nodes: %2$s', info.types.length, 'proto-theme' ),
				info.types.length,
				info.types.join( ', ' ) || '—'
			);
			if ( info.skipped ) {
				text += ' ' + sprintf(
					/* translators: %d: number of ignored entries. */
					_n( '(%d entry ignored: not an object.)', '(%d entries ignored: not objects.)', info.skipped, 'proto-theme' ),
					info.skipped
				);
			}
		}

		return el(
			'p',
			{
				className: 'proto-jsonld__status is-' + info.state,
				role: 'status',
				'aria-live': 'polite',
				style: { margin: '8px 0', color: COLORS[ info.state ], fontWeight: info.state === 'empty' ? 400 : 600 },
			},
			text
		);
	}

	/**
	 * The row's body — shared by the metabox and sidebar rows. Both read the
	 * same edited meta, so they stay in sync.
	 */
	function JsonLdEditor() {
		var raw = useSelect( function ( select ) {
			var meta = select( 'core/editor' ).getEditedPostAttribute( 'meta' ) || {};
			return typeof meta[ META_KEY ] === 'string' ? meta[ META_KEY ] : '';
		}, [] );
		var editPost = useDispatch( 'core/editor' ).editPost;
		var info = useMemo( function () { return analyse( raw ); }, [ raw ] );

		function setRaw( next ) {
			var meta = {};
			meta[ META_KEY ] = next;
			editPost( { meta: meta } );
		}

		function format() {
			try { setRaw( JSON.stringify( JSON.parse( raw ), null, 2 ) ); } catch ( e ) {}
		}

		return el(
			'div',
			{ className: 'proto-jsonld' },
			el( 'p', { style: { marginTop: 0 } },
				__( 'Accepts a single node object, an array of nodes, or an object with "@graph" ("@context" is optional and removed).', 'proto-theme' )
			),
			el( 'p', null,
				__( 'Nodes that describe this page (a WebPage type such as FAQPage, or "@id": "#webpage") merge into Yoast\'s WebPage; every other node is appended to Yoast\'s graph, with "#…" ids resolved against this page\'s URL.', 'proto-theme' )
			),
			el( TextareaControl, {
				label: __( 'JSON-LD code', 'proto-theme' ),
				value: raw,
				onChange: setRaw,
				rows: 12,
				spellCheck: false,
				autoComplete: 'off',
				placeholder: '{\n  "@type": "FAQPage",\n  "mainEntity": [ { "@id": "#q1" } ]\n}',
				className: 'proto-jsonld__textarea',
				style: { fontFamily: 'Menlo, Consolas, Monaco, "Liberation Mono", monospace', fontSize: '12px', lineHeight: 1.5, width: '100%' },
				__nextHasNoMarginBottom: true,
			} ),
			el( StatusLine, { info: info } ),
			el( Button, {
				variant: 'secondary',
				onClick: format,
				disabled: info.state !== 'valid',
				className: 'proto-jsonld__format',
			}, __( 'Format', 'proto-theme' ) )
		);
	}

	/**
	 * Fallback wrapper with the prop Yoast's slots sort by — used only if a
	 * future Yoast stops exposing SidebarItem.
	 */
	function PriorityItem( props ) {
		return el( 'div', null, props.children );
	}

	function ProtoYoastJsonLd() {
		var hasMeta = useSelect( function ( select ) {
			var meta = select( 'core/editor' ).getEditedPostAttribute( 'meta' );
			return !! meta && Object.prototype.hasOwnProperty.call( meta, META_KEY );
		}, [] );
		var yoast = yoastComponents();

		// Not a Yoast-enabled screen, or meta not exposed for this post type.
		if ( ! yoast || ! hasMeta ) { return null; }

		var Item = yoast.SidebarItem || PriorityItem;
		var title = __( 'JSON-LD', 'proto-theme' );

		return el(
			Fragment,
			null,
			yoast.MetaboxCollapsible && el(
				Fill,
				{ name: 'YoastMetabox' },
				el( Item, { key: 'proto-jsonld', renderPriority: METABOX_PRIORITY },
					el( yoast.MetaboxCollapsible, { id: 'proto-jsonld-metabox', title: title },
						el( JsonLdEditor )
					)
				)
			),
			yoast.SidebarCollapsible && el(
				Fill,
				{ name: 'YoastSidebar' },
				el( Item, { key: 'proto-jsonld', renderPriority: SIDEBAR_PRIORITY },
					el( yoast.SidebarCollapsible, { id: 'proto-jsonld-sidebar', title: title },
						el( JsonLdEditor )
					)
				)
			)
		);
	}

	plugins.registerPlugin( 'proto-yoast-jsonld', { render: ProtoYoastJsonLd } );
} )();
