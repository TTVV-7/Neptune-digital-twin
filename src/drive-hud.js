// A driving HUD any app can use with a Driver (drive.js): the speed, a boost gauge (which glows on
// and off when it's full, flashes red as it runs dry, and fills up before your eyes when something
// tops it up), FLYING with the height, OVERDRIVE (supersonic, as drive.js has it: glowing in the
// ride's colour, the gauge with it), drift and jump readouts, big messages ("Crash!", "1.2 s air") and, on a touch screen,
// buttons to drive with. With kart handling a DRIFT button (SPACE) sits under the speed, and its
// chip lights up while drifting with the mini-turbo's charge. With stunts (crash: 'launch') a hit
// pops up a word ("WHAM!"), tricks pop up as they're landed, and the score, its combo multiplier
// and the best score show under the speed. It makes its own elements and styles inside `parent`, so
// it needs nothing in the page. Give it to the Driver as `hud`; the Driver calls attach() to wire up
// the buttons.
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
// How long a hit's word and landed tricks stay (ms), and a top-up's on the boost gauge. Hits within
// CHAIN_TIME ms of each other count up (×2, ×3...), each word a little bigger.
const POP_TIME = 900;
const CHAIN_TIME = 1200;
const REFUEL_TIME = 700;
const EMPTY_TIME = 650;
const TRICKS_TIME = 2200;
// Messages that name keys, as they read on a touch screen, which has the buttons instead.
const TOUCH_WORDS = [
	[ 'Hold F to fly or press R', 'Hold FLY, or tap ↺' ],
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

/* Overdrive (supersonic): heavy and slanted as the hits' words are, white-hot through the ride's
   colour (--sonic, its flame's) to the accent's yellow and glowing in its colour, slamming in from
   big with a little overshoot, and a sheen sweeping across it while it lasts. */
.dhud .dhud-sonic {
	background: linear-gradient( 100deg, #ffffff 0%, var( --sonic, #bfe4ff ) 35%, var( --accent ) 60%, #ffffff 80%, var( --sonic, #bfe4ff ) 100% );
	background-size: 250% 100%;
	box-shadow: 0 0 16px rgba( 191, 228, 255, 0.9 );
	box-shadow: 0 0 16px color-mix( in srgb, var( --sonic, #bfe4ff ) 85%, transparent );
	font-weight: 900;
	font-style: italic;
	letter-spacing: 0.02em;
	animation: dhud-sonic 0.45s cubic-bezier( 0.3, 1.6, 0.5, 1 ), dhud-sonic-sheen 1.4s linear 0.45s infinite;
}

@keyframes dhud-sonic {
	from {
		opacity: 0;
		transform: scale( 1.8 );
	}
}

@keyframes dhud-sonic-sheen {
	from {
		background-position: 100% 0;
	}
	to {
		background-position: -150% 0;
	}
}

/* The booster burning: the gauge glows hot; in overdrive, in the ride's colour. (On the bar, which
   clips its fill; its other states' glows, animated, show over this while they run.) */
.dhud.boosting .dhud-boost .dhud-bar {
	box-shadow: 0 0 8px 1px color-mix( in srgb, var( --boost ) 80%, transparent );
}

.dhud.sonic .dhud-boost .dhud-bar {
	box-shadow: 0 0 10px 2px color-mix( in srgb, var( --sonic, var( --boost ) ) 85%, transparent );
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

/* ...filling up to what it took rather than jumping there, with a shine running along it. */
.dhud .dhud-boost.refuel .dhud-bar i {
	transition: width 0.45s cubic-bezier( 0.2, 0.9, 0.3, 1 );
}

.dhud .dhud-boost.refuel .dhud-bar i::after {
	content: '';
	position: absolute;
	inset: 0;
	border-radius: inherit;
	background: linear-gradient( 90deg, transparent, rgba( 255, 255, 255, 0.85 ), transparent );
	animation: dhud-shine 0.55s ease-out both;
}

@keyframes dhud-shine {
	from {
		transform: translateX( -100% );
	}
	to {
		transform: translateX( 100% );
	}
}

/* Full: it glows on and off, ready to fire. */
.dhud .dhud-boost.ready .dhud-bar {
	animation: dhud-ready 1.2s ease-in-out infinite;
}

@keyframes dhud-ready {
	50% {
		box-shadow: 0 0 10px 2px rgba( 255, 210, 63, 0.75 );
		background: rgba( 255, 210, 63, 0.35 );
	}
}

/* Run dry: the empty gauge flashes red. */
.dhud .dhud-boost.empty .dhud-bar {
	animation: dhud-empty 0.2s ease-in-out 3;
}

.dhud .dhud-boost.empty b {
	color: #ff2d55;
}

@keyframes dhud-empty {
	50% {
		background: rgba( 255, 45, 85, 0.8 );
		box-shadow: 0 0 10px rgba( 255, 45, 85, 0.85 );
	}
}

/* Asked for less motion: a steady glow when full, one flash run dry, and OVERDRIVE just there. */
@media ( prefers-reduced-motion: reduce ) {

	.dhud .dhud-sonic {
		animation: none;
	}

	.dhud .dhud-boost.ready .dhud-bar {
		animation: none;
		box-shadow: 0 0 8px 1px rgba( 255, 210, 63, 0.6 );
	}

	.dhud .dhud-boost.empty .dhud-bar {
		animation: dhud-empty 0.6s ease-in-out 1;
	}

	.dhud .dhud-boost.refuel .dhud-bar i::after {
		animation: none;
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
   view, over it rather than on its roof, between it and the tricks), each in its own way by how hard the
   hit was: BONK! a small white pop that drops away, BOING! a springy squash and stretch, WHAM! hot
   on a starburst, shaken; WIPEOUT! rolls over and drops. */
.dhud .dhud-pop {
	position: absolute;
	top: 40%;
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

.dhud .dhud-pop.bonk {
	font-size: calc( clamp( 34px, 7vw, 80px ) * 0.8 );
	color: #fff;
	-webkit-text-stroke: 4px var( --accent );
	text-shadow: 0 0 2px #1a1206, 0 5px 0 rgba( 0, 0, 0, 0.35 );
	animation: dhud-bonk 0.45s ease-out forwards;
}

.dhud .dhud-pop.boing {
	animation: dhud-boing 0.75s ease-out forwards;
}

/* WHAM!'s word in a hot gradient (a span of its own, so the starburst behind it is under the word:
   the pop's own background would be under the starburst), shadowed as a whole rather than by
   text-shadow, which would cover the gradient. */
.dhud .dhud-pop.wham {
	text-shadow: none;
	filter: drop-shadow( 0 6px 0 rgba( 0, 0, 0, 0.35 ) );
	animation: dhud-wham-hit 0.9s ease-out forwards;
}

.dhud .dhud-pop.wham span {
	background: linear-gradient( #ffd23a 25%, #ff4a1a 80% );
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}

.dhud .dhud-pop.wham::before {
	content: '';
	position: absolute;
	inset: -30% -6%;
	z-index: -1;
	background: var( --accent );
	opacity: 0.85;
	clip-path: polygon( 50% 0%, 61% 24%, 85% 15%, 76% 39%, 100% 50%, 76% 61%, 85% 85%, 61% 76%, 50% 100%, 39% 76%, 15% 85%, 24% 61%, 0% 50%, 24% 39%, 15% 15%, 39% 24% );
	animation: dhud-plate 0.9s ease-out forwards;
}

.dhud .dhud-pop.wipeout {
	color: #ff5a5a;
	font-size: clamp( 28px, 5.5vw, 60px );
	animation: dhud-wipeout 0.9s ease-out forwards;
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

/* A quick pop, and down it drops. */
@keyframes dhud-bonk {
	0% {
		opacity: 0;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 0.3 ) );
	}
	25% {
		opacity: 1;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 1.15 ) );
	}
	45% {
		opacity: 1;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) );
	}
	100% {
		opacity: 0;
		transform: translate( -50%, -10% ) rotate( calc( var( --tilt, -6deg ) * 2 ) ) scale( calc( var( --size, 1 ) * 0.9 ) );
	}
}

/* Squashed flat, stretched tall, and springing back. */
@keyframes dhud-boing {
	0% {
		opacity: 0;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) ) scale( 0.4, 0.3 );
	}
	14% {
		opacity: 1;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) ) scale( 1.35, 0.6 );
	}
	32% {
		transform: translate( -50%, -55% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) ) scale( 0.82, 1.25 );
	}
	50% {
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) ) scale( 1.1, 0.9 );
	}
	64% {
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) ) scale( 1, 1 );
	}
	78% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		transform: translate( -50%, -58% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) ) scale( 1, 1 );
	}
}

