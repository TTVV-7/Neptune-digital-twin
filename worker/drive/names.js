// What goes on the leaderboard in words: players' nicknames and the places scores were set. A
// nickname is 3 to 16 letters (any alphabet), numbers, spaces, _ or -, with at least two letters or
// numbers, and nothing invisible. Names are unique whatever their case and accents, spaces, _ and -
// count as the same, and so do letters that look alike (a Cyrillic а and a Latin a, I and l, rn and
// m), so "Speed Demon", "speed_demon", "SPEED-DEMON" and "Ѕрееd Dеmоn" are one name: nobody can pass
// for someone else by changing a capital, a dash or an alphabet.
//
// The filter is small on purpose: a short list of slurs and obvious abuse, looked for through the
// usual disguises (capitals, accents, 0 for o and 1 for i, letters doubled, spaces or _ between
// them), and names that pass for World Drive itself. It can't catch everything, and some words
// are only refused as whole words so that Scunthorpe and Cassandra still can be; the owner renames
// or removes anything that gets through (docs/world-drive.md).

const NAME = /^[\p{L}\p{M}\p{N} _-]+$/u;
const NAME_LENGTH = [ 3, 16 ];
const PLACE = /^[\p{L}\p{M}\p{N} .,'’\-#&/()°]+$/u;
const PLACE_LENGTH = 60;

// Look-alikes, as the letters they stand for.
const LOOKALIKE = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i' };
// Cyrillic and Greek letters that look like Latin ones, as those: capitals before a name is put in
// lower case (a Cyrillic Н is an H, though its н is no h), then small letters.
const CAPITALS = lookalikes( 'АВЕКМНОРСТУХЅІЈӀҮԚԜΑΒΕΖΗΙΚΜΝΟΡΤΥΧϹ', 'ABEKMHOPCTYXSIJIYQWABEZHIKMNOPTYXC' );
const SMALL = lookalikes( 'аеорсухѕіјһԁԛԝӏүпькαορικνυωχεϲημτγıɡ', 'aeopcyxsijhdqwiynbkaopikvuwxecnutyig' );
// Marks that aren't accents (a Devanagari vowel, a Thai tone) are fine, two to a letter at most;
// one on nothing, or a stack of them spilling over the rows, isn't.
const LOOSE_MARK = /(?:^|[ _-])\p{M}|\p{M}{3}/u;

// Refused anywhere in a name, with every letter allowed to repeat ("niiice" is "nice").
const ANYWHERE = [
	'nigg', 'faggot', 'retard', 'tranny', 'wetback', 'beaner', 'hitler', 'siegheil', 'whitepower', 'kkk',
	'killyourself', 'fuck', 'shit', 'bitch', 'whore', 'slut', 'pussy', 'penis', 'vagina', 'porn', 'rapist',
	'molest', 'paedo', 'pedophil', 'jizz', 'dildo', 'motherf',
].map( stem => new RegExp( [ ...stem ].map( letter => `${ letter }+` ).join( '' ) ) );

// Refused only as a word of their own (or as the whole name run together).
const WORDS = new Set( [
	'fag', 'fags', 'kike', 'kikes', 'spic', 'spics', 'chink', 'chinks', 'gook', 'gooks', 'coon', 'coons',
	'paki', 'pakis', 'dyke', 'dykes', 'nazi', 'nazis', 'heil', 'kys', 'rape', 'raped', 'rapes', 'raping',
	'cunt', 'cunts', 'twat', 'wank', 'wanker', 'cum', 'sex', 'anal', 'anus', 'pedo', 'nonce', 'tits', 'nsfw',
] );

// Names that would pass for World Drive or the people who run it.
const RESERVED_ANYWHERE = [ 'admin', 'worlddrive', 'moderator', 'official' ];
const RESERVED_WORDS = new Set( [ 'mod', 'mods', 'staff', 'owner', 'support' ] );

// A nickname as it's kept (trimmed, spaces squeezed), or null if it isn't one. Whether it's
// allowed is nameAllowed.
export function cleanName( value ) {

	if ( typeof value !== 'string' || value.length > 64 ) return null;
	const name = value.normalize( 'NFC' ).replace( /\s+/g, ' ' ).trim();
	const length = [ ...name ].length;
	if ( length < NAME_LENGTH[ 0 ] || length > NAME_LENGTH[ 1 ] || ! NAME.test( name ) ) return null;
	// Letters that show as nothing (a Hangul filler, a variation selector): "Ace" with one on the
	// end would look like Ace and be another name.
	if ( /\p{Default_Ignorable_Code_Point}/u.test( name ) || LOOSE_MARK.test( name ) ) return null;
	if ( ( name.match( /[\p{L}\p{N}]/gu ) ?? [] ).length < 2 ) return null;
	return name;

}

// How names are compared, and kept unique: lower case, without accents, look-alikes as the Latin
// letters they look like, l as i (they're one stroke in most fonts), rn as m and vv as w, and spaces,
// _ and - all alike. "Driver 4821" is driver-4821.
export function nameKey( name ) {

	return latin( name ).replace( /l/g, 'i' ).replace( /rn/g, 'm' ).replace( /vv/g, 'w' )
		.replace( /[ _-]+/g, '-' ).replace( /^-|-$/g, '' ).normalize( 'NFC' );

}

export function nameAllowed( name ) {

	return ! isRude( name ) && ! isReserved( name );

}

// A place a score was set, as it's kept and shown (letters, numbers and an address's
// punctuation, as the search takes), or null.
export function cleanPlace( value ) {

	if ( typeof value !== 'string' || value.length > 200 ) return null;
	const place = value.normalize( 'NFC' ).replace( /\s+/g, ' ' ).trim();
	if ( ! place || [ ...place ].length > PLACE_LENGTH || ! PLACE.test( place ) || isRude( place ) ) return null;
	return place;

}

// How places are matched for a board of one place: whatever their case.
export function placeKey( place ) {

	return place.normalize( 'NFKC' ).toLowerCase();

}

function isRude( text ) {

	const { compact, words } = fold( text );
	const squeezed = word => word.replace( /(.)\1+/g, '$1' );
	if ( /1488/.test( text ) ) return true;
	if ( ANYWHERE.some( pattern => pattern.test( compact ) ) ) return true;
	return [ ...words, compact ].some( word => WORDS.has( word ) || WORDS.has( squeezed( word ) ) );

}

function isReserved( text ) {

	const { compact, words } = fold( text );
	// (Badminton has an admin in it.)
	const loose = compact.replace( /badminton/g, '' );
	if ( RESERVED_ANYWHERE.some( stem => loose.includes( stem ) ) ) return true;
	return [ ...words, compact ].some( word => RESERVED_WORDS.has( word ) );

}

// The text as the filter reads it: no accents, lower case, look-alikes as letters (a Cyrillic с
// as c, so "fuсk" is caught as well). `compact` is only its letters, run together; `words` its runs
// of letters.
function fold( text ) {

	const plain = latin( text.normalize( 'NFKD' ).replace( /\p{M}/gu, '' ) ).replace( /[0-9@$!|]/g, c => LOOKALIKE[ c ] ?? c );
	const words = plain.split( /[^a-z]+/ ).filter( Boolean );
	return { compact: words.join( '' ), words };

}

// The text in lower case, without the accents on Latin, Greek and Cyrillic letters, and with the
// Cyrillic and Greek letters that look Latin as those.
function latin( text ) {

	const plain = text.normalize( 'NFKD' ).replace( /[\u0300-\u036f]/g, '' );
	return plain.replace( /./gu, c => CAPITALS.get( c ) ?? c ).toLowerCase().replace( /./gu, c => SMALL.get( c ) ?? c );

}

// { look-alike: letter } from two strings, letter for letter.
function lookalikes( from, to ) {

	const letters = [ ...to ];
	return new Map( [ ...from ].map( ( c, i ) => [ c, letters[ i ] ] ) );

}
