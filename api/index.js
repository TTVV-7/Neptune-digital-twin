import { vercelApi } from '../worker/vercel.js';

// The app's API on Vercel (docs/deploy-vercel.md): vercel.json sends every /api/* request to this
// one function, which runs the Cloudflare Worker's code (worker/) on Postgres. Helpers live in
// worker/, not here: every file in api/ becomes a function of its own.
export default vercelApi();
