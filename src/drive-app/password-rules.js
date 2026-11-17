// The rules for usernames and passwords (docs/world-drive.md, "Username and password accounts"),
// shared by the Worker (worker/drive/logins.js), which holds to them, and the page's account panel
// (account.js), which says what's wrong before anything is sent. A username is a private name to
// sign in with, never shown on the boards (the nickname is): 3 to 20 letters, digits, _ or -, after
// NFKC (so a full-width Ａ is an A), in plain Latin letters only, so a Cyrillic а can't pass for an a.
// Two usernames are one whatever their case. A password is at least 8 characters and at most 128
// bytes (a long passphrase is welcome), not one of the very commonest, and not the username; no
// other rules, as NIST's advice has it (SP 800-63B): rules about digits and symbols make passwords
// people can't remember, not ones others can't guess.

export const USERNAME_LENGTH = [ 3, 20 ];
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 128;
const USERNAME = /^[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();

// The very commonest passwords of 8 characters or more (the shorter ones are turned away anyway),
// from the lists of passwords leaked most often, in lower case, and World Drive's own name.
const COMMON = new Set( [
	'password', 'password1', 'password12', 'password123', 'password!', 'passw0rd', 'p@ssw0rd', 'p@ssword', '12345678', '123456789',
	'1234567890', '0123456789', '12341234', '11223344', '12121212', '123123123', '987654321', '147258369', '159753456', '11111111',
	'00000000', '22222222', '33333333', '44444444', '55555555', '66666666', '77777777', '88888888', '99999999', 'aaaaaaaa',
	'qwertyui', 'qwertyuiop', 'qwerty12', 'qwerty123', 'qwer1234', '1234qwer', 'q1w2e3r4', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx',
	'zaq12wsx', '123qweasd', 'asdfghjk', 'asdfasdf', 'zxcvbnm1', 'zxcvbnma', 'abc12345', 'abcd1234', 'a1b2c3d4', 'abcdefgh',
	'iloveyou', 'iloveyou1', 'iloveu123', 'loveyou1', 'lovelove', 'sunshine', 'sunshine1', 'princess', 'princess1', 'babygirl',
	'football', 'football1', 'baseball', 'baseball1', 'superman', 'batman123', 'spiderman', 'starwars', 'starwars1', 'pokemon1',
	'minecraft', 'fortnite', 'whatever', 'trustno1', 'letmein1', 'letmein123', 'welcome1', 'welcome123', 'changeme', 'default1',
	'computer', 'internet', 'michael1', 'jennifer', 'charlie1', 'shadow12', 'master12', 'monkey12', 'dragon12', 'liverpool',
	'chelsea1', 'arsenal1', 'freedom1', 'mustang1', 'hello123', 'hellohello', 'google123', 'admin123', 'administrator', 'worlddrive',
	'world drive', 'worlddrive1', 'worlddrive123',
] );

// The username as it's kept and shown to its owner (NFKC, trimmed), or null if it isn't one.
export function cleanUsername( value ) {

	if ( typeof value !== 'string' || value.length > 64 ) return null;
	const name = value.normalize( 'NFKC' ).trim();
	if ( name.length < USERNAME_LENGTH[ 0 ] || name.length > USERNAME_LENGTH[ 1 ] || ! USERNAME.test( name ) ) return null;
	return name;

}

// How usernames are compared, and kept unique: in lower case ("Alice", "ALICE" and a full-width
// "Ａlice" are one).
export function usernameKey( name ) {

	return name.normalize( 'NFKC' ).toLowerCase();

}

// The password as it's hashed (NFKC, so the same passphrase typed on another keyboard is the same
// bytes), or null if it isn't text of a sensible size at all.
export function passwordText( value ) {

	if ( typeof value !== 'string' || value.length > 4 * PASSWORD_MAX_BYTES ) return null;
	const text = value.normalize( 'NFKC' );
	return encoder.encode( text ).length <= PASSWORD_MAX_BYTES ? text : null;

}

// What's wrong with a new password for `username` (in words to show), or '' when it's fine.
export function passwordProblem( value, username = '' ) {

	const text = passwordText( value );
	if ( text === null ) return `Passwords are at most ${ PASSWORD_MAX_BYTES } bytes (about ${ PASSWORD_MAX_BYTES } letters)`;
	if ( [ ...text ].length < PASSWORD_MIN ) return `Passwords are at least ${ PASSWORD_MIN } characters`;
	const lower = text.toLowerCase();
	if ( COMMON.has( lower ) || /^(.)\1*$/u.test( text ) ) return 'That password is one of the commonest. Pick another';
	if ( username && lower === usernameKey( username ) ) return 'Your password can\'t be your username';
	return '';

}
