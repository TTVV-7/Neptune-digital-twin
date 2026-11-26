import { Color, Fog, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { describeSlope } from './blank-site.js';

// A blank site's ground (blank-site.js): no Google 3D map, but plain light earth as on a site plan,
// with a grid in metres (faint lines every metre, stronger ones every ten, and the two through the
// site point, east and north, stronger again), falling as the project's slope says. It's the
// stand-in ground terrain.js takes over (takeOverStandIn) for pits, piles and flatten areas: its
// heightAt says how high it is anywhere, and its grid is drawn on their untouched ground too
// (SITE_GRID_GLSL, in terrain.js's surface material), so there's no seam round them. Lines too
// close together to see on screen fade away, rather than shimmer.

// The ground's colour, and its lines'.
export const BLANK_GROUND_COLOUR = 0xc2b79f;
const LINE_COLOUR = 0x4f4636;
// Across, in metres; the fog takes its edge away well before it.
const SIZE = 8000;
// Metres between the faint lines and between the strong ones.
const MINOR = 1;
const MAJOR = 10;

// The grid, as GLSL: siteGrid( colour, p ) is colour with the grid's lines drawn over it, at p, a
// point on the ground in the editor's metres (x west, z north). Its uniforms: siteGridUniforms().
export const SITE_GRID_GLSL = /* glsl */`
uniform vec3 siteGridLine;
uniform float siteGridMinor;
uniform float siteGridMajor;

// How much a point is on a line every \`spacing\` m, \`width\` px wide: lines in each direction faded
// out as they get too close together on screen to tell apart.
float siteGridAt( vec2 p, float spacing, float width ) {

	vec2 c = p / spacing;
	vec2 w = fwidth( c );
	vec2 on = 1.0 - min( abs( fract( c - 0.5 ) - 0.5 ) / max( w * width, 1e-6 ), 1.0 );
	on *= 1.0 - smoothstep( 0.06, 0.25, w );
	return max( on.x, on.y );

}

vec3 siteGrid( vec3 colour, vec2 p ) {

	float minor = siteGridAt( p, siteGridMinor, 1.0 ) * 0.11;
	float major = siteGridAt( p, siteGridMajor, 1.4 ) * 0.34;
	vec2 w = fwidth( p );
	vec2 a = 1.0 - min( abs( p ) / max( w * 2.0, 1e-6 ), 1.0 );
	float axis = max( a.x, a.y ) * 0.55;
	return mix( colour, siteGridLine, max( max( minor, major ), axis ) );

}
`;

export function siteGridUniforms() {

	return {
		siteGridLine: { value: new Color( LINE_COLOUR ) },
		siteGridMinor: { value: MINOR },
		siteGridMajor: { value: MAJOR },
	};

}

// The ground: a Group holding the land (which terrain.js takes over), with userData.heightAt( x, z )
// (its height anywhere, metres) and userData.siteGrid (true: terrain.js draws SITE_GRID_GLSL on its
// surfaces as well). blank: { slope (%), toward (degrees from north it falls to) }.
export function createBlankGround( blank ) {

	const group = new Group();
	group.name = 'blank-site-ground';
	const heightAt = slopeHeight( blank );

	const geometry = new PlaneGeometry( SIZE, SIZE, 1, 1 );
	geometry.rotateX( - Math.PI / 2 );
	const position = geometry.attributes.position;
	for ( let i = 0; i < position.count; i ++ ) position.setY( i, heightAt( position.getX( i ), position.getZ( i ) ) );
	geometry.computeVertexNormals();
	const land = new Mesh( geometry, createGroundMaterial() );
	land.name = 'blank site';
	group.add( land );
	group.userData.heightAt = heightAt;
	group.userData.siteGrid = true;
	return group;

}

// Height (m) at x, z of ground through the site point falling `slope` % toward `toward`.
export function slopeHeight( { slope = 0, toward = 0 } = {} ) {

	const fall = slope / 100;
	const h = toward * Math.PI / 180;
	// East is -x, north is +z (geo.js).
	const [ east, north ] = [ Math.sin( h ), Math.cos( h ) ];
	return ( x, z ) => - fall * ( - x * east + z * north );

}

// Plain, lit like any ground, with the grid drawn on it. Normals come from the geometry: a sloping
// site is lit as one.
function createGroundMaterial() {

	const material = new MeshStandardMaterial( { color: BLANK_GROUND_COLOUR, roughness: 1, metalness: 0 } );
	const uniforms = siteGridUniforms();
	material.onBeforeCompile = shader => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec2 vSiteGround;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvSiteGround = ( modelMatrix * vec4( position, 1.0 ) ).xz;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', `#include <common>\nvarying vec2 vSiteGround;\n${ SITE_GRID_GLSL }` )
			.replace( '#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = siteGrid( diffuseColor.rgb, vSiteGround );' );

	};
	material.customProgramCacheKey = () => 'blank-site-ground';
	return material;

}

// The haze far off, so the ground's edge melts into the sky rather than ending in a line.
export function blankFog( scene ) {

	scene.fog = new Fog( scene.background ?? new Color( 0xbfd9ee ), 1400, 3800 );

}

const _forward = new Vector3();
const _up = new Vector3();

// The north arrow (bottom right): a dial that turns as the view does, its arrow always pointing
// north on screen, and what the ground does under it ("Flat", "Falls 2 % to the east"). Returns
// update( camera ), for every frame.
export function setUpNorthArrow( blank ) {

	const dial = document.createElement( 'div' );
	dial.id = 'north-arrow';
	dial.setAttribute( 'role', 'img' );
	dial.innerHTML = `
		<svg viewBox="-32 -32 64 64" width="64" height="64" aria-hidden="true">
			<circle r="29" class="ring"/>
			<g class="needle">
				<path d="M0 -24 L7 4 L0 0 L-7 4 Z" class="north"/>
				<path d="M0 24 L7 4 L0 0 L-7 4 Z" class="south"/>
				<text y="-13" text-anchor="middle" class="n">N</text>
			</g>
		</svg>
		<span class="ground"></span>`;
	const needle = dial.querySelector( '.needle' );
	dial.querySelector( '.ground' ).textContent = describeSlope( blank );
	dial.setAttribute( 'aria-label', `North arrow. Blank site: ${ describeSlope( blank ).toLowerCase() }` );
	dial.title = 'North, as the view is turned. Blank site: no map; grid lines every 1 m and 10 m';
	document.body.append( dial );
	let shown = null;

	return camera => {

		// Which way the view looks, on the ground: straight down, which way the screen's top is.
		camera.getWorldDirection( _forward );
		_up.set( 0, 1, 0 ).applyQuaternion( camera.quaternion );
		const look = Math.hypot( _forward.x, _forward.z ) > 0.2 ? _forward : _up;
		// Heading clockwise from north, east being -x.
		const heading = Math.atan2( - look.x, look.z ) * 180 / Math.PI;
		const turn = Math.round( - heading * 2 ) / 2;
		if ( turn === shown ) return;
		shown = turn;
		needle.setAttribute( 'transform', `rotate(${ turn })` );

	};

}
