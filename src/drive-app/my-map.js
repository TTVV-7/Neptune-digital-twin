import './my-map.css';
import { boundsOf, worldOfRoom } from './live-protocol.js';
import { SPOTS } from './places.js';

// Your map (docs/world-drive.md, "Your map"): every area of the Earth a player has driven (levels'
// areas, about 11 km across: live-protocol.js's cells, 'near:BAND.COL') as a dot, and every start
// spot as a star, on NASA's Blue Marble (the globe's own picture, /earth/colour.webp), opened from
// the profile card's Your map. What's shown is what progress.js knows: this browser's places
// straight away, then the player's whole list from the Worker (all their devices',
// POST /api/progress/places) once it comes. It opens framed on the player's places; Whole world
// shows the Earth, and the map pans with a drag and zooms with the buttons, the wheel or a pinch.
// Its own chunk: nothing of it loads until it's opened.

const PICTURE = '/earth/colour.webp';
// The least a view spans (degrees of longitude), so one place isn't a blur; and the most zoom.
const LEAST_SPAN = 6;
const MAX_ZOOM = 60;
const AREA = '#3ec1ff';
const SPOT = '#ffd23f';

let dialog = null;
let picture = null;
let state = null;

// Opens the map for `progress` (progress.js's handle).
export function openMyMap( progress ) {

	dialog ??= build();
	state = { progress, places: progress.places(), view: null, fetched: false };
	draw( true );
	if ( ! dialog.open ) dialog.showModal();
	progress.fetchPlaces().then( places => {

		if ( ! state || state.progress !== progress ) return;
		const grew = places.length !== state.places.length;
		state.places = places;
		state.fetched = true;
		draw( grew && ! state.moved );

	} ).catch( () => {

		if ( state ) state.fetched = true;
		draw( false );

	} );

}

function build() {

	const box = document.createElement( 'dialog' );
	box.id = 'my-map';
	box.setAttribute( 'aria-labelledby', 'my-map-title' );
	box.innerHTML = `
		<header>
			<h2 id="my-map-title">Your map</h2>
			<button type="button" class="close" aria-label="Close">×</button>
		</header>
		<p class="my-map-count small" role="status"></p>
		<div class="my-map-frame">
			<canvas role="img" aria-label="A map of the Earth with the places you've driven"></canvas>
			<div class="my-map-tools">
				<button type="button" data-zoom="in" aria-label="Zoom in">+</button>
				<button type="button" data-zoom="out" aria-label="Zoom out">&minus;</button>
			</div>
			<div class="my-map-tip" hidden></div>
		</div>
		<div class="my-map-bar">
			<button type="button" class="my-map-fit">Your places</button>
			<button type="button" class="my-map-world">Whole world</button>
			<span class="my-map-key small"><i class="dot"></i> areas driven <i class="star">★</i> start spots</span>
		</div>
		<ul class="my-map-spots small"></ul>
		<p class="small muted">The Earth only: an area is about 11 km across, counted the first time you drive a little way in it. The Moon, Mars, Vesta and Ceres have their Discoveries.</p>`;
	document.body.append( box );
	box.querySelector( '.close' ).addEventListener( 'click', () => box.close() );
	box.addEventListener( 'click', event => {

		const r = box.getBoundingClientRect();
		if ( event.target === box && ( event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom ) ) box.close();

	} );
	// Keys here are the map's, never the game's (as the other panels do).
	box.addEventListener( 'keydown', event => event.stopPropagation() );
	box.addEventListener( 'close', () => {

		state = null;

	} );
	box.querySelector( '.my-map-fit' ).addEventListener( 'click', () => {

		state.moved = false;
		draw( true );

	} );
	box.querySelector( '.my-map-world' ).addEventListener( 'click', () => {

		state.moved = true;
		state.view = { lon: 0, lat: 0, span: 360 };
		draw( false );

	} );
	for ( const button of box.querySelectorAll( '[data-zoom]' ) ) button.addEventListener( 'click', () => zoom( button.dataset.zoom === 'in' ? 0.5 : 2 ) );
	const canvas = box.querySelector( 'canvas' );
	canvas.addEventListener( 'wheel', event => {

		event.preventDefault();
		zoom( event.deltaY < 0 ? 0.8 : 1.25, pointAt( event ) );

	}, { passive: false } );
	// Dragging pans; two fingers pinch.
	const pointers = new Map();
	let pinch = null;
	canvas.addEventListener( 'pointerdown', event => {

		canvas.setPointerCapture( event.pointerId );
		pointers.set( event.pointerId, { x: event.clientX, y: event.clientY } );
		if ( pointers.size === 2 ) pinch = distance( [ ...pointers.values() ] );

	} );
	canvas.addEventListener( 'pointermove', event => {

		if ( ! state?.view ) return;
		const last = pointers.get( event.pointerId );
		if ( ! last ) return tip( event );
		pointers.set( event.pointerId, { x: event.clientX, y: event.clientY } );
		if ( pointers.size === 2 ) {

			const now = distance( [ ...pointers.values() ] );
			if ( pinch && now ) zoom( pinch / now );
			pinch = now;
			return;

		}

		const { width } = canvas.getBoundingClientRect();
		const perPx = state.view.span / width;
		state.view.lon = wrap( state.view.lon - ( event.clientX - last.x ) * perPx );
		state.view.lat = clampLat( state.view.lat + ( event.clientY - last.y ) * perPx, state.view.span );
		state.moved = true;
		draw( false );

	} );
	const up = event => {

		pointers.delete( event.pointerId );
		if ( pointers.size < 2 ) pinch = null;

	};
	canvas.addEventListener( 'pointerup', up );
	canvas.addEventListener( 'pointercancel', up );
	canvas.addEventListener( 'pointerleave', () => {

		box.querySelector( '.my-map-tip' ).hidden = true;

	} );
	new ResizeObserver( () => state && draw( false ) ).observe( canvas );
	picture = new Image();
	picture.decoding = 'async';
	picture.addEventListener( 'load', () => state && draw( false ) );
	picture.src = PICTURE;
	return box;

}

