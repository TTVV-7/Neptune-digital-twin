// Reads a Bluebeam progress markup of the B2D2 repair drawings (Hatch 620-24070-DWG-ST005 to
// ST010, A1 at 1:100) and turns its coloured areas into the repair areas of the B2D2 model:
// scripts/data/b2d2-markups.json, which scripts/b2d2-repair-model.mjs builds the model from.
//
//   node scripts/b2d2-progress.mjs <progress.pdf> [--sheets ST007,ST005,...] [--dry-run]
//
// Each filled polygon is a chipped (or hydro-demolished) area, coloured by when it was done, as the
// drawings' legend says (COLOURS). Its sheet and view say where it is: the views are registered on
// the page as the B2D2 Repair Model artifact has them (VIEWS: page points = a + b × grid metres),
// which gives grid and elevation; then a ray from inside the structure onto that wall, floor or
// soffit of the model (source-models/b2d2-site-model.glb) finds the face it's on, and the outline
// is laid on it. Two places where the drawings and the model differ are fitted as the artifact's
// first import did: the pony walls at grade (heights scaled into the model's band, PONY) and C32's
// floor plan (its 0-4 grid across the model's 3.35 m between the walls, C32_ACROSS). The model is
// the site model with its structure put on the drawings' grid (scripts/b2d2-structure.mjs), as the
// build has it.
//
// Panel numbers: a callout whose text is a panel number (CW0001) and whose leader ends on an area
// gives that area its number (no), as the twin shows it. The numbers are written the same width
// (CW00010 is CW0010).
//
// The progress areas already in the snapshot (src containing "progress") are replaced by the
// drawing's, keeping the id of each that's still there (same face, within 0.3 m), so the artifact
// and the twin keep talking about the same area. Anything else in the snapshot is kept as it is.
// The sheet of each page is read from its drawing number (pdftotext), or given with --sheets.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { area3, fEL, gridRef, letRange, numRange, zoneOf } from '../src/repair-geometry.js';
import { C32_INSIDE, C32_LINE, correctStructure, PIT_INSIDE } from './b2d2-structure.mjs';

const ROOT = new URL( '../', import.meta.url );
const { values: opts, positionals } = parseArgs( { allowPositionals: true, options: {
	sheets: { type: 'string' },
	site: { type: 'string', default: new URL( 'source-models/b2d2-site-model.glb', ROOT ).pathname },
	markups: { type: 'string', default: new URL( 'scripts/data/b2d2-markups.json', ROOT ).pathname },
	'dry-run': { type: 'boolean' },
	// How far (m) an area may be from where the snapshot has it and still be the same area: more
	// when the model's faces have been moved since (--match 1.2 after the structure was corrected).
	match: { type: 'string', default: '0.6' },
} } );
const pdfPath = positionals[ 0 ];
if ( ! pdfPath ) throw new Error( 'Usage: node scripts/b2d2-progress.mjs <progress.pdf> [--sheets ST007,ST005,...] [--dry-run]' );

// The legend's colours (interior colour, RGB 0-1) and what they mean.
const COLOURS = [
	{ rgb: [ 0, 1, 0 ], date: '2026-11-02', label: '2026.11.02 and before' },
	{ rgb: [ 0, 1, 1 ], date: '2026-11-03', label: '2026.11.03' },
	{ rgb: [ 1, 0.502, 0 ], date: '2026-11-04', label: '2026.11.04' },
	{ rgb: [ 1, 0.502, 1 ], date: '2026-11-05/08', label: '2026.11.05 to 11.08' },
	{ rgb: [ 0, 0, 1 ], date: '2026-11-09', label: '2026.11.09' },
	{ rgb: [ 1, 1, 0 ], date: '2026-11-10', label: '2026.11.10' },
];

