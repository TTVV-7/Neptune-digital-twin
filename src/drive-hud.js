// A driving HUD any app can use with a Driver (drive.js): the speed, a boost gauge (which flashes
// when something tops it up), FLYING with the height, SUPERSONIC, drift and jump readouts, big messages ("Crash!", "1.2 s air") and, on a touch screen,
// buttons to drive with. With kart handling a DRIFT button (SPACE) sits under the speed, and its
// chip lights up while drifting with the mini-turbo's charge. With stunts (crash: 'launch') a hit
// pops up a word ("WHAM!"), tricks pop up as they're landed, and the score, its combo multiplier
// and the best score show under the speed. It makes its own elements and styles inside `parent`,
// so it needs nothing in the page. Give it to the Driver as `hud`; the Driver calls attach() to
// wire up the buttons.
//
// Where it sits can be moved with CSS custom properties on the page: --drive-hud-top,
// --drive-hud-bottom and --drive-hud-side (insets in px, e.g. to clear a map credit line).

const STYLE_ID = 'drive-hud-style';
// The DRIFT buttons' charge bar, in the colour of the boost the drift has earned so far (as its
// sparks are: see drive-fx.js).
const CHARGE_COLOURS = [ '#ffffff', '#ffc83d', '#3dffd8', '#ff3df0' ];
// The speed the bar under the number fills at (km/h).
const SPEED_SCALE = 200;
// How long a message stays (ms), a little longer for a long one.
const FLASH_TIME = 1500;
const FLASH_PER_CHAR = 30;
// How long a hit's word and landed tricks stay (ms), and a top-up's on the boost gauge.
const POP_TIME = 750;
const REFUEL_TIME = 700;
const TRICKS_TIME = 2200;
// Messages that name keys, as they read on a touch screen, which has the buttons instead.
const TOUCH_WORDS = [
	[ 'Hold Shift to fly or press R', 'Hold FLY, or tap ↺' ],
	[ 'Press R', 'Tap ↺' ],
	[ 'A/D spin · W/S flip · Q/E roll', '◀ ▶ spin · GAS/BRAKE flip · DRIFT + ◀ ▶ roll' ],
];

