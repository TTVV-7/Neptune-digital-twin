// A driving HUD that builds its own markup inside `parent`: speed, the vehicle's name, top speed
// and best jump, a boost bar, a "Flying" tag and big flashes ("Crash!", "1.2 s air"). It has the
// interface drive.js gives its hud (show, hide, update, flash) plus setBoost( 0..1 ) and
// setFlying( on ). A small stand-in for World Drive (src/drive-app/) until the full HUD lands;
// anything with the same interface works in its place.

const CSS = `
.drive-hud { position: fixed; left: 16px; bottom: 16px; z-index: 20; color: #fff; font: 600 13px/1.3 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; pointer-events: none; text-shadow: 0 1px 3px rgba( 0, 0, 0, 0.6 ); }
.drive-hud[hidden] { display: none; }
.drive-hud .speed { display: flex; align-items: baseline; gap: 6px; }
.drive-hud .speed b { font: 900 italic 56px/1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
.drive-hud .speed span { font-size: 14px; opacity: 0.8; }
.drive-hud .name { font-size: 12px; opacity: 0.85; text-transform: uppercase; letter-spacing: 1px; }
.drive-hud .stats { font-size: 12px; opacity: 0.75; }
.drive-hud .boost { width: 160px; height: 8px; margin-top: 6px; border-radius: 4px; background: rgba( 0, 0, 0, 0.45 ); overflow: hidden; }
.drive-hud .boost i { display: block; height: 100%; width: 100%; background: linear-gradient( 90deg, #ff7a1a, #ffd23f ); transform-origin: left; }
.drive-hud .tag { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 6px; background: #3ec1ff; color: #06121f; text-shadow: none; }
.drive-hud.boosting .speed b { color: #ffd23f; }
.drive-hud .flash { position: fixed; top: 28%; left: 0; right: 0; text-align: center; font: 900 italic 44px/1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #ffd23f; text-shadow: 0 3px 12px rgba( 0, 0, 0, 0.6 ); }
.drive-hud .panel { pointer-events: auto; }
`;

export function createDriveHud( parent = document.body ) {

	if ( ! document.getElementById( 'drive-hud-style' ) ) {

		const style = document.createElement( 'style' );
		style.id = 'drive-hud-style';
		style.textContent = CSS;
		document.head.append( style );

	}

	const root = document.createElement( 'div' );
	root.className = 'drive-hud';
	root.hidden = true;
	root.innerHTML = `
		<div class="name"></div>
		<div class="speed"><b>0</b><span>km/h</span></div>
		<div class="stats"></div>
		<div class="boost" hidden><i></i></div>
		<div class="tag" hidden>Flying</div>
		<div class="flash" hidden></div>`;
	parent.append( root );
	const $ = selector => root.querySelector( selector );
	const name = $( '.name' );
	const speed = $( '.speed b' );
	const unit = $( '.speed span' );
	const stats = $( '.stats' );
	const boostBar = $( '.boost' );
	const boostFill = $( '.boost i' );
	const flying = $( '.tag' );
	const flashText = $( '.flash' );
	let flashTimer;
	let panel = null;

	return {

		root,

		// A machine with its own readouts (an excavator) shows its panel instead of the speed.
		show( vehicleName = '', machinePanel = null ) {

			name.textContent = vehicleName;
			panel?.remove();
			panel = machinePanel;
			if ( panel ) {

				panel.classList.add( 'panel' );
				name.after( panel );

			}

			for ( const element of [ $( '.speed' ), stats ] ) element.hidden = !! panel;
			root.hidden = false;
			document.body.classList.add( 'driving' );

		},

		hide() {

			root.hidden = true;
			panel?.remove();
			panel = null;
			flashText.hidden = true;
			document.body.classList.remove( 'driving' );

		},

		update( { kmh = 0, reverse = false, top = 0, bestAir = 0, air = 0, boost = false } ) {

			speed.textContent = Math.round( kmh );
			unit.textContent = reverse ? 'km/h · R' : 'km/h';
			root.classList.toggle( 'boosting', !! boost );
			stats.textContent = `top ${ Math.round( top ) } km/h · best jump ${ bestAir.toFixed( 1 ) } s${ air > 0.2 ? ` · air ${ air.toFixed( 1 ) } s` : '' }`;

		},

		flash( message ) {

			flashText.textContent = message;
			flashText.hidden = false;
			clearTimeout( flashTimer );
			flashTimer = setTimeout( () => flashText.hidden = true, 1500 );

		},

		// How full the booster is, 0 to 1; the bar shows once there is a booster.
		setBoost( share ) {

			boostBar.hidden = false;
			boostFill.style.transform = `scaleX(${ Math.min( 1, Math.max( 0, share ) ) })`;

		},

		setFlying( on ) {

			flying.hidden = ! on;

		},

	};

}