// Where each view is on its sheet (page points from the top left: x = ax + bx × p, y = ay + by × q,
// p and q in grid metres) and its box there. From the B2D2 Repair Model artifact.
const VIEWS = {
	gnd: { sheet: 'ST005', name: 'ground floor plan', box: [ 295.8, 271.8, 2262.0, 516.0 ], ax: 302.0, bx: 28.35, ay: 507.6, by: - 28.35 },
	b1: { sheet: 'ST005', name: 'basement B1 plan', box: [ 295.8, 802.2, 2262.0, 1046.4 ], ax: 302.0, bx: 28.35, ay: 1037.6, by: - 28.35 },
	b2: { sheet: 'ST006', name: 'basement B2 plan', box: [ 378.0, 82.2, 631.8, 1376.4 ], ax: 395.9, bx: 28.35, ay: 1366.5, by: - 28.35 },
	wallW: { sheet: 'ST007', name: 'Section A (west wall)', box: [ 292.8, 280.2, 2257.8, 562.2 ], ax: 298.6, bx: 28.35, ay: 391.395, by: - 28.35 },
	wallE: { sheet: 'ST007', name: 'Section B (east wall)', box: [ 267.0, 765.0, 2232.0, 1047.0 ], ax: 2226.2, bx: - 28.35, ay: 876.195, by: - 28.35 },
	wallN: { sheet: 'ST007', name: 'Section C (north wall)', box: [ 244.2, 1207.8, 488.4, 1381.8 ], ax: 479.3, bx: - 28.35, ay: 1319.095, by: - 28.35 },
	wallD: { sheet: 'ST008', name: 'Section D (C32 north wall)', box: [ 463.8, 229.8, 1758.0, 555.0 ], ax: 1748.9, bx: - 28.35, ay: 341.895, by: - 28.35 },
	wallS: { sheet: 'ST008', name: 'Section E (south wall & C32)', box: [ 322.8, 820.8, 1615.8, 1146.0 ], ax: 331.6, bx: 28.35, ay: 932.395, by: - 28.35 },
	ceil31: { sheet: 'ST009', name: 'C31 ceiling plan', box: [ 235.8, 250.2, 2200.8, 494.4 ], ax: 241.8, bx: 28.35, ay: 485.8, by: - 28.35 },
	ceil32: { sheet: 'ST010', name: 'C32 ceiling plan', box: [ 351.0, 91.8, 604.2, 1386.0 ], ax: 368.4, bx: 28.35, ay: 1376.7, by: - 28.35 },
};

// The model's frame is the artifact's: x = C31 numeric grid, y = elevation, z = minus the letter grid.
// The pony walls at grade: the drawings' elevations scaled into the model's band (fitted to the
// first import's areas, within 4 mm).
const PONY = { from: 2.3, a: 0.8125, b: 2.0536 };
// C32's floor and ceiling plans: their 0-4 grid across C32 between its walls in the model.
const C32_ACROSS = { x0: C32_INSIDE[ 0 ], k: ( C32_INSIDE[ 1 ] - C32_INSIDE[ 0 ] ) / 4 };
const PIT_END = PIT_INSIDE.outer.l[ 1 ]; // letter grid: C32 starts past the pit
const PIT_NORTH = PIT_INSIDE.outer.x[ 1 ]; // C31's grid: the gallery starts past the pit
// Section E's faces nearer grid 0 than this are the pit's south wall; C32's south wall is beyond.
const PIT_SOUTH = ( PIT_INSIDE.x[ 0 ] + C32_INSIDE[ 0 ] ) / 2;
const FL = z => - 6.82 + 0.241 * z; // C32's floor, by letter grid (Hatch)