const CSS = `
.dhud {
	--accent: #ffd23f;
	--boost: #ff5a1f;
	--fly: #3de0ff;
	position: absolute;
	inset: 0;
	z-index: 1003;
	pointer-events: none;
	font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	color: #fff;
	-webkit-user-select: none;
	user-select: none;
}

.dhud.dhud-fixed {
	position: fixed;
}

.dhud[hidden],
.dhud [hidden] {
	display: none !important;
}

.dhud .dhud-cluster {
	position: absolute;
	right: var( --drive-hud-side, 16px );
	bottom: var( --drive-hud-bottom, 40px );
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 6px;
	min-width: 190px;
	padding: 12px 16px 12px;
	border-radius: 16px;
	background: rgba( 12, 16, 24, 0.62 );
	box-shadow: 0 6px 24px rgba( 0, 0, 0, 0.25 );
	backdrop-filter: blur( 6px );
}

.dhud .dhud-name {
	max-width: 220px;
	overflow: hidden;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.7;
}

.dhud .dhud-speed {
	display: flex;
	align-items: baseline;
	gap: 6px;
	line-height: 0.9;
}

.dhud .dhud-number {
	font-size: 64px;
	font-weight: 800;
	font-style: italic;
	font-variant-numeric: tabular-nums;
	letter-spacing: -0.03em;
}

.dhud .dhud-unit {
	font-size: 14px;
	font-weight: 700;
	opacity: 0.75;
}

.dhud .dhud-bar {
	position: relative;
	width: 100%;
	height: 6px;
	overflow: hidden;
	border-radius: 3px;
	background: rgba( 255, 255, 255, 0.15 );
}

.dhud .dhud-bar i {
	position: absolute;
	inset: 0 auto 0 0;
	width: 0;
	border-radius: 3px;
	background: var( --accent );
}

.dhud.boosting .dhud-speed-bar i {
	background: linear-gradient( 90deg, var( --accent ), var( --boost ) );
}

.dhud .dhud-boost {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
}

.dhud .dhud-boost b {
	font-size: 11px;
	font-weight: 800;
	letter-spacing: 0.08em;
}

.dhud .dhud-boost .dhud-bar {
	flex: 1;
	height: 10px;
	border-radius: 5px;
}

.dhud .dhud-boost .dhud-bar i {
	background: linear-gradient( 90deg, #ff2d55, var( --boost ), var( --accent ) );
}

.dhud .dhud-boost.ready b {
	color: var( --accent );
}

.dhud.boosting .dhud-boost b {
	color: var( --boost );
}

.dhud .dhud-stats {
	font-size: 12px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	opacity: 0.8;
}

.dhud .dhud-badges {
	display: flex;
	gap: 6px;
}

.dhud .dhud-badge {
	padding: 3px 9px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 800;
	letter-spacing: 0.06em;
	color: #08121a;
}

.dhud .dhud-fly {
	background: var( --fly );
}

/* Supersonic: white-hot, arriving with a jolt. */
.dhud .dhud-sonic {
	background: linear-gradient( 100deg, #ffffff, #bfe4ff 45%, #ffd23f );
	box-shadow: 0 0 16px rgba( 191, 228, 255, 0.9 );
	font-style: italic;
	animation: dhud-sonic 0.45s ease-out;
}

@keyframes dhud-sonic {
	from {
		opacity: 0;
		transform: scale( 1.8 );
	}
}

/* The gauge topped up (a boost pad): a ring of light round it, and what it took by BOOST. */
.dhud .dhud-boost.refuel .dhud-bar {
	animation: dhud-refuel 0.5s ease-out;
}

.dhud .dhud-boost.refuel b {
	color: var( --accent );
}

@keyframes dhud-refuel {
	from {
		box-shadow: 0 0 0 0 rgba( 255, 210, 63, 0.95 );
	}
	to {
		box-shadow: 0 0 0 9px rgba( 255, 210, 63, 0 );
	}
}

/* The DRIFT chip, lit up while drifting, filling with the mini-turbo's charge in its colour. */
.dhud .dhud-drift {
	position: relative;
	overflow: hidden;
	background: rgba( 255, 255, 255, 0.85 );
	box-shadow: 0 0 14px rgba( 255, 255, 255, 0.55 );
}

.dhud .dhud-drift i {
	position: absolute;
	inset: auto auto 0 0;
	width: var( --charge, 0% );
	height: 3px;
	background: rgba( 8, 18, 26, 0.65 );
}

.dhud .dhud-drift[data-level="1"] {
	background: #ffc83d;
	box-shadow: 0 0 14px #ffc83d;
}

.dhud .dhud-drift[data-level="2"] {
	background: #3dffd8;
	box-shadow: 0 0 16px #3dffd8;
}

.dhud .dhud-drift[data-level="3"] {
	background: #ff3df0;
	box-shadow: 0 0 18px #ff3df0;
}

/* Stunts: the score, the combo multiplier and the best, small under the speed. */
.dhud .dhud-score {
	display: flex;
	align-items: baseline;
	gap: 8px;
	font-size: 12px;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	letter-spacing: 0.04em;
}

.dhud .dhud-points {
	font-size: 16px;
	font-weight: 800;
}

.dhud .dhud-mult {
	padding: 0 6px;
	border-radius: 999px;
	background: rgba( 255, 255, 255, 0.15 );
	font-weight: 800;
}

.dhud .dhud-mult.on {
	background: var( --accent );
	color: #08121a;
}

.dhud .dhud-best {
	opacity: 0.6;
}

/* The DRIFT button for a mouse (touch screens have theirs among the driving buttons): hold it and
   steer. It fills with the mini-turbo's charge, and lights up while Space is held too. */
.dhud .dhud-drift-hold {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	width: 100%;
	height: 32px;
	overflow: hidden;
	border: 2px solid rgba( 255, 255, 255, 0.35 );
	border-radius: 10px;
	background: rgba( 255, 255, 255, 0.08 );
	color: #fff;
	font: 800 13px/1 system-ui, -apple-system, sans-serif;
	letter-spacing: 0.08em;
	cursor: pointer;
	pointer-events: auto;
	touch-action: none;
}

.dhud .dhud-drift-hold kbd {
	font-size: 10px;
	letter-spacing: 0.04em;
}

.dhud .dhud-drift-hold.down,
.dhud .dhud-drift-hold.held {
	border-color: #fff;
	background: rgba( 255, 210, 63, 0.85 );
	color: #08121a;
}

.dhud .dhud-drift-hold i,
.dhud .dhud-touch .drift i {
	position: absolute;
	inset: auto auto 0 0;
	width: var( --charge, 0% );
	height: 4px;
	background: var( --charge-colour, #fff );
	pointer-events: none;
}

.dhud.touch .dhud-drift-hold {
	display: none;
}

/* A hit's word: big, tilted and gone in a moment, bursting off the vehicle (in the middle of the
   view, below the tricks). */
.dhud .dhud-pop {
	position: absolute;
	top: 58%;
	left: 50%;
	font-size: clamp( 34px, 7vw, 80px );
	font-weight: 900;
	font-style: italic;
	letter-spacing: -0.02em;
	color: var( --accent );
	-webkit-text-stroke: 3px #1a1206;
	paint-order: stroke fill;
	text-shadow: 0 6px 0 rgba( 0, 0, 0, 0.35 );
	white-space: nowrap;
	transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) );
	animation: dhud-wham 0.75s ease-out forwards;
}

.dhud .dhud-pop.wipeout {
	color: #ff5a5a;
	font-size: clamp( 28px, 5.5vw, 60px );
}

@keyframes dhud-wham {
	0% {
		opacity: 0;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 0.3 ) );
	}
	18% {
		opacity: 1;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 1.2 ) );
	}
	35% {
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) );
	}
	70% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		transform: translate( -50%, -60% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 1.05 ) );
	}
}

/* Tricks: what it's doing in the air (dim), then what it landed and the points (bright), or what a
   wipeout lost (struck through). */
.dhud .dhud-tricks {
	position: absolute;
	top: calc( var( --drive-hud-top, 16px ) + 18vh + clamp( 44px, 8vw, 72px ) );
	left: 0;
	right: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	padding: 0 16px;
	text-align: center;
	text-shadow: 0 2px 0 rgba( 0, 0, 0, 0.35 ), 0 4px 14px rgba( 0, 0, 0, 0.45 );
}

.dhud .dhud-tricks b {
	font-size: clamp( 20px, 3.6vw, 32px );
	font-weight: 800;
	font-style: italic;
	animation: dhud-pop 0.25s ease-out both;
	animation-delay: calc( var( --i, 0 ) * 0.09s );
}

.dhud .dhud-tricks .points {
	color: var( --accent );
	font-size: clamp( 16px, 2.6vw, 22px );
}

.dhud .dhud-tricks.pending b {
	opacity: 0.6;
	animation: none;
}

.dhud .dhud-tricks.lost b {
	color: #ff7a7a;
	text-decoration: line-through;
}

.dhud .dhud-tricks.lost .points {
	text-decoration: none;
}

.dhud .dhud-flash {
	position: absolute;
	top: calc( var( --drive-hud-top, 16px ) + 18vh );
	left: 0;
	right: 0;
	padding: 0 16px;
	text-align: center;
	font-size: clamp( 28px, 6vw, 52px );
	font-weight: 800;
	font-style: italic;
	letter-spacing: -0.01em;
	text-shadow: 0 2px 0 rgba( 0, 0, 0, 0.35 ), 0 4px 18px rgba( 0, 0, 0, 0.45 );
}

.dhud .dhud-flash.long {
	font-size: clamp( 20px, 4vw, 30px );
}

.dhud .dhud-flash:not( [hidden] ) {
	animation: dhud-pop 0.25s ease-out;
}

@keyframes dhud-pop {
	from {
		opacity: 0;
		transform: scale( 0.7 );
	}
}

/* Bottom left, out of the way of the vehicle in the middle of the view. */
.dhud .dhud-keys {
	position: absolute;
	left: var( --drive-hud-side, 16px );
	bottom: var( --drive-hud-bottom, 40px );
	max-width: min( 400px, calc( 100% - 280px ) );
	padding: 6px 12px;
	border-radius: 10px;
	background: rgba( 12, 16, 24, 0.55 );
	font-size: 12px;
	line-height: 1.7;
	opacity: 0.9;
}

.dhud .dhud-keys span {
	white-space: nowrap;
}

.dhud kbd {
	display: inline-block;
	min-width: 1.4em;
	padding: 0 5px;
	border-radius: 4px;
	background: rgba( 255, 255, 255, 0.18 );
	font: inherit;
	font-weight: 800;
}

.dhud .dhud-touch {
	display: none;
}

/* Touch screens: the readouts move to the top, and buttons to drive with fill the bottom corners. */
.dhud.touch .dhud-keys {
	display: none;
}

.dhud.touch .dhud-cluster {
	top: var( --drive-hud-top, 12px );
	bottom: auto;
	right: 50%;
	transform: translateX( 50% );
	min-width: 150px;
	padding: 8px 12px;
	align-items: center;
}

/* Messages and tricks start under the readouts there (18vh down, a phone on its side had them over
   the readouts), the tricks far enough down to clear a hint on two lines. */
.dhud.touch .dhud-flash {
	top: max( calc( var( --drive-hud-top, 12px ) + 18vh ), calc( var( --drive-hud-top, 12px ) + 148px ) );
}

.dhud.touch .dhud-tricks {
	top: calc( max( calc( var( --drive-hud-top, 12px ) + 18vh ), calc( var( --drive-hud-top, 12px ) + 148px ) ) + 54px );
}

.dhud.touch .dhud-number {
	font-size: 40px;
}

.dhud.touch .dhud-stats,
.dhud.touch .dhud-name,
.dhud.touch .dhud-best {
	display: none;
}

.dhud.touch .dhud-touch {
	display: block;
}

.dhud .dhud-touch button {
	position: absolute;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 2px solid rgba( 255, 255, 255, 0.35 );
	border-radius: 18px;
	background: rgba( 12, 16, 24, 0.5 );
	color: #fff;
	font: 800 14px/1 system-ui, -apple-system, sans-serif;
	letter-spacing: 0.05em;
	pointer-events: auto;
	touch-action: none;
	-webkit-tap-highlight-color: transparent;
}

.dhud .dhud-touch button.down {
	background: rgba( 255, 210, 63, 0.85 );
	border-color: #fff;
	color: #08121a;
}

.dhud .dhud-touch .left,
.dhud .dhud-touch .right {
	bottom: var( --drive-hud-bottom, 28px );
	width: 76px;
	height: 76px;
	font-size: 28px;
}

.dhud .dhud-touch .left {
	left: var( --drive-hud-side, 16px );
}

.dhud .dhud-touch .right {
	left: calc( var( --drive-hud-side, 16px ) + 88px );
}

.dhud .dhud-touch .gas,
.dhud .dhud-touch .brake,
.dhud .dhud-touch .drift,
.dhud .dhud-touch .booster,
.dhud .dhud-touch .fly {
	width: 76px;
}

/* Two columns at the bottom right: GAS with DRIFT over it at the edge, BRAKE, BOOST and FLY inside. */
.dhud .dhud-touch .gas,
.dhud .dhud-touch .drift {
	right: var( --drive-hud-side, 16px );
}

.dhud .dhud-touch .brake,
.dhud .dhud-touch .booster,
.dhud .dhud-touch .fly {
	right: calc( var( --drive-hud-side, 16px ) + 88px );
}

.dhud .dhud-touch .gas {
	bottom: var( --drive-hud-bottom, 28px );
	height: 120px;
	background: rgba( 40, 180, 90, 0.55 );
}

.dhud .dhud-touch .drift {
	bottom: calc( var( --drive-hud-bottom, 28px ) + 132px );
	height: 76px;
}

.dhud .dhud-touch .brake {
	bottom: var( --drive-hud-bottom, 28px );
	height: 76px;
	background: rgba( 220, 50, 60, 0.5 );
}

.dhud .dhud-touch .booster {
	bottom: calc( var( --drive-hud-bottom, 28px ) + 88px );
	height: 56px;
	font-size: 12px;
	background: rgba( 255, 90, 31, 0.55 );
}

.dhud .dhud-touch .fly {
	bottom: calc( var( --drive-hud-bottom, 28px ) + 156px );
	height: 56px;
	font-size: 12px;
	background: rgba( 61, 224, 255, 0.4 );
}

/* Reset and camera down the right edge at the top, clear of the readouts in the middle. */
.dhud .dhud-touch .reset,
.dhud .dhud-touch .camera {
	right: var( --drive-hud-side, 16px );
	width: 52px;
	height: 44px;
	font-size: 12px;
}

.dhud .dhud-touch .reset {
	top: var( --drive-hud-top, 12px );
	font-size: 22px;
}

.dhud .dhud-touch .camera {
	top: calc( var( --drive-hud-top, 12px ) + 52px );
}

@media ( max-width: 760px ) {

	.dhud .dhud-keys {
		display: none;
	}

}

/* A phone held upright: the vehicle fills the middle of the bottom half, so BOOST and FLY go up the
   edge above DRIFT, leaving only BRAKE (below the vehicle) in the inner column. */
@media ( orientation: portrait ) and ( max-width: 520px ) {

	.dhud .dhud-touch .booster,
	.dhud .dhud-touch .fly {
		right: var( --drive-hud-side, 16px );
	}

	.dhud .dhud-touch .booster {
		bottom: calc( var( --drive-hud-bottom, 28px ) + 220px );
	}

	.dhud .dhud-touch .fly {
		bottom: calc( var( --drive-hud-bottom, 28px ) + 288px );
	}

}

/* A phone on its side: shorter buttons, so DRIFT stays clear of CAM at the top right. */
@media ( max-height: 420px ) {

	.dhud .dhud-touch .gas {
		height: 96px;
	}

	.dhud .dhud-touch .drift {
		bottom: calc( var( --drive-hud-bottom, 28px ) + 108px );
		height: 60px;
	}

	.dhud .dhud-touch .brake {
		height: 60px;
	}

	.dhud .dhud-touch .booster {
		bottom: calc( var( --drive-hud-bottom, 28px ) + 72px );
		height: 48px;
	}

	.dhud .dhud-touch .fly {
		bottom: calc( var( --drive-hud-bottom, 28px ) + 132px );
		height: 48px;
	}

	/* Messages and tricks smaller, between the buttons rather than under them. */
	.dhud.touch .dhud-flash,
	.dhud.touch .dhud-tricks {
		padding: 0 112px;
	}

	.dhud.touch .dhud-flash.long,
	.dhud.touch .dhud-tricks b {
		font-size: 18px;
	}

	.dhud.touch .dhud-tricks .points {
		font-size: 15px;
	}

}
`;