/* Slammed in big, shaken for a moment, and gone. */
@keyframes dhud-wham-hit {
	0% {
		opacity: 0;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 2.2 ) );
	}
	12% {
		opacity: 1;
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 0.92 ) );
	}
	18% {
		transform: translate( calc( -50% + 4px ), calc( -50% - 3px ) ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 1.05 ) );
	}
	22% {
		transform: translate( calc( -50% - 4px ), calc( -50% + 2px ) ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) );
	}
	26% {
		transform: translate( calc( -50% + 3px ), calc( -50% + 3px ) ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) );
	}
	30% {
		transform: translate( -50%, -50% ) rotate( var( --tilt, -6deg ) ) scale( var( --size, 1 ) );
	}
	75% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		transform: translate( -50%, -58% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 1.08 ) );
	}
}

@keyframes dhud-plate {
	0% {
		transform: scale( 0 ) rotate( -20deg );
	}
	20% {
		transform: scale( 1.15 ) rotate( 0deg );
	}
	35% {
		transform: scale( 1 );
	}
	100% {
		transform: scale( 1.05 ) rotate( 6deg );
	}
}

/* Rolled over once as it comes, dropping a little, and settling. */
@keyframes dhud-wipeout {
	0% {
		opacity: 0;
		transform: translate( -50%, -56% ) rotate( var( --tilt, -6deg ) ) scale( calc( var( --size, 1 ) * 0.4 ) );
	}
	39% {
		opacity: 1;
		transform: translate( -50%, -44% ) rotate( calc( var( --tilt, -6deg ) + 360deg ) ) scale( calc( var( --size, 1 ) * 1.1 ) );
	}
	55% {
		transform: translate( -50%, -50% ) rotate( calc( var( --tilt, -6deg ) + 360deg ) ) scale( var( --size, 1 ) );
	}
	78% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		transform: translate( -50%, -50% ) rotate( calc( var( --tilt, -6deg ) + 360deg ) ) scale( var( --size, 1 ) );
	}
}

