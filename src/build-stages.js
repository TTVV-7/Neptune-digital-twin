// How something is built, stage by stage: a model whose glTF scene extras carry `buildStages`
// ({ title, view, default, stages: [ { id, name, underground } ] }) gets a picker in the views bar
// (the B2D2 model: C32's take-up, demolition, excavation, forms and rebar, built). Each of its nodes
// with a `buildStage` (the stages it shows at) is shown at those and hidden at the rest; a hidden
// one doesn't stop you walking. Nodes without one are always there. A stage with `underground`
// cuts Google's ground away over your models (underground.js), so a pit reads as a hole; it's put
// back on leaving the stage if the picker cut it. The stage is remembered in this browser.

const STORAGE_KEY = 'neptune-twin.build-stage';

export function setUpBuildStages( { models, bar, getUnderground } ) {

	const wrap = document.createElement( 'label' );
	wrap.className = 'build-stage';
	wrap.hidden = true;
	const title = document.createElement( 'span' );
	const select = document.createElement( 'select' );
	wrap.append( title, select );
	bar?.append( wrap );

	let stage = null;
	try {

		stage = localStorage.getItem( STORAGE_KEY );

	} catch {

		// The model's default, then.

	}

	let cutByUs = false;
	const specOf = entry => entry.pivot.children[ 0 ]?.userData?.buildStages;
	const current = () => models.entries.find( entry => specOf( entry )?.stages?.length ) ?? null;

	function apply() {

		const entry = current();
		wrap.hidden = ! entry;
		if ( ! entry ) return;
		const spec = specOf( entry );
		if ( ! spec.stages.some( s => s.id === stage ) ) stage = spec.default ?? spec.stages[ 0 ].id;
		title.textContent = spec.title ?? 'Stage';
		select.title = `Show ${ spec.title ?? 'it' } at a stage of how it's built`;
		if ( select.options.length !== spec.stages.length ) select.replaceChildren( ...spec.stages.map( s => Object.assign( document.createElement( 'option' ), { value: s.id, textContent: s.name } ) ) );
		select.value = stage;
		entry.pivot.children[ 0 ].traverse( object => {

			const shown = object.userData?.buildStage;
			if ( ! Array.isArray( shown ) ) return;
			const on = shown.includes( stage );
			object.visible = on;
			object.userData.stageNoCollide ??= !! object.userData.noCollide;
			object.userData.noCollide = on ? object.userData.stageNoCollide : true;

		} );
		const underground = getUnderground?.();
		const wantCut = !! spec.stages.find( s => s.id === stage )?.underground;
		if ( underground && wantCut && ! underground.on ) {

			underground.set( true );
			cutByUs = true;

		} else if ( underground && ! wantCut && cutByUs ) {

			if ( underground.on ) underground.set( false );
			cutByUs = false;

		}

	}

	select.addEventListener( 'change', () => {

		stage = select.value;
		try {

			localStorage.setItem( STORAGE_KEY, stage );

		} catch {

			// Just for now, then.

		}

		apply();
		// Hand the keyboard back to the scene.
		select.blur();

	} );
	models.addEventListener( 'add', () => apply() );
	models.addEventListener( 'remove', () => apply() );
	apply();

	return {
		get stage() {

			return stage;

		},
		setStage( id ) {

			select.value = id;
			select.dispatchEvent( new Event( 'change' ) );

		},
	};

}
