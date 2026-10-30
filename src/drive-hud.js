// A driving HUD any app can use with a Driver (drive.js): the speed, a boost gauge, FLYING with the
// height, drift and jump readouts, big messages ("Crash!", "1.2 s air") and, on a touch screen,
// buttons to drive with. It makes its own elements and styles inside `parent`, so it needs nothing
// in the page. Give it to the Driver as `hud`; the Driver calls attach() to wire up the buttons.
//
// Where it sits can be moved with CSS custom properties on the page: --drive-hud-top,
// --drive-hud-bottom and --drive-hud-side (insets in px, e.g. to clear a map credit line).

const STYLE_ID = 'drive-hud-style';
// The speed the bar under the number fills at (km/h).
const SPEED_SCALE = 200;
// How long a message stays (ms), a little longer for a long one.
const FLASH_TIME = 1500;
const FLASH_PER_CHAR = 30;
// Messages that name keys, as they read on a touch screen, which has the buttons instead.
const TOUCH_WORDS = [
	[ 'Hold Shift to fly or press R', 'Hold FLY, or tap ↺' ],
	[ 'Press R', 'Tap ↺' ],
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

.dhud .dhud-drift {
	background: #fff;
}

.dhud .dhud-drift[data-level="1"] {
	background: #ffc83d;
}

.dhud .dhud-drift[data-level="2"] {
	background: #3dffd8;
}

.dhud .dhud-drift[data-level="3"] {
	background: #ff3df0;
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

.dhud.touch .dhud-number {
	font-size: 40px;
}

.dhud.touch .dhud-stats,
.dhud.touch .dhud-name {
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
		<div class="dhud-cluster">
			<div class="dhud-badges"><span class="dhud-badge dhud-drift" hidden>DRIFT</span><span class="dhud-badge dhud-fly" hidden>FLYING</span></div>
			<div class="dhud-speed"><span class="dhud-number">0</span><span class="dhud-unit">km/h</span></div>
			<div class="dhud-bar dhud-speed-bar"><i></i></div>
			<div class="dhud-boost" hidden><b>BOOST</b><div class="dhud-bar"><i></i></div></div>
			<div class="dhud-stats"></div>
			<div class="dhud-name"></div>
		</div>
		<div class="dhud-keys"></div>
		<div class="dhud-touch">
			<button class="left" data-key="KeyA" aria-label="Steer left">◀</button>
			<button class="right" data-key="KeyD" aria-label="Steer right">▶</button>
			<button class="brake" data-key="KeyS">BRAKE</button>
			<button class="gas" data-key="KeyW">GAS</button>
			<button class="drift" data-key="Space">HOP</button>
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
	const driftBadge = $( '.dhud-drift' );
	const keys = $( '.dhud-keys' );
	const readouts = [ ...cluster.children ].filter( element => ! element.classList.contains( 'dhud-name' ) );
	let driver = null;
	let flashTimer;
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

	// Buttons hold their key down while pressed, each with its own finger.
	for ( const button of root.querySelectorAll( '.dhud-touch button' ) ) {

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
			row( [ 'Space' ], driver?.drift ? 'drift, hop' : 'hop' ),
			driver?.booster && row( [ 'B' ], 'booster' ),
			row( [ 'Shift' ], driver?.fly ? 'fly' : 'boost' ),
			row( [ 'R' ], 'reset' ),
			row( [ 'C' ], 'camera' ),
		].filter( Boolean ).join( ' · ' );
		$( '.booster' ).hidden = ! driver?.booster;
		$( '.fly' ).hidden = ! driver?.fly;
		$( '.drift' ).textContent = driver?.drift ? 'DRIFT' : 'HOP';

	}

	describeKeys();

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
			if ( ! panel ) {

				// Badges and the boost row show only when there's something in them.
				boostRow.hidden = ! driver?.booster;
				flyBadge.hidden = ! flying;
				driftBadge.hidden = true;

			}

			root.hidden = false;
			document.body.classList.add( 'driving' );

		},

		hide() {

			root.hidden = true;
			// A message from this drive shouldn't greet the next one.
			clearTimeout( flashTimer );
			flash.hidden = true;
			panel?.remove();
			panel = null;
			for ( const button of root.querySelectorAll( '.dhud-touch .down' ) ) button.classList.remove( 'down' );
			document.body.classList.remove( 'driving' );

		},

		// kmh, reverse: the speed and whether it's backwards; top, bestAir, air: the best speed and
		// jump so far and the time in the air now; boost: the booster or a drift boost is pushing;
		// altitude: metres over the ground while flying; drift: the drift's boost level (0 to 3) or null.
		update( { kmh, reverse, top, bestAir, air, boost, altitude = null, drift = null } ) {

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

			} );

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