/* Asked for less motion: the words just fade in and out where they are, the starburst still. */
@keyframes dhud-pop-calm {
	0% {
		opacity: 0;
	}
	15% {
		opacity: 1;
	}
	70% {
		opacity: 1;
	}
	100% {
		opacity: 0;
	}
}

@media ( prefers-reduced-motion: reduce ) {

	.dhud .dhud-pop,
	.dhud .dhud-pop.bonk,
	.dhud .dhud-pop.boing,
	.dhud .dhud-pop.wham,
	.dhud .dhud-pop.wipeout {
		animation: dhud-pop-calm 0.75s ease-out forwards;
	}

	.dhud .dhud-pop.wham::before {
		animation: none;
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

/* "Crash!": red, and knocked side to side for a moment (just there for a visitor asking for less
   motion). */
.dhud .dhud-flash.crash {
	color: #ff4a4a;
}

.dhud .dhud-flash.crash:not( [hidden] ) {
	animation: dhud-pop 0.25s ease-out, dhud-knock 0.3s linear;
}

@keyframes dhud-knock {
	20% {
		translate: 4px 0;
	}
	40% {
		translate: -4px 0;
	}
	60% {
		translate: 3px 0;
	}
	80% {
		translate: -2px 0;
	}
}

@media ( prefers-reduced-motion: reduce ) {

	.dhud .dhud-flash.crash:not( [hidden] ) {
		animation: dhud-pop 0.25s ease-out;
	}

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
			<div class="dhud-badges"><span class="dhud-badge dhud-drift" hidden>DRIFT<i></i></span><span class="dhud-badge dhud-fly" hidden>FLYING</span><span class="dhud-badge dhud-sonic" hidden>OVERDRIVE</span></div>
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
			<button class="fly" data-key="KeyF" hidden>FLY</button>
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
	let emptyTimer;
	let scoring = false;
	let tilt = 1;
	let chain = 0;
	let lastPop = - Infinity;
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
			driver?.booster ? row( [ 'Shift' ], 'boost (hold: overdrive while the gauge lasts)' ) : row( [ 'Shift' ], 'boost' ),
			driver?.fly && row( [ 'F' ], 'fly' ),
			driver?.launch && row( [ 'Q', 'E' ], 'roll in the air' ),
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
				root.classList.remove( 'sonic' );
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
			clearTimeout( emptyTimer );
			boostRow.classList.remove( 'refuel', 'empty' );
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

		// A hit's word ("WHAM!"), `power` 0 to 1 by how hard; `kind` how it shows: 'bonk', 'boing',
		// 'wham' (by how hard, as drive.js has them) or 'wipeout'. A hit within CHAIN_TIME of the last
		// counts up (×2, ×3...) and is a little bigger each time.
		pop( word, power = 0.5, kind = '' ) {

			// Hits count up together; a wipeout is a word of its own.
			const now = performance.now();
			const hit = kind !== 'wipeout';
			chain = hit && now - lastPop < CHAIN_TIME ? chain + 1 : 1;
			lastPop = hit ? now : - Infinity;
			const element = document.createElement( 'div' );
			element.className = `dhud-pop ${ kind }`.trim();
			// The word in a span of its own (WHAM!'s starburst goes behind it: see the CSS).
			const text = document.createElement( 'span' );
			text.textContent = chain > 1 ? `${ word } ×${ chain }` : word;
			element.append( text );
			// Tilted one way, then the other.
			tilt = - tilt;
			element.style.setProperty( '--tilt', `${ tilt * ( 4 + power * 5 ) }deg` );
			element.style.setProperty( '--size', String( 0.75 + power * 0.5 + 0.1 * Math.min( 5, chain - 1 ) ) );
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

		// The booster's gauge, 0 to 1 (null hides it). Run dry, it flashes red for a moment.
		setBoost( level ) {

			const was = shown.get( 'gauge' );
			set( 'gauge', level === null ? null : Math.round( level * 100 ), value => {

				boostRow.hidden = value === null || !! panel;
				if ( value === null ) return;
				boostBar.style.width = `${ value }%`;
				boostRow.classList.toggle( 'ready', value >= 100 );
				if ( value > 0 || ! was ) return;
				boostRow.classList.remove( 'empty' );
				void boostRow.offsetWidth;
				boostRow.classList.add( 'empty' );
				clearTimeout( emptyTimer );
				emptyTimer = setTimeout( () => boostRow.classList.remove( 'empty' ), EMPTY_TIME );

			} );

		},

		setFlying( on ) {

			flying = on;
			flyBadge.hidden = ! on || !! panel;

		},

		// Supersonic (boosting flat out, see drive.js), or not; `tint`, the ride's colour (a three.js
		// Color, its fx's), which the tag and the gauge glow in.
		setSupersonic( on, tint = null ) {

			set( 'sonic', !! on && ! panel, value => {

				sonicBadge.hidden = ! value;
				root.classList.toggle( 'sonic', value );

			} );
			// (With none, a rainbow flame's, the CSS's own ice blue, not the last ride's.)
			if ( on ) set( 'sonic-tint', tint ? tint.getHexString() : '', hex => hex ? root.style.setProperty( '--sonic', `#${ hex }` ) : root.style.removeProperty( '--sonic' ) );

		},

		// Something topped up the boost gauge by `share` (0 to 1): it flashes, with what it took.
		refuel( share ) {

			if ( share <= 0 ) return;
			boostLabel.textContent = `+${ Math.round( share * 100 ) }%`;
			// From where it was, so it's seen to fill up to where it is now.
			const to = boostBar.style.width;
			boostBar.style.width = `${ Math.max( 0, ( parseFloat( to ) || 0 ) - share * 100 ) }%`;
			boostRow.classList.remove( 'refuel', 'empty' );
			void boostRow.offsetWidth;
			boostRow.classList.add( 'refuel' );
			boostBar.style.width = to;
			clearTimeout( refuelTimer );
			refuelTimer = setTimeout( () => {

				boostRow.classList.remove( 'refuel' );
				boostLabel.textContent = 'BOOST';

			}, REFUEL_TIME );

		},

		// A big message for a moment; `kind` 'crash' for "Crash!", knocked side to side in red.
		flash( message, kind = '' ) {

			if ( root.classList.contains( 'touch' ) ) for ( const [ keys, buttons ] of TOUCH_WORDS ) message = message.replace( keys, buttons );
			flash.textContent = message;
			flash.classList.toggle( 'long', message.length > 18 );
			flash.classList.toggle( 'crash', kind === 'crash' );
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
