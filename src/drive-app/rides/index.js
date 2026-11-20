import { BUS_DRIVE, makeBus } from './bus.js';
import { COUPE_DRIVE, makeCoupe } from './coupe.js';
import { HOVERCRAFT_DRIVE, makeHovercraft } from './hovercraft.js';
import { DRAGSTER_DRIVE, makeDragster } from './dragster.js';
import { makeMonster, MONSTER_DRIVE } from './monster.js';
import { makeRover, ROVER_DRIVE } from './rover.js';
import { makeSaucer, SAUCER_DRIVE } from './saucer.js';

// The Supporter Pass's rides, built in code: picked like the others (vehicles.js), driven only with
// the pass (pro.js). Each has its tuning ( drive, see drive.js specFor), the colour it comes in (an
// id in paint.js's SWATCHES), and a little drawing for the picker in place of a photo, its paint in
// the parts marked data-paint (which the Garage recolours).
// Their ids are also in catalog.js's PASS_RIDES, which the Worker's leaderboard accepts.

export const PRO_RIDES = [
	{
		id: 'sports-coupe', name: 'Sports coupe', blurb: 'Fast, grippy, drifts long', pro: true, colour: 'electric', build: makeCoupe, drive: COUPE_DRIVE,
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<path data-paint d="M3 27.5 4 22l12-3.5 9-6.5h12l9 5.5 13 1.5 1 8z" fill="#2d6bff"/>
			<path d="M25.5 13.5h6v4.5H20zM33.5 13.5h3l7 4.5h-10z" fill="#1d2633"/>
			<path d="M52 13h9v2h-9z" fill="#1d2633"/><path d="M54 15h1.5v3H54z" fill="#1d2633"/>
			<circle cx="14" cy="28" r="6" fill="#111317"/><circle cx="50" cy="28" r="6.2" fill="#111317"/>
			<circle cx="14" cy="28" r="3" fill="#c9d0d8"/><circle cx="50" cy="28" r="3.1" fill="#c9d0d8"/>
			<path d="M4 22h5v2H4z" fill="#f2f8ff"/>
		</svg>`,
	},
	{
		id: 'monster-truck', name: 'Monster truck', blurb: 'Huge air, easy flips', pro: true, colour: 'lime', build: makeMonster, drive: MONSTER_DRIVE,
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<path data-paint d="M6 22V15.5l3-2h13l5-6h11l3 6h17l1 2V22z" fill="#7ed321"/>
			<path d="M28 9h5v4.5h-7.5zM35 9h2.5l2.5 4.5h-5z" fill="#1d2633"/>
			<path d="M43 6h1.5v8H43zM43 6h9v1.5h-9z" fill="#9aa4b0"/>
			<path d="M10 21h44v2H10z" fill="#30343a"/>
			<circle cx="15" cy="28" r="10" fill="#111317"/><circle cx="49" cy="28" r="10" fill="#111317"/>
			<circle cx="15" cy="28" r="4.5" fill="#c9d0d8"/><circle cx="49" cy="28" r="4.5" fill="#c9d0d8"/>
			<circle cx="15" cy="28" r="1.6" fill="#30343a"/><circle cx="49" cy="28" r="1.6" fill="#30343a"/>
		</svg>`,
	},
	{
		id: 'city-bus', name: 'City bus', blurb: 'Heavy, slow, unstoppable', pro: true, colour: 'royal', build: makeBus, drive: BUS_DRIVE,
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<path d="M2 9.5q0-2 2-2h56q2 0 2 2V13H2z" fill="#f2f4f6"/>
			<path data-paint d="M2 13h60v16H2z" fill="#2440c9"/>
			<path d="M4 14h4v8H4zM9.5 14h7v6h-7zM18 14h7v6h-7zM26.5 14h7v6h-7zM35 14h7v6h-7zM43.5 14h7v6h-7zM52 14h8v6h-8z" fill="#1d2633"/>
			<path d="M9 20.5h3v8H9zM38 20.5h3v8h-3z" fill="#1d2633"/>
			<circle cx="14" cy="30" r="4.5" fill="#111317"/><circle cx="48" cy="30" r="4.5" fill="#111317"/>
			<circle cx="14" cy="30" r="1.8" fill="#c9d0d8"/><circle cx="48" cy="30" r="1.8" fill="#c9d0d8"/>
		</svg>`,
	},
	{
		id: 'hovercraft', name: 'Hovercraft', blurb: 'Floats, slides, sprays over water', pro: true, colour: 'sunburst', build: makeHovercraft, drive: HOVERCRAFT_DRIVE,
		// No wheels: the Garage's rim colour goes on its fan's duct and rudders.
		rims: 'Trim',
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<ellipse cx="32" cy="35.5" rx="25" ry="2" fill="rgba(0,0,0,0.35)"/>
			<path d="M5 27q0-4 5-4h44q5 0 5 4 0 4-5 4H10q-5 0-5-4z" fill="#1c1e21"/>
			<path data-paint d="M4 23l5-4h21l3-4h4l2 4h19v4z" fill="#ffc21a"/>
			<path d="M44 7h6v16h-6z" fill="#c9d0d8"/><path d="M45.5 9h3v12h-3z" fill="#30343a"/>
			<path d="M51 9h2v12h-2z" fill="#9aa4b0"/>
			<circle cx="33" cy="11" r="3" fill="#ff3d6e"/><path d="M31 14h4v5h-4z" fill="#16181d"/>
		</svg>`,
	},
	{
		id: 'lunar-rover', name: 'Lunar rover', blurb: 'Six wheels, floaty, made for the Moon', pro: true, colour: 'white', build: makeRover, drive: ROVER_DRIVE,
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<path d="M40 4h1.5v14H40z" fill="#9aa4b0"/><path d="M34 3q7 6 14 0z" fill="#e8e2cf"/>
			<path d="M14 8h1.2v12H14z" fill="#9aa4b0"/><path d="M11 6h7v3h-7z" fill="#eef1f4"/>
			<path d="M38 13l18 2-1 3-18-2z" fill="#1b2a55"/>
			<path data-paint d="M4 19h56v5H4z" fill="#eef1f4"/>
			<path d="M46 16h12v3H46z" fill="#d4a640"/><path d="M6 16h12v3H6z" fill="#d4a640"/>
			<circle cx="26" cy="12" r="3.2" fill="#f4f6f8"/><path d="M24 12.5h4.5v1.5H24z" fill="#c99a2e"/>
			<path d="M23 15h6v5h-6z" fill="#e9ecef"/>
			<circle cx="10" cy="30" r="5.5" fill="#8f969d"/><circle cx="32" cy="30" r="5.5" fill="#8f969d"/><circle cx="54" cy="30" r="5.5" fill="#8f969d"/>
			<circle cx="10" cy="30" r="2.4" fill="#26292e"/><circle cx="32" cy="30" r="2.4" fill="#26292e"/><circle cx="54" cy="30" r="2.4" fill="#26292e"/>
			<circle cx="61" cy="9" r="1.6" fill="#ffb02e"/><path d="M60.5 10h1v9h-1z" fill="#26292e"/>
		</svg>`,
	},
	{
		id: 'flying-saucer', name: 'Flying saucer', blurb: 'Hovers, banks, beams down', pro: true, colour: 'gunmetal', build: makeSaucer, drive: SAUCER_DRIVE,
		// No wheels: the Garage's rim colour goes on the ring of lights round its edge.
		rims: 'Light ring',
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<path d="M24 24h16l9 14H15z" fill="#9ff3ff" opacity="0.35"/>
			<path d="M20 15q12-14 24 0z" fill="#1a2633" opacity="0.8"/>
			<circle cx="32" cy="12" r="3" fill="#7fe8c4"/>
			<path data-paint d="M3 19q29-10 58 0v1H3z" fill="#4b525c"/>
			<path d="M3 20h58q-4 3-12 4.5H15Q7 23 3 20z" fill="#3a4048"/>
			<path d="M2 19h60v2H2z" fill="#d5dbe1"/>
			<circle cx="8" cy="20" r="1.3" fill="#ff5cf0"/><circle cx="18" cy="20" r="1.3" fill="#7fe8ff"/><circle cx="28" cy="20" r="1.3" fill="#ff5cf0"/>
			<circle cx="38" cy="20" r="1.3" fill="#7fe8ff"/><circle cx="48" cy="20" r="1.3" fill="#ff5cf0"/><circle cx="57" cy="20" r="1.3" fill="#7fe8ff"/>
		</svg>`,
	},
	{
		id: 'rocket-dragster', name: 'Rocket dragster', blurb: 'Quickest off the line, turns like a train', pro: true, colour: 'red', build: makeDragster, drive: DRAGSTER_DRIVE,
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<path d="M58 21l6-2.5v6z" fill="#ff8a1a"/><path d="M58 21l4-1.2v2.4z" fill="#fff1c2"/>
			<path d="M38 18h20v6H38z" fill="#e8edf2"/><path d="M44 18h1.5v6H44zM50 18h1.5v6H50z" fill="#d81e2c"/>
			<path d="M42 8h16l-1 2.5H42z" fill="#1c1e22"/><path d="M45 10h1.2v8H45zM53 10h1.2v8H53z" fill="#1c1e22"/>
			<path data-paint d="M1 29l1-3 22-3 6-3h6l3 4h18v6H1z" fill="#d81e2c"/>
			<path d="M26 20q4-5 8 0z" fill="#1a2633" opacity="0.8"/>
			<circle cx="6" cy="31" r="3" fill="#111317"/><circle cx="48" cy="29" r="8" fill="#111317"/>
			<circle cx="6" cy="31" r="1.2" fill="#c9d0d8"/><circle cx="48" cy="29" r="3.5" fill="#c9d0d8"/>
		</svg>`,
	},
];