// Where to look from, for a point (p, q) of a view: a ray from inside onto the face drawn, and the
// point's place along that ray's line. Plans look down (or up, ceilings) at x, z; sections across.
function rayOf( view, p, q, pony ) {

	const y = pony ? PONY.a * q + PONY.b : q;
	const c32 = q > PIT_END;
	switch ( view ) {

		// At grade, from the middle of the trench beside each pony wall (z -7.75 to -6.05 west,
		// -3.93 to -2.24 east): the train support beams between them would be hit first from the
		// gallery's middle.
		case 'wallW': return { at: new Vector3( p, y, pony ? - 6.9 : - 4 ), dir: new Vector3( 0, 0, - 1 ) };
		case 'wallE': return { at: new Vector3( p, y, pony ? - 3 : - 4 ), dir: new Vector3( 0, 0, 1 ) };
		case 'wallN': return { at: new Vector3( 60, y, - p ), dir: new Vector3( 1, 0, 0 ) };
		case 'wallD': return { at: new Vector3( C32_LINE, y, - p ), dir: new Vector3( 1, 0, 0 ) };
		case 'wallS': return { at: new Vector3( C32_LINE, y, - p ), dir: new Vector3( - 1, 0, 0 ) };
		case 'gnd': return { at: new Vector3( p, 20, - q ), dir: new Vector3( 0, - 1, 0 ) };
		case 'b1': return { at: new Vector3( p, - 0.5, - q ), dir: new Vector3( 0, - 1, 0 ) };
		case 'ceil31': return { at: new Vector3( p, 0, - q ), dir: new Vector3( 0, 1, 0 ) };
		case 'b2': return { at: new Vector3( c32 ? C32_ACROSS.x0 + C32_ACROSS.k * p : p, c32 ? FL( q ) + 1.5 : - 3, - q ), dir: new Vector3( 0, - 1, 0 ) };
		case 'ceil32': return { at: new Vector3( c32 ? C32_ACROSS.x0 + C32_ACROSS.k * p : p, c32 ? FL( q ) + 1.5 : - 4, - q ), dir: new Vector3( 0, 1, 0 ) };
		default: throw new Error( `unknown view ${ view }` );

	}

}

// ---------- The PDF ----------

const near = ( a, b ) => a.every( ( v, i ) => Math.abs( v - b[ i ] ) < 0.01 );

async function readPolygons( path ) {

	const doc = await PDFDocument.load( await readFile( path ), { updateMetadata: false } );
	const sheets = opts.sheets ? opts.sheets.split( ',' ).map( s => s.trim() ) : doc.getPages().map( ( _, i ) => sheetOf( path, i + 1 ) );
	const out = [];
	const labels = [];
	doc.getPages().forEach( ( page, i ) => {

		const height = page.getHeight();
		const annots = page.node.Annots();
		for ( let k = 0; annots && k < annots.size(); k ++ ) {

			const a = annots.lookup( k, PDFDict );
			const subtype = a.get( PDFName.of( 'Subtype' ) )?.toString();
			// A panel number's callout: the leader starts (CL's first point) on the area.
			if ( subtype === '/FreeText' ) {

				const said = ( a.get( PDFName.of( 'Contents' ) )?.decodeText?.() ?? '' ).trim();
				const cl = a.lookup( PDFName.of( 'CL' ) )?.asArray?.().map( n => n.asNumber() );
				if ( PANEL.test( said ) && cl?.length >= 4 ) labels.push( { page: i + 1, said, tip: [ cl[ 0 ], height - cl[ 1 ] ] } );
				continue;

			}

			if ( subtype !== '/Polygon' ) continue;
			const ic = a.lookup( PDFName.of( 'IC' ) )?.asArray().map( n => n.asNumber() );
			const colour = ic && COLOURS.find( c => near( c.rgb, ic ) );
			if ( ! colour ) continue;
			const v = a.lookup( PDFName.of( 'Vertices' ) ).asArray().map( n => n.asNumber() );
			const pts = [];
			for ( let n = 0; n < v.length; n += 2 ) pts.push( [ v[ n ], height - v[ n + 1 ] ] );
			const text = key => a.get( PDFName.of( key ) )?.decodeText?.() ?? '';
			out.push( { page: i + 1, sheet: sheets[ i ], pts, colour, contents: text( 'Contents' ), subject: text( 'Subj' ) } );

		}

	} );
	return { polys: out, labels };

}

// A panel number as the drawings write them: letters, then digits.
const PANEL = /^([A-Z]{1,4})(\d{1,6})$/;

