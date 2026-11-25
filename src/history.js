// Undo and redo for what's done to placed things in the editor (sidebar.js): moving and turning
// one or many, deleting, cutting, pasting and duplicating. Each is one step, however many items it
// touched: Ctrl/Cmd+Z undoes it, Ctrl/Cmd+Shift+Z or Ctrl+Y does it again, and the Undo toasts
// (toolbar.js) undo theirs.
//
// A step is { label, undo(), redo(), merge? }; undo and redo may be async (loading items back). An
// item deleted and put back is a new entry (models.js), so steps hold entries through refs: the
// entry an older one became is found with resolve(). Steps that touch the same items one after the
// other within MERGE_TIME (pressing R a few times) can merge into one: push( step ) with
// `merge( top )` returning true when it took the top step's place, having folded it in.
// Another layout replacing what's placed (layout.replace) clears it all.

const LIMIT = 100;
const MERGE_TIME = 1500;

export function createHistory( { models, onError = () => {} } ) {

	const done = [];
	const undone = [];
	// An entry deleted and loaded back -> the entry it was loaded as.
	const replaced = new WeakMap();
	const listeners = new Set();
	// Bumped by clear(): a step still loading items back from before then takes them away again.
	let epoch = 0;
	// Steps undone and redone, one at a time (undoing a delete loads items back, which takes a while).
	let queue = Promise.resolve();

	const changed = () => {

		for ( const listener of listeners ) listener();

	};

	// The entry `entry` is now: itself, or what it was loaded back as; null once it's gone.
	function resolve( entry ) {

		let e = entry;
		const seen = new Set();
		while ( e && replaced.has( e ) && ! seen.has( e ) ) {

			seen.add( e );
			e = replaced.get( e );

		}

		return e && models.entries.includes( e ) ? e : null;

	}

	function push( step ) {

		const top = done[ done.length - 1 ];
		step.time = performance.now();
		if ( top && step.merge && step.time - top.time < MERGE_TIME && step.merge( top ) ) done.pop();
		done.push( step );
		if ( done.length > LIMIT ) done.shift();
		undone.length = 0;
		changed();
		return step;

	}

	// One after the other, each starting once the one before has finished.
	function run( from, to, method, step ) {

		const next = queue.then( async () => {

			const index = from.lastIndexOf( step ?? from[ from.length - 1 ] );
			if ( index === - 1 ) return null;
			const [ target ] = from.splice( index, 1 );
			const at = epoch;
			changed();
			try {

				await target[ method ]();

			} catch ( err ) {

				onError( `Could not ${ method } ${ target.label }: ${ err.message }` );

			}

			// Cleared meanwhile (another layout opened): it belongs to the old one.
			if ( epoch !== at ) return null;
			target.time = - Infinity;
			to.push( target );
			changed();
			return target;

		} );
		queue = next.catch( () => {} );
		return next;

	}

	return {
		push,
		resolve,
		// Record that `entry` was loaded back as `next` (undoing a delete), so steps holding it find it.
		replace( entry, next ) {

			if ( entry && next && entry !== next ) replaced.set( entry, next );

		},
		// Forget every step: another layout (a project opened, a shared one) has replaced what was
		// placed, and steps from the old one would put its items into the new one.
		clear() {

			done.length = 0;
			undone.length = 0;
			epoch ++;
			changed();

		},
		get epoch() {

			return epoch;

		},
		// Undo the last step, or a given one (an Undo toast's, which may not be the last any more).
		undo: step => run( done, undone, 'undo', step ),
		redo: () => run( undone, done, 'redo' ),
		get canUndo() {

			return done.length > 0;

		},
		get canRedo() {

			return undone.length > 0;

		},
		// The labels of what can be undone and redone, the last first (for tests and tooltips).
		get undoLabel() {

			return done[ done.length - 1 ]?.label ?? null;

		},
		get redoLabel() {

			return undone[ undone.length - 1 ]?.label ?? null;

		},
		get size() {

			return { undo: done.length, redo: undone.length };

		},
		includes: step => done.includes( step ),
		onChange( listener ) {

			listeners.add( listener );
			return () => listeners.delete( listener );

		},
	};

}