// The places as points: { lat, lon, kind: 'area' | 'spot', name? }. Only the Earth's areas; spots by
// SPOTS, the others (a spot since taken out) left off.
function pointsOf( places ) {

	const points = [];
	for ( const place of places ) {

		if ( place.startsWith( 'spot:' ) ) {

			const spot = SPOTS.find( s => s.id === place.slice( 5 ) );
			if ( spot ) points.push( { lat: spot.lat, lon: spot.lon, kind: 'spot', name: spot.name, region: spot.region } );

		} else if ( worldOfRoom( place ) === 'earth' ) {

			try {

				const { south, north, west, east } = boundsOf( place );
				points.push( { lat: ( south + north ) / 2, lon: ( west + east ) / 2, kind: 'area' } );

			} catch {

				// (Not an area after all: left off.)

			}

		}

	}

	return points;

}

// The view that frames `points`: { lon, lat, span } (span: degrees of longitude across), the whole
// world for none. Longitudes are framed the short way round, across the date line too.
function frame( points ) {

	if ( ! points.length ) return { lon: 0, lat: 0, span: 360 };
	const lons = points.map( p => p.lon ).sort( ( a, b ) => a - b );
	// The widest gap between neighbours (round the back too) is what's left out.
	let gap = lons[ 0 ] + 360 - lons.at( - 1 ), start = lons[ 0 ];
	for ( let i = 1; i < lons.length; i ++ ) if ( lons[ i ] - lons[ i - 1 ] > gap ) {

		gap = lons[ i ] - lons[ i - 1 ];
		start = lons[ i ];

	}

	const lonSpan = 360 - gap;
	const lats = points.map( p => p.lat );
	const south = Math.min( ...lats );
	const north = Math.max( ...lats );
	const span = Math.min( 360, Math.max( LEAST_SPAN, lonSpan * 1.3, ( north - south ) * 2 * 1.3 ) );
	return { lon: wrap( start + lonSpan / 2 ), lat: clampLat( ( south + north ) / 2, span ), span };

}