// Each label's area: the polygon on its page its leader ends in, or failing that the one whose
// edge is nearest the end, within NEAR_LABEL points. The numbers are written as wide as most are.
const NEAR_LABEL = 12;
function numberPanels( polys, labels ) {

	const widths = labels.map( l => PANEL.exec( l.said )[ 2 ].length );
	const width = widths.sort( ( a, b ) => widths.filter( w => w === b ).length - widths.filter( w => w === a ).length )[ 0 ];
	const inside = ( [ x, y ], pts ) => {

		let odd = false;
		for ( let i = 0, j = pts.length - 1; i < pts.length; j = i ++ ) {

			const [ xi, yi ] = pts[ i ], [ xj, yj ] = pts[ j ];
			if ( ( yi > y ) !== ( yj > y ) && x < ( xj - xi ) * ( y - yi ) / ( yj - yi ) + xi ) odd = ! odd;

		}

		return odd;

	};
	const toEdge = ( [ x, y ], pts ) => Math.min( ...pts.map( ( a, i ) => {

		const b = pts[ ( i + 1 ) % pts.length ];
		const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ];
		const t = Math.max( 0, Math.min( 1, ( ( x - a[ 0 ] ) * dx + ( y - a[ 1 ] ) * dy ) / ( dx * dx + dy * dy || 1 ) ) );
		return Math.hypot( x - a[ 0 ] - t * dx, y - a[ 1 ] - t * dy );

	} ) );
	const notes = [];
	for ( const label of labels ) {

		const [ , letters, digits ] = PANEL.exec( label.said );
		const no = letters + String( Number( digits ) ).padStart( width, '0' );
		if ( no !== label.said ) notes.push( `${ label.said } read as ${ no }` );
		const mine = polys.filter( p => p.page === label.page );
		const poly = mine.find( p => inside( label.tip, p.pts ) )
			?? mine.map( p => ( { p, d: toEdge( label.tip, p.pts ) } ) ).filter( ( { d } ) => d <= NEAR_LABEL ).sort( ( a, b ) => a.d - b.d )[ 0 ]?.p;
		if ( ! poly ) {

			notes.push( `${ no }: its leader ends on no area (page ${ label.page }, ${ label.tip.map( Math.round ).join( ', ' ) })` );
			continue;

		}

		if ( poly.no && poly.no !== no ) notes.push( `${ no } and ${ poly.no } point at the same area; kept ${ poly.no }` );
		else poly.no = no;

	}

	return notes;

}

// The drawing number in a page's title block (…-DWG-ST007): of the drawing numbers on the page
// (notes and the references list name others), the one along the bottom furthest right.
function sheetOf( path, page ) {

	try {

		const words = execFileSync( 'pdftotext', [ '-f', String( page ), '-l', String( page ), '-bbox', path, '-' ], { encoding: 'utf8' } );
		const found = [ ...words.matchAll( /<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>[^<]*DWG-(ST\d{3})[^<]*<\/word>/g ) ].map( m => ( { x: +m[ 1 ], y: +m[ 2 ], sheet: m[ 3 ] } ) );
		// The title block is along the bottom, right of the references list.
		const bottom = Math.max( ...found.map( w => w.y ), 0 );
		return found.filter( w => w.y > bottom - 40 ).sort( ( a, b ) => b.x - a.x )[ 0 ]?.sheet ?? null;

	} catch {

		throw new Error( 'pdftotext (poppler) is needed to tell the sheets apart; or give them with --sheets ST007,ST005,...' );

	}

}

function viewOf( poly ) {

	const cx = poly.pts.reduce( ( s, p ) => s + p[ 0 ], 0 ) / poly.pts.length;
	const cy = poly.pts.reduce( ( s, p ) => s + p[ 1 ], 0 ) / poly.pts.length;
	return Object.keys( VIEWS ).find( key => {

		const { sheet, box: [ x0, y0, x1, y1 ] } = VIEWS[ key ];
		return sheet === poly.sheet && cx >= x0 - 5 && cx <= x1 + 5 && cy >= y0 - 5 && cy <= y1 + 5;

	} ) ?? null;

}

// ---------- The model ----------

