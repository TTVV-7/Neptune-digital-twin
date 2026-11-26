// World Drive Build's blank sites (docs/build.md, "Blank sites"): a project with no Google 3D map
// at all, laid out on a plain ground of its own (blank-ground.js) with a metre grid and north up.
// Nothing about it asks Google for anything, so it never spends one of the plan's 3D map views.
//
// The editor opens one with ?blank (flat), or ?blank=<slope>,<toward> for ground that falls
// <slope> % toward the compass heading <toward> (degrees clockwise from north), e.g. ?blank=2,90
// falls 2 % to the east. A blank project's layout says so: { ..., blank: { slope, toward } }, and
// its site (the place's name) is BLANK_NAME. It still needs a point on the globe for the editor's
// east and north (geo.js): BLANK_AT, which is never shown as a place.
//
// Used by the editor, the dashboard and the Worker (worker/drive/build.js, mcp.js): nothing here
// needs a browser.

export const BLANK_NAME = 'Blank site';
export const BLANK_AT = { lat: 0, lon: 0 };
// The steepest a blank site's ground may fall, in %.
export const MAX_SLOPE = 10;

// A slope as kept: { slope (%, 0 to MAX_SLOPE, to a tenth), toward (whole degrees, 0 to 359) }.
// Anything else is flat ground facing north.
export function cleanSlope( value ) {

	const slope = Number( value?.slope );
	const toward = Number( value?.toward );
	return {
		slope: Number.isFinite( slope ) ? Math.round( Math.min( MAX_SLOPE, Math.max( 0, slope ) ) * 10 ) / 10 : 0,
		toward: Number.isFinite( toward ) ? ( ( Math.round( toward ) % 360 ) + 360 ) % 360 : 0,
	};

}

// The address's ?blank value: '' for flat ground, else '<slope>,<toward>'.
export function slopeParam( value ) {

	const { slope, toward } = cleanSlope( value );
	return slope > 0 ? `${ slope },${ toward }` : '';

}

// The slope an address's ?blank value says (see slopeParam).
export function readSlopeParam( text ) {

	const [ slope, toward ] = String( text ?? '' ).split( ',' ).map( Number );
	return cleanSlope( { slope, toward } );

}

// A layout's (or the server's summary of one) blank site, cleaned, or null for a site on the map.
// blank: true (flat) is taken too, for a layout written by hand.
export function blankOf( layout ) {

	const blank = layout?.blank;
	if ( blank === true ) return cleanSlope( null );
	return blank && typeof blank === 'object' ? cleanSlope( blank ) : null;

}

// "Flat" or "Falls 2 % to the east" (to the nearest of eight compass points).
export function describeSlope( value ) {

	const { slope, toward } = cleanSlope( value );
	if ( ! slope ) return 'Flat';
	return `Falls ${ slope } % to the ${ compassPoint( toward ) }`;

}

const POINTS = [ 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west' ];

export function compassPoint( degrees ) {

	return POINTS[ Math.round( ( ( degrees % 360 ) + 360 ) % 360 / 45 ) % 8 ];

}
