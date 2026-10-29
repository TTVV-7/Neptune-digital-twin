// Live ship positions from AISStream (https://aisstream.io), for the dev server.
//
// AISStream doesn't accept connections from browsers and the key must stay private, so
// this runs in Node: it holds one connection and the page polls a snapshot of the vessels
// from /api/ais (see vite.config.js). What the messages mean is in aisFeed.js, shared with
// the hosted site's Worker. The table is saved to .cache/ so a restart doesn't wait minutes
// for ships to report again.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import WebSocket from 'ws';
import { AISSTREAM_URL, AisFeed } from './aisFeed.js';

const SAVE_EVERY_MS = 60 * 1000;

export function createAisFeed( { apiKey, box, cacheFile, url = AISSTREAM_URL, log = console.log } ) {

	const feed = new AisFeed( { apiKey, box, log } );
	let socket = null;
	let retryTimer = null;
	let saveTimer = null;
	let stopped = false;

	function start() {

		if ( ! apiKey || stopped ) return;
		feed.connecting();
		const ws = socket = new WebSocket( url, { perMessageDeflate: true } );
		let failure = null;

		ws.on( 'open', () => ws.send( feed.subscription() ) );
		ws.on( 'message', data => feed.received( data.toString() ) );
		ws.on( 'error', err => failure = err.message );
		ws.on( 'close', code => {

			if ( socket === ws ) socket = null;
			if ( stopped ) return;
			retryTimer = setTimeout( start, feed.closed( code, failure ) * 1000 );

		} );

	}

	function save() {

		if ( ! cacheFile ) return;
		try {

			mkdirSync( dirname( cacheFile ), { recursive: true } );
			writeFileSync( cacheFile + '.tmp', JSON.stringify( feed.list() ) );
			renameSync( cacheFile + '.tmp', cacheFile );

		} catch ( err ) {

			log( `AIS: could not save ${ cacheFile }: ${ err.message }` );

		}

	}

	// Without a key nothing is live, so old ships aren't shown either.
	if ( apiKey ) {

		try {

			if ( cacheFile ) feed.load( JSON.parse( readFileSync( cacheFile, 'utf8' ) ) );

		} catch {

			// No cache yet, or unreadable: start empty.

		}

		start();
		saveTimer = setInterval( save, SAVE_EVERY_MS );

	}

	return {
		snapshot: () => feed.snapshot(),
		stop() {

			stopped = true;
			clearTimeout( retryTimer );
			clearInterval( saveTimer );
			socket?.close();
			if ( apiKey ) save();

		},
		// For tests: feed a message as if it came from AISStream.
		handle: msg => feed.handle( msg ),
	};

}