async function readSite( path ) {

	const doc = await new NodeIO().read( path );
	// The structure the areas are on (not the building, conveyors or ground), as the build has it:
	// on the drawings' grid (scripts/b2d2-structure.mjs).
	const names = { c31: 'C31 gallery', pit: 'Transfer pit', c32: 'C32 tunnel', steel: 'Steel plates at grade', beams: 'Beams' };
	const site = {};
	for ( const mesh of doc.getRoot().listMeshes() ) {

		const key = Object.keys( names ).find( k => names[ k ] === mesh.getName() );
		if ( ! key ) continue;
		const prim = mesh.listPrimitives()[ 0 ];
		site[ key ] = { positions: Float32Array.from( prim.getAttribute( 'POSITION' ).getArray() ), index: Uint32Array.from( prim.getIndices().getArray() ) };

	}

	const meshes = [];
	for ( const [ key, { positions, index } ] of Object.entries( correctStructure( site ) ) ) {

		if ( key === 'steel' ) continue;
		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
		geometry.setIndex( new BufferAttribute( index, 1 ) );
		const m = new Mesh( geometry, new MeshBasicMaterial( { side: DoubleSide } ) );
		m.name = names[ key ];
		m.updateMatrixWorld();
		meshes.push( m );

	}

	return meshes;

}

// ---------- Naming, as the artifact does ----------

// Grid references, zones and areas: src/repair-geometry.js, which the twin's area editor uses too.

// The face's name: the first import's names where it has them.
function faceOf( view, zone, n, pony, x ) {

	// Sections D and E cross the pit's ends (grid 8, grid 0) as well as C32's walls.
	if ( view === 'wallD' && x > 6 ) return 'pit north wall (grid 8)';
	if ( view === 'wallS' && x < PIT_SOUTH ) return 'pit south wall (grid 0)';
	if ( pony ) return view === 'wallW' ? 'west pony wall at grade (AJ side)' : 'east pony wall at grade (AA side)';
	const [ nx, ny, nz ] = n;
	if ( ny > 0.75 ) return zone === 'pit' ? 'pit floor (B2)' : zone === 'ground' ? 'slab top' : 'floor';
	if ( ny < - 0.75 ) return zone === 'pit' ? 'pit soffit' : 'soffit';
	if ( zone === 'pit' ) return { wallE: 'pit east wall (AA side)', wallW: 'pit west wall (AJ side)' }[ view ] ?? 'pit wall';
	if ( zone === 'c32' ) return nx > 0 ? 'south wall' : 'north wall';
	if ( Math.abs( nz ) >= Math.abs( nx ) ) return nz < 0 ? 'east wall (AA side)' : 'west wall (AJ side)';
	return nx > 0 ? 'south wall (grid 0 end)' : 'north wall (grid 69 end)';

}

// ---------- Placing ----------

const raycaster = new Raycaster();
function place( poly, meshes ) {

	const view = poly.view;
	const v = VIEWS[ view ];
	const grid = poly.pts.map( ( [ x, y ] ) => [ ( x - v.ax ) / v.bx, ( y - v.ay ) / v.by ] );
	const pony = ( view === 'wallW' || view === 'wallE' ) && Math.min( ...grid.map( g => g[ 1 ] ) ) >= PONY.from;
	const rays = grid.map( ( [ p, q ] ) => rayOf( view, p, q, pony ) );
	// The face: hit at the middle of the outline, else at the first corner that hits anything.
	const mid = grid.reduce( ( s, g ) => [ s[ 0 ] + g[ 0 ] / grid.length, s[ 1 ] + g[ 1 ] / grid.length ], [ 0, 0 ] );
	let hit = null;
	for ( const ray of [ rayOf( view, ...mid, pony ), ...rays ] ) {

		raycaster.set( ray.at, ray.dir );
		raycaster.far = 60;
		hit = raycaster.intersectObjects( meshes, false )[ 0 ];
		if ( hit ) break;

	}

	if ( ! hit ) return { grid, pony, missed: true };
	const n = hit.face.normal.clone().transformDirection( hit.object.matrixWorld );
	if ( n.dot( rays[ 0 ].dir ) > 0 ) n.negate();
	// Each corner along its ray onto the face's plane.
	const pts = rays.map( ( { at, dir } ) => {

		const t = ( n.dot( hit.point ) - n.dot( at ) ) / n.dot( dir );
		return at.clone().addScaledVector( dir, t ).toArray().map( c => +c.toFixed( 3 ) );

	} );
	return { grid, pony, pts, n: n.toArray().map( c => +c.toFixed( 4 ) ), layer: hit.object.name };

}

