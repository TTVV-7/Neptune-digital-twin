import { BUS_DRIVE, makeBus } from './bus.js';
import { COUPE_DRIVE, makeCoupe } from './coupe.js';
import { HOVERCRAFT_DRIVE, makeHovercraft } from './hovercraft.js';
import { makeMonster, MONSTER_DRIVE } from './monster.js';

// The Supporter Pass's rides, built in code: picked like the others (vehicles.js), driven only with
// the pass (pro.js). Each has its tuning ( drive, see drive.js specFor), the colour it comes in (an
// id in paint.js's SWATCHES), and a little drawing for the picker in place of a photo, its paint in
// the parts marked data-paint (which the Garage recolours).

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
		id: 'hovercraft', name: 'Hovercraft', blurb: 'Floats, slides, crosses water', pro: true, colour: 'sunburst', build: makeHovercraft, drive: HOVERCRAFT_DRIVE,
		icon: `<svg viewBox="0 0 64 40" aria-hidden="true">
			<ellipse cx="32" cy="35.5" rx="25" ry="2" fill="rgba(0,0,0,0.35)"/>
			<path d="M5 27q0-4 5-4h44q5 0 5 4 0 4-5 4H10q-5 0-5-4z" fill="#1c1e21"/>
			<path data-paint d="M4 23l5-4h21l3-4h4l2 4h19v4z" fill="#ffc21a"/>
			<path d="M44 7h6v16h-6z" fill="#c9d0d8"/><path d="M45.5 9h3v12h-3z" fill="#30343a"/>
			<path d="M51 9h2v12h-2z" fill="#9aa4b0"/>
			<circle cx="33" cy="11" r="3" fill="#ff3d6e"/><path d="M31 14h4v5h-4z" fill="#16181d"/>
		</svg>`,
	},
];