function draw( refit ) {

	if ( ! dialog || ! state ) return;
	const points = pointsOf( state.places );
	if ( refit || ! state.view ) state.view = frame( points );
	const areas = points.filter( p => p.kind === 'area' ).length;
	const spots = points.filter( p => p.kind === 'spot' );
	dialog.querySelector( '.my-map-count' ).textContent = points.length
		? `${ areas.toLocaleString() } ${ areas === 1 ? 'area' : 'areas' } and ${ spots.length } start ${ spots.length === 1 ? 'spot' : 'spots' } driven on the Earth${ state.fetched ? '' : ' (checking your other devices...)' }`
		: state.fetched ? 'Nowhere on the Earth yet: drop in and drive, and every area you drive lights up here.' : 'Looking for your places...';
	dialog.querySelector( '.my-map-spots' ).innerHTML = spots.map( s => `<li><span aria-hidden="true">★</span> ${ escape( s.name ) } <span class="muted">${ escape( s.region ) }</span></li>` ).join( '' );

	const canvas = dialog.querySelector( 'canvas' );
	const { width, height } = canvas.getBoundingClientRect();
	if ( ! width || ! height ) return;
	const ratio = window.devicePixelRatio || 1;
	canvas.width = Math.round( width * ratio );
	canvas.height = Math.round( height * ratio );
	const ctx = canvas.getContext( '2d' );
	ctx.setTransform( ratio, 0, 0, ratio, 0, 0 );
	ctx.fillStyle = '#0a1a33';
	ctx.fillRect( 0, 0, width, height );
	const { lon, lat, span } = state.view;
	const scale = width / span;
	const toX = x => width / 2 + wrap( x - lon ) * scale;
	const toY = y => height / 2 - ( y - lat ) * scale;
	// The picture, once round and again either side so the date line never shows an edge.
	if ( picture?.complete && picture.naturalWidth ) {

		for ( const shift of [ - 360, 0, 360 ] ) {

			const x = width / 2 + ( - 180 - lon + shift ) * scale;
			ctx.drawImage( picture, x, toY( 90 ), 360 * scale, 180 * scale );

		}

	}

	// An area is drawn at its size once zoomed in that far, else as a dot that can be seen.
	const r = Math.max( 2.5, 0.05 * scale );
	ctx.fillStyle = AREA;
	ctx.shadowColor = AREA;
	ctx.shadowBlur = 6;
	for ( const p of points ) if ( p.kind === 'area' ) {

		ctx.beginPath();
		ctx.arc( toX( p.lon ), toY( p.lat ), r, 0, Math.PI * 2 );
		ctx.fill();

	}

	ctx.shadowBlur = 0;
	ctx.font = '700 15px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for ( const p of spots ) {

		ctx.fillStyle = '#1d1500';
		ctx.fillText( '★', toX( p.lon ) + 1, toY( p.lat ) + 1 );
		ctx.fillStyle = SPOT;
		ctx.fillText( '★', toX( p.lon ), toY( p.lat ) );

	}

	state.drawn = { points, toX, toY };

}

function zoom( factor, at = null ) {

	if ( ! state?.view ) return;
	const view = state.view;
	const span = Math.min( 360, Math.max( 360 / MAX_ZOOM, view.span * factor ) );
	if ( at ) {

		// Zoom about the point under the pointer.
		const k = 1 - span / view.span;
		view.lon = wrap( view.lon + wrap( at.lon - view.lon ) * k );
		view.lat = view.lat + ( at.lat - view.lat ) * k;

	}

	view.span = span;
	view.lat = clampLat( view.lat, span );
	state.moved = true;
	draw( false );

}

// The map's { lon, lat } under a pointer event.
function pointAt( event ) {

	const canvas = dialog.querySelector( 'canvas' );
	const { left, top, width, height } = canvas.getBoundingClientRect();
	const { lon, lat, span } = state.view;
	return { lon: wrap( lon + ( event.clientX - left - width / 2 ) * span / width ), lat: lat - ( event.clientY - top - height / 2 ) * span / width };

}

// A start spot's name by the pointer.
function tip( event ) {

	const box = dialog.querySelector( '.my-map-tip' );
	const drawn = state?.drawn;
	if ( ! drawn ) return;
	const canvas = dialog.querySelector( 'canvas' );
	const { left, top } = canvas.getBoundingClientRect();
	const x = event.clientX - left;
	const y = event.clientY - top;
	const near = drawn.points.find( p => p.kind === 'spot' && Math.hypot( drawn.toX( p.lon ) - x, drawn.toY( p.lat ) - y ) < 12 );
	box.hidden = ! near;
	if ( ! near ) return;
	box.textContent = near.name;
	box.style.left = `${ x }px`;
	box.style.top = `${ y }px`;

}

function distance( [ a, b ] ) {

	return Math.hypot( a.x - b.x, a.y - b.y );

}

// A longitude (or difference of them) in -180..180.
function wrap( lon ) {

	return ( ( lon + 180 ) % 360 + 360 ) % 360 - 180;

}

// The view's middle latitude, kept so the picture fills the frame top to bottom where it can.
function clampLat( lat, span ) {

	const half = Math.min( 90, span / 4 );
	return Math.max( - 90 + half, Math.min( 90 - half, lat ) );

}

function escape( text ) {

	return String( text ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' } )[ c ] );

}