// ---------- Run ----------

const { polys, labels } = await readPolygons( pdfPath );
const labelNotes = numberPanels( polys, labels );
const meshes = await readSite( opts.site );
const snapshot = JSON.parse( await readFile( opts.markups, 'utf8' ) );
const kept = snapshot.markups.filter( m => ! /progress/.test( m.src ?? '' ) );
const before = snapshot.markups.filter( m => /progress/.test( m.src ?? '' ) );
const src = `${ pdfPath.match( /(\d{4}\.\d{2}\.\d{2})/ )?.[ 1 ] ?? 'latest' } progress`;
const now = Date.now();

const made = [];
const skipped = [];
for ( const poly of polys ) {

	poly.view = viewOf( poly );
	if ( ! poly.view ) {

		skipped.push( `page ${ poly.page } (${ poly.sheet }): a ${ poly.colour.label } polygon outside the views (a callout?), "${ poly.contents }"` );
		continue;

	}

	const placed = place( poly, meshes );
	if ( placed.missed ) {

		skipped.push( `${ poly.sheet } ${ VIEWS[ poly.view ].name }: no face of the model there, "${ poly.contents }"` );
		continue;

	}

	const middle = placed.pts.reduce( ( s, p ) => s.map( ( c, i ) => c + p[ i ] / placed.pts.length ), [ 0, 0, 0 ] );
	const pitEnd = ( poly.view === 'wallD' && middle[ 0 ] > 6 ) || ( poly.view === 'wallS' && middle[ 0 ] < PIT_SOUTH );
	// The ground floor plan is the slab at grade, between the pony walls and the beams. Sections D and
	// E show C32's walls but where they cross the pit's ends; the B1 plan, the slab at B1 level.
	const section = poly.view === 'wallD' || poly.view === 'wallS';
	// Sections A and B over grid 0-8 below grade: the pit's side walls.
	const pitSide = ( poly.view === 'wallW' || poly.view === 'wallE' ) && ! placed.pony && middle[ 0 ] < PIT_NORTH;
	const zone = pitEnd || pitSide ? 'pit' : poly.view === 'gnd' ? 'ground' : section ? 'c32' : zoneOf( middle );
	const face = poly.view === 'gnd' ? 'ground floor slab'
		: poly.view === 'b1' && zone !== 'c31' ? 'B1 level slab (pit corner)'
			: faceOf( poly.view, zone, placed.n, placed.pony, middle[ 0 ] );
	const ps = placed.grid.map( g => g[ 0 ] ), qs = placed.grid.map( g => g[ 1 ] );
	const isPlan = [ 'gnd', 'b1', 'b2', 'ceil31', 'ceil32' ].includes( poly.view );
	const where = isPlan
		? `grid ${ numRange( Math.min( ...ps ), Math.max( ...ps ) ) } / ${ letRange( Math.min( ...qs ), Math.max( ...qs ) ) }`
		: [ 'wallW', 'wallE' ].includes( poly.view )
			? `grid ${ numRange( Math.min( ...ps ), Math.max( ...ps ) ) }, ${ fEL( Math.min( ...qs ) ) } to ${ fEL( Math.max( ...qs ) ) }`
			: `grid ${ letRange( Math.min( ...ps ), Math.max( ...ps ) ) }, ${ fEL( Math.min( ...qs ) ) } to ${ fEL( Math.max( ...qs ) ) }`;
	const measured = poly.contents.match( /([\d.]+)\s*sq\s*m/ )?.[ 1 ];
	const shift = poly.contents.match( /-\s*(Day|Night)/ )?.[ 1 ];
	made.push( {
		v: 2, kind: 'area', n: placed.n, zone, face, grid: gridRef( placed.pts ), ...( poly.no ? { no: poly.no } : {} ),
		f: {
			type: 'Exposed rebar', depth: null, depthMm: null, status: 'Chipped / hydro-demo', chipped: poly.colour.date,
			text: `Chipped ${ poly.colour.label }${ shift ? ` (${ shift.toLowerCase() } shift)` : '' }, rebar exposed; condition not assessed yet. From ${ src } markup: ${ poly.sheet } ${ VIEWS[ poly.view ].name }, ${ where }${ measured ? `; Bluebeam ${ measured } m²` : '' }.`,
		},
		// The drawing's measure, as the first import kept it (the pony walls are scaled into the model).
		photos: [], pts: placed.pts, area: measured ? +measured : +area3( placed.pts ).toFixed( 3 ), src, at: now, upd: now, by: null,
		layer: placed.layer, subject: poly.subject,
	} );

}

