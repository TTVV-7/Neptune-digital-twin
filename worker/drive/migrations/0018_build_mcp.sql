-- World Drive Build's MCP server (worker/drive/mcp.js) and the OAuth it's reached by
-- (worker/drive/oauth.js): Claude (or any MCP client) registers, the person allows it on
-- worlddrive.app with their World Drive account, and gets tokens that act as that account. Applied by
-- the deploy (npm run deploy:drive). Times are milliseconds since 1970. Only SHA-256 hashes of codes
-- and tokens are kept, so a copy of the database can't be used to act as anyone.

-- Clients, registered by themselves (RFC 7591). redirect_uris: a JSON array.
CREATE TABLE oauth_clients (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	redirect_uris TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

-- Authorization codes, each used once, for ten minutes, with its PKCE challenge (S256).
CREATE TABLE oauth_codes (
	code_hash TEXT PRIMARY KEY,
	client_id TEXT NOT NULL,
	account_id INTEGER NOT NULL REFERENCES accounts ( id ) ON DELETE CASCADE,
	redirect_uri TEXT NOT NULL,
	challenge TEXT NOT NULL,
	expires_at INTEGER NOT NULL
);

-- Access tokens (an hour) and refresh tokens (30 days, replaced each time they're used).
CREATE TABLE oauth_tokens (
	token_hash TEXT PRIMARY KEY,
	kind TEXT NOT NULL,
	client_id TEXT NOT NULL,
	account_id INTEGER NOT NULL REFERENCES accounts ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX oauth_tokens_by_account ON oauth_tokens ( account_id );
CREATE INDEX oauth_tokens_by_expiry ON oauth_tokens ( expires_at );

-- Each tool call, for the hourly limit an account has.
CREATE TABLE mcp_calls (
	account_id INTEGER NOT NULL REFERENCES accounts ( id ) ON DELETE CASCADE,
	at INTEGER NOT NULL
);

CREATE INDEX mcp_calls_by_account ON mcp_calls ( account_id, at );