// parent: the element the HUD goes in (the page's body if not given).
export function createDriveHud( parent = document.body ) {

	if ( ! document.getElementById( STYLE_ID ) ) {

		const style = document.createElement( 'style' );
		style.id = STYLE_ID;
		style.textContent = CSS;
		document.head.append( style );

	}

	const root = document.createElement( 'div' );
	root.className = 'dhud';
	// Over the whole window in the page's body; over its own box anywhere else.
	root.classList.toggle( 'dhud-fixed', parent === document.body );
	root.hidden = true;
	root.innerHTML = `
		<div class="dhud-flash" hidden></div>
		<div class="dhud-tricks" hidden></div>
		<div class="dhud-pops"></div>
		<div class="dhud-cluster">
			<div class="dhud-badges"><span class="dhud-badge dhud-drift" hidden>DRIFT<i></i></span><span class="dhud-badge dhud-fly" hidden>FLYING</span><span class="dhud-badge dhud-sonic" hidden>SUPERSONIC</span></div>
			<div class="dhud-speed"><span class="dhud-number">0</span><span class="dhud-unit">km/h</span></div>
			<div class="dhud-bar dhud-speed-bar"><i></i></div>
			<div class="dhud-boost" hidden><b>BOOST</b><div class="dhud-bar"><i></i></div></div>
			<div class="dhud-score" hidden><span class="dhud-points">0</span><b class="dhud-mult">×1</b><span class="dhud-best"></span></div>
			<button class="dhud-drift-hold" data-key="Space" hidden title="Hold and steer to drift">DRIFT <kbd>SPACE</kbd><i></i></button>
			<div class="dhud-stats"></div>
			<div class="dhud-name"></div>
		</div>
		<div class="dhud-keys"></div>
		<div class="dhud-touch">
			<button class="left" data-key="KeyA" aria-label="Steer left">◀</button>
			<button class="right" data-key="KeyD" aria-label="Steer right">▶</button>
			<button class="brake" data-key="KeyS">BRAKE</button>
			<button class="gas" data-key="KeyW">GAS</button>
			<button class="drift" data-key="Space">HOP<i></i></button>
			<button class="booster" data-key="KeyB" hidden>BOOST</button>
			<button class="fly" data-key="ShiftLeft" hidden>FLY</button>
			<button class="reset" data-key="KeyR" aria-label="Back on the road">↺</button>
			<button class="camera" data-tap="camera" aria-label="Camera">CAM</button>
		</div>`;
	parent.append( root );

	const $ = selector => root.querySelector( selector );
	const flash = $( '.dhud-flash' );
	const cluster = $( '.dhud-cluster' );
	const number = $( '.dhud-number' );
	const unit = $( '.dhud-unit' );
	const speedBar = $( '.dhud-speed-bar i' );
	const boostRow = $( '.dhud-boost' );
	const boostBar = $( '.dhud-boost i' );
	const stats = $( '.dhud-stats' );
	const name = $( '.dhud-name' );
	const flyBadge = $( '.dhud-fly' );
	const sonicBadge = $( '.dhud-sonic' );
	const boostLabel = $( '.dhud-boost b' );
	const driftBadge = $( '.dhud-drift' );
	const driftHold = $( '.dhud-drift-hold' );
	const scoreRow = $( '.dhud-score' );
	const points = $( '.dhud-points' );
	const mult = $( '.dhud-mult' );
	const best = $( '.dhud-best' );
	const tricks = $( '.dhud-tricks' );
	const pops = $( '.dhud-pops' );
	const keys = $( '.dhud-keys' );
	// The readouts a machine's panel replaces: not the name, nor the DRIFT button (see describeKeys).
	const readouts = [ ...cluster.children ].filter( element => ! element.classList.contains( 'dhud-name' ) && element !== driftHold );
	let driver = null;
	let flashTimer;
	let tricksTimer;
	let refuelTimer;
	let scoring = false;
	let tilt = 1;
	let panel = null;
	let flying = false;
	// Only touch what changed: these are set many times a second.
	const shown = new Map();
	const set = ( key, value, apply ) => {

		if ( shown.get( key ) === value ) return;
		shown.set( key, value );
		apply( value );

	};

	// A touch screen gets the buttons; so does any screen touched while driving.
	const coarse = window.matchMedia?.( '(pointer: coarse)' );
	root.classList.toggle( 'touch', !! coarse?.matches );
	window.addEventListener( 'touchstart', () => root.classList.add( 'touch' ), { passive: true, once: true } );

	// Buttons hold their key down while pressed, each with its own finger (or the mouse).
	for ( const button of root.querySelectorAll( '.dhud-touch button, .dhud-drift-hold' ) ) {

		const code = button.dataset.key;
		const up = e => {

			if ( ! button.classList.contains( 'down' ) ) return;
			button.classList.remove( 'down' );
			if ( code ) driver?.release( code );
			e.preventDefault();

		};
		button.addEventListener( 'pointerdown', e => {

			e.preventDefault();
			// Kept by the button while held, even if the finger slides off it.
			try {

				button.setPointerCapture?.( e.pointerId );

			} catch {

				// Not a live pointer (a synthetic press): nothing to keep, but it still drives.

			}

			button.classList.add( 'down' );
			if ( code ) driver?.press( code );
			else if ( button.dataset.tap === 'camera' ) driver?.toggleCamera();

		} );
		for ( const type of [ 'pointerup', 'pointercancel', 'lostpointercapture' ] ) button.addEventListener( type, up );
		button.addEventListener( 'contextmenu', e => e.preventDefault() );

	}

	function describeKeys() {

		// Each key stays on a line with what it does.
		const row = ( chips, text ) => `<span>${ chips.map( chip => `<kbd>${ chip }</kbd>` ).join( ' ' ) } ${ text }</span>`;
		keys.innerHTML = [
			row( [ 'W', 'S' ], 'gas, brake' ),
			row( [ 'A', 'D' ], 'steer' ),
			row( [ 'Space' ], driver?.drift ? 'drift (hold and steer), hop (tap)' : 'hop' ),
			driver?.booster && row( [ 'B' ], 'booster (flat out for a moment: supersonic)' ),
			driver?.launch && row( [ 'Q', 'E' ], 'roll in the air' ),
			row( [ 'Shift' ], driver?.fly ? 'fly' : 'boost' ),
			row( [ 'R' ], 'reset' ),
			row( [ 'C' ], 'camera' ),
		].filter( Boolean ).join( ' · ' );
		$( '.booster' ).hidden = ! driver?.booster;
		$( '.fly' ).hidden = ! driver?.fly;
		$( '.drift' ).firstChild.textContent = driver?.drift ? 'DRIFT' : 'HOP';
		driftHold.hidden = ! driver?.drift || !! panel;

	}

	describeKeys();

	// Lines of tricks. Unless they're still `pending`, the last one is the points (or what a wipeout
	// lost), styled as such.
	function showTricks( lines, kind ) {

		clearTimeout( tricksTimer );
		tricks.className = `dhud-tricks ${ kind }`;
		tricks.replaceChildren( ...lines.map( ( text, i ) => {

			const line = document.createElement( 'b' );
			line.textContent = text;
			line.style.setProperty( '--i', String( i ) );
			if ( kind !== 'pending' && i === lines.length - 1 ) line.className = 'points';
			return line;

		} ) );
		tricks.hidden = false;

	}

	return {

		// Called by the Driver it's given to, so the buttons can drive and the key list fits its options.
		attach( to ) {

			driver = to;
			describeKeys();

		},

		// A machine with its own readouts (an excavator) shows its panel instead of the speed.
		show( vehicleName, machinePanel = null ) {

			name.textContent = vehicleName ?? '';
			panel?.remove();
			panel = machinePanel;
			if ( panel ) cluster.append( panel );
			for ( const element of readouts ) element.hidden = !! panel;
			driftHold.hidden = ! driver?.drift || !! panel;
			if ( ! panel ) {

				// Badges and the boost row show only when there's something in them.
				boostRow.hidden = ! driver?.booster;
				flyBadge.hidden = ! flying;
				sonicBadge.hidden = true;
				shown.delete( 'sonic' );
				driftBadge.hidden = true;
				scoreRow.hidden = ! scoring;

			}

			root.hidden = false;
			document.body.classList.add( 'driving' );

		},

		hide() {

			root.hidden = true;
			// A message from this drive shouldn't greet the next one.
			clearTimeout( flashTimer );
			flash.hidden = true;
			clearTimeout( tricksTimer );
			tricks.hidden = true;
			clearTimeout( refuelTimer );
			boostRow.classList.remove( 'refuel' );
			boostLabel.textContent = 'BOOST';
			pops.replaceChildren();
			panel?.remove();
			panel = null;
			for ( const button of root.querySelectorAll( '.dhud-touch .down' ) ) button.classList.remove( 'down' );
			document.body.classList.remove( 'driving' );

		},

		// kmh, reverse: the speed and whether it's backwards; top, bestAir, air: the best speed and
		// jump so far and the time in the air now; boost: the booster or a drift boost is pushing;
		// altitude: metres over the ground while flying; drift: the drift's boost level (0 to 3) or
		// null; driftCharge: how far the drift is to its biggest boost (0 to 1); driftHeld: Space or
		// a DRIFT button is held.
		update( { kmh, reverse, top, bestAir, air, boost, altitude = null, drift = null, driftCharge = 0, driftHeld = false } ) {

			set( 'kmh', Math.round( kmh ), value => number.textContent = value );
			set( 'reverse', reverse, value => unit.textContent = value ? 'km/h R' : 'km/h' );
			set( 'bar', Math.round( Math.min( kmh, SPEED_SCALE ) / SPEED_SCALE * 100 ), value => speedBar.style.width = `${ value }%` );
			set( 'boosting', !! boost, value => root.classList.toggle( 'boosting', value ) );
			const statsText = `TOP ${ Math.round( top ) } · BEST AIR ${ bestAir.toFixed( 1 ) } s${ air > 0.2 ? ` · AIR ${ air.toFixed( 1 ) } s` : '' }`;
			set( 'stats', statsText, value => stats.textContent = value );
			set( 'altitude', altitude === null ? null : Math.round( altitude ), value => flyBadge.textContent = value === null ? 'FLYING' : `FLYING · ${ value } m` );
			set( 'drift', drift, value => {

				driftBadge.hidden = value === null;
				driftBadge.dataset.level = value ?? 0;
				root.style.setProperty( '--charge-colour', CHARGE_COLOURS[ value ?? 0 ] );

			} );
			set( 'charge', Math.round( driftCharge * 100 ), value => root.style.setProperty( '--charge', `${ value }%` ) );
			set( 'held', driftHeld, value => driftHold.classList.toggle( 'held', value ) );

		},

		// Stunts: { score, mult, best } (null hides them).
		setScore( value ) {

			scoring = !! value;
			scoreRow.hidden = ! value || !! panel;
			if ( ! value ) return;
			set( 'points', value.score, score => points.textContent = score.toLocaleString( 'en-CA' ) );
			set( 'mult', value.mult, times => {

				mult.textContent = `×${ times }`;
				mult.classList.toggle( 'on', times > 1 );

			} );
			set( 'best', value.best, score => best.textContent = `BEST ${ score.toLocaleString( 'en-CA' ) }` );

		},

		// A hit's word ("WHAM!"), `power` 0 to 1 by how hard; kind 'wipeout' for a wipeout.
		pop( word, power = 0.5, kind = '' ) {

			const element = document.createElement( 'div' );
			element.className = `dhud-pop ${ kind }`.trim();
			element.textContent = word;
			// Tilted one way, then the other.
			tilt = - tilt;
			element.style.setProperty( '--tilt', `${ tilt * ( 4 + power * 5 ) }deg` );
			element.style.setProperty( '--size', String( 0.75 + power * 0.5 ) );
			pops.replaceChildren( element );
			setTimeout( () => element.remove(), POP_TIME );

		},

		// What it's doing in the air so far (lines of text, shown dim), or null once it's down.
		setPending( lines ) {

			if ( lines ) showTricks( lines, 'pending' );
			else if ( tricks.classList.contains( 'pending' ) ) tricks.hidden = true;

		},

		// Tricks landed: { lines, points, mult, combo }, the points before the multiplier; or lost in
		// a wipeout: { lines, mult, lost }.
		tricks( { lines, points: gained = 0, mult: times = 1, combo = false, lost = false } ) {

			const last = lost ? ( times > 1 ? `Combo ×${ times } lost` : 'Wipeout' ) : `${ combo ? 'Combo! ' : '' }+${ gained.toLocaleString( 'en-CA' ) }${ times > 1 ? ` ×${ times }` : '' }`;
			showTricks( [ ...lines, last ], lost ? 'lost' : 'landed' );
			tricksTimer = setTimeout( () => tricks.hidden = true, TRICKS_TIME );

		},

		// The booster's gauge, 0 to 1 (null hides it).
		setBoost( level ) {

			set( 'gauge', level === null ? null : Math.round( level * 100 ), value => {

				boostRow.hidden = value === null || !! panel;
				if ( value === null ) return;
				boostBar.style.width = `${ value }%`;
				boostRow.classList.toggle( 'ready', value >= 100 );

			} );

		},

		setFlying( on ) {

			flying = on;
			flyBadge.hidden = ! on || !! panel;

		},

		// Supersonic (boosting flat out, see drive.js), or not.
		setSupersonic( on ) {

			set( 'sonic', !! on && ! panel, value => sonicBadge.hidden = ! value );

		},

		// Something topped up the boost gauge by `share` (0 to 1): it flashes, with what it took.
		refuel( share ) {

			if ( share <= 0 ) return;
			boostLabel.textContent = `+${ Math.round( share * 100 ) }%`;
			boostRow.classList.remove( 'refuel' );
			void boostRow.offsetWidth;
			boostRow.classList.add( 'refuel' );
			clearTimeout( refuelTimer );
			refuelTimer = setTimeout( () => {

				boostRow.classList.remove( 'refuel' );
				boostLabel.textContent = 'BOOST';

			}, REFUEL_TIME );

		},

		flash( message ) {

			if ( root.classList.contains( 'touch' ) ) for ( const [ keys, buttons ] of TOUCH_WORDS ) message = message.replace( keys, buttons );
			flash.textContent = message;
			flash.classList.toggle( 'long', message.length > 18 );
			// Restart the pop for a new message on top of the last.
			flash.hidden = true;
			void flash.offsetWidth;
			flash.hidden = false;
			clearTimeout( flashTimer );
			flashTimer = setTimeout( () => flash.hidden = true, FLASH_TIME + message.length * FLASH_PER_CHAR );

		},

		dispose() {

			clearTimeout( flashTimer );
			root.remove();

		},

	};

}