// Ids: an area already in the snapshot keeps its id: facing the same way, its middle within 0.6 m
// (--match; more where the drawing's outline was moved) and the nearest, closest pairs first, so a
// new area beside an old one doesn't take its id.
const centre = m => m.pts.reduce( ( s, p ) => s.map( ( c, i ) => c + p[ i ] / m.pts.length ), [ 0, 0, 0 ] );
const taken = new Set();
const pairs = [];
for ( const m of made ) for ( const o of before ) {

	const facing = o.n[ 0 ] * m.n[ 0 ] + o.n[ 1 ] * m.n[ 1 ] + o.n[ 2 ] * m.n[ 2 ] > 0.9;
	const distance = Math.hypot( ...centre( o ).map( ( v, i ) => v - centre( m )[ i ] ) );
	if ( facing && distance < Number( opts.match ) ) pairs.push( { m, o, distance } );

}

let reused = 0;
for ( const { m, o } of pairs.sort( ( a, b ) => a.distance - b.distance ) ) {

	if ( m.id || taken.has( o.id ) ) continue;
	m.id = o.id;
	m.at = o.at ?? m.at;
	m.photos = o.photos ?? [];
	taken.add( o.id );
	reused ++;

}

for ( const m of made ) {

	m.id ??= 'prog-' + createHash( 'sha1' ).update( `${ m.face } ${ centre( m ).map( v => v.toFixed( 2 ) ).join( ',' ) }` ).digest( 'hex' ).slice( 0, 16 ).toUpperCase().replace( /[0-9]/g, d => 'ABCDEFGHIJ'[ d ] );
	delete m.layer;
	delete m.subject;

}

const gone = before.filter( o => ! taken.has( o.id ) );
const byDate = {};
for ( const m of made ) {

	const d = byDate[ m.f.chipped ] ??= { count: 0, m2: 0 };
	d.count ++;
	d.m2 += m.area;

}

console.log( `${ polys.length } coloured areas in ${ pdfPath.split( '/' ).pop() }; ${ made.length } placed on the model.` );
for ( const [ date, { count, m2 } ] of Object.entries( byDate ).sort() ) console.log( `  ${ COLOURS.find( c => c.date === date ).label.padEnd( 22 ) } ${ String( count ).padStart( 3 ) } areas  ${ m2.toFixed( 2 ).padStart( 7 ) } m²` );
console.log( `  kept the id of ${ reused } areas already in the model; ${ made.length - reused } new; ${ gone.length } of the old ones not on this drawing` );
for ( const o of gone ) console.log( `    not on it any more: ${ o.face }, ${ o.area } m² (${ ( o.f?.text ?? '' ).match( /markup: ([^;]*)/ )?.[ 1 ] ?? '' })` );
for ( const s of skipped ) console.log( `  skipped: ${ s }` );
const numbered = made.filter( m => m.no ).length;
if ( labels.length ) console.log( `  ${ labels.length } panel numbers on the drawing; ${ numbered } areas numbered` );
for ( const note of labelNotes ) console.log( `    ${ note }` );

if ( ! opts[ 'dry-run' ] ) {

	snapshot.markups = [ ...kept, ...made ];
	snapshot.saved = new Date().toISOString().slice( 0, 10 );
	snapshot.progress = src;
	await writeFile( opts.markups, JSON.stringify( snapshot, null, '\t' ) + '\n' );
	console.log( `Wrote ${ snapshot.markups.length } areas to ${ opts.markups }` );

}
