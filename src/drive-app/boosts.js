// The Garage's boost styles: what the booster leaves behind it, by drive-boosts.js's names for them
// ('classic' is drive-fx.js's flame, in the colour picked under it). Kept apart from the paint
// (paint.js), which reads this list as one more part of a look. The first three are free; the rest
// come with the Supporter Pass. Each has a little picture for its button.

const svg = body => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${ body }</svg>`;

export const BOOSTS = [
	{
		id: 'classic', name: 'Classic flame', free: true,
		icon: svg( '<path d="M12 2.5c.6 3.6 5.5 5.4 5.5 11a5.5 5.5 0 0 1-11 0c0-3 1.8-4.6 2.4-6.6 1 1.3 1.6 2.6 1.6 4.1 1.6-2.4 1.9-5.4 1.5-8.5z" fill="#ff6a1a"/><path d="M12 11c.4 1.8 2.6 2.8 2.6 5.2a2.6 2.6 0 0 1-5.2 0c0-1.7 1.2-2.6 1.6-3.7.6.6.9 1.3.9 2 .5-1 .6-2.2.1-3.5z" fill="#fff2b0"/>' ),
	},
	{
		id: 'bubbles', name: 'Bubbles', free: true,
		icon: svg( '<circle cx="9" cy="14" r="6" fill="none" stroke="#9fe8ff" stroke-width="1.8"/><circle cx="17.5" cy="7" r="3.8" fill="none" stroke="#ffc4ee" stroke-width="1.6"/><circle cx="18" cy="17.5" r="2.2" fill="none" stroke="#d8c6ff" stroke-width="1.4"/><path d="M6 11.5a3.5 3.5 0 0 1 2.5-1.8" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>' ),
	},
	{
		id: 'confetti', name: 'Confetti', free: true,
		icon: svg( '<rect x="3" y="5" width="6" height="3.4" rx=".5" transform="rotate(-25 6 6.7)" fill="#ff3b5c"/><rect x="13" y="3" width="6" height="3.4" rx=".5" transform="rotate(30 16 4.7)" fill="#ffc21a"/><rect x="8" y="12" width="6" height="3.4" rx=".5" transform="rotate(12 11 13.7)" fill="#2f9bff"/><rect x="15" y="15" width="6" height="3.4" rx=".5" transform="rotate(-40 18 16.7)" fill="#2fd06b"/><rect x="2" y="17" width="5" height="3" rx=".5" transform="rotate(35 4.5 18.5)" fill="#b05cff"/>' ),
	},
	{
		id: 'plasma', name: 'Plasma',
		icon: svg( '<path d="M12 2.5c.6 3.6 5.5 5.4 5.5 11a5.5 5.5 0 0 1-11 0c0-3 1.8-4.6 2.4-6.6 1 1.3 1.6 2.6 1.6 4.1 1.6-2.4 1.9-5.4 1.5-8.5z" fill="#2f8dff"/><path d="M9.5 12.5l2 1.5-1 2 2.5 1.5" fill="none" stroke="#f2fbff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' ),
	},
	{
		id: 'lightning', name: 'Lightning',
		icon: svg( '<path d="M14 1.5 5 13.5h6l-2 9 10-13h-6.2z" fill="#b48cff" stroke="#f3eaff" stroke-width="1.2" stroke-linejoin="round"/>' ),
	},
	{
		id: 'glitter', name: 'Glitter',
		icon: svg( '<path d="M9 3l1.4 4.6L15 9l-4.6 1.4L9 15l-1.4-4.6L3 9l4.6-1.4z" fill="#ffe08a"/><path d="M17.5 12l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" fill="#ffb3ec"/><path d="M17 2.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" fill="#a8f0ff"/><circle cx="7" cy="19" r="1.4" fill="#fff"/>' ),
	},
	{
		id: 'comet', name: 'Comet',
		icon: svg( '<path d="M3 21 15 9" stroke="#4a6dff" stroke-width="5" stroke-linecap="round" opacity=".55"/><path d="M6 18 15 9" stroke="#bfe8ff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16.5" cy="7.5" r="4.5" fill="#eaffff"/>' ),
	},
	{
		id: 'rings', name: 'Neon rings',
		icon: svg( '<ellipse cx="7" cy="12" rx="3" ry="6" fill="none" stroke="#3df2ff" stroke-width="2"/><ellipse cx="13" cy="12" rx="3.4" ry="7.5" fill="none" stroke="#ff3df0" stroke-width="2"/><ellipse cx="19" cy="12" rx="2.6" ry="5" fill="none" stroke="#9dff3d" stroke-width="2"/>' ),
	},
	{
		id: 'fireworks', name: 'Fireworks',
		icon: svg( '<g stroke="#ffd23f" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></g><circle cx="12" cy="12" r="2.2" fill="#ff4d6d"/>' ),
	},
	{
		id: 'hearts', name: 'Hearts',
		icon: svg( '<path d="M12 21C5.5 16.5 3 13.3 3 9.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 9 2.6c0 3.7-2.5 6.9-9 11.4z" fill="#ff3d7f"/><ellipse cx="7.6" cy="9" rx="1.6" ry="1" transform="rotate(-35 7.6 9)" fill="#fff" opacity=".85"/>' ),
	},
	{
		id: 'pixel', name: 'Pixel',
		icon: svg( '<rect x="3" y="11" width="6" height="6" fill="#ff3b5c"/><rect x="9" y="5" width="6" height="6" fill="#ffe14d"/><rect x="15" y="11" width="6" height="6" fill="#2fb6ff"/><rect x="10" y="15" width="4" height="4" fill="#3ce05a"/>' ),
	},
	{
		id: 'ink', name: 'Ink',
		icon: svg( '<path d="M12 4.5c2 0 2.6 2.3 4.4 2.6 2.4.4 3.6 2.5 2.6 4.6-.7 1.5.6 3-.4 4.6-1.2 1.9-3.4 1.2-4.8 2.4-1.5 1.3-3.8 1.1-4.6-.7-.6-1.4-2.6-1.5-3-3.3-.5-2 1.4-3 1.2-4.6-.3-2.4 1.6-3.6 4.6-5.6z" fill="#ff2d95"/><circle cx="20.5" cy="5" r="1.4" fill="#ff2d95"/><circle cx="4" cy="19.5" r="1.2" fill="#ff2d95"/><circle cx="21" cy="19" r=".9" fill="#ff2d95"/>' ),
	},
];
