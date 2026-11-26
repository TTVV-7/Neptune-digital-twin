import { RAISE, ZONE_ID } from './flatten.js';
import { getKind } from './kinds.js';

// Raising and lowering flatten areas (flatten.js raise, finished), with each change one undo step
// (history.js): the arrow in the middle of a selected area (handles.js), PageUp and PageDown while
// one is selected (sidebar.js), and the P panel's raise / lower field, its − and +, exact finished
// height and Back to the ground's height (placement.js, as the kind's undoable fields and actions).
//
// The keys: PageUp / PageDown raise or lower it 0.25 m, 0.05 m with Shift, 1 m with Ctrl or Cmd (or
// Alt: some browsers keep Ctrl+PageUp for switching tabs). At an exact finished height they move that.

// What the keys move it by (m).
export const KEY_STEPS = { plain: RAISE.nudge, fine: 0.05, coarse: 1 };

export function canRaise( entry ) {

	return entry?.kind === ZONE_ID && !! getKind( entry.kind )?.resize?.raise;

}

// The raise and finished height of an area's params.
const heightOf = p => ( { raise: p.raise, finished: p.finished } );

export function createRaising( { models, history } ) {

	// Change an area's params by `patch` (raise, finished, or anything an undoable field sets) as one
	// undo step, labelled `label`. Nothing if they come out the same.
	function change( entry, patch, label = 'Raise / lower' ) {

		const keys = Object.keys( patch );
		const before = Object.fromEntries( keys.map( k => [ k, entry.params[ k ] ] ) );
		models.setParams( entry, patch );
		const after = Object.fromEntries( keys.map( k => [ k, entry.params[ k ] ] ) );
		if ( JSON.stringify( before ) === JSON.stringify( after ) ) return null;
		return record( entry, before, after, label );

	}

	// Keep a change already made (the arrow, let go) as an undo step.
	function record( entry, before, after, label = 'Raise / lower' ) {

		const set = values => {

			const target = history.resolve( entry );
			// Deleted for good: say so rather than spend the step on nothing.
			if ( ! target ) throw new Error( `${ entry.state.name } is no longer there` );
			models.setParams( target, values );

		};
		return history.push( {
			label: `${ label }: ${ entry.state.name }`,
			refs: [ entry ],
			undo: () => set( before ),
			redo: () => set( after ),
		} );

	}

	// PageUp (up = 1) or PageDown (-1) on a selected area, by the step the keys held say.
	function nudge( entry, up, { shiftKey, ctrlKey, metaKey, altKey } ) {

		const step = ctrlKey || metaKey || altKey ? KEY_STEPS.coarse : shiftKey ? KEY_STEPS.fine : KEY_STEPS.plain;
		const p = entry.params;
		const key = p.finished !== null ? 'finished' : 'raise';
		const value = Math.round( ( p[ key ] + up * step ) * 100 ) / 100;
		return change( entry, { [ key ]: value }, up > 0 ? 'Raise' : 'Lower' );

	}

	return { change, record, nudge, heightOf };

}
