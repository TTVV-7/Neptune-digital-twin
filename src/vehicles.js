// The vehicle library lives in public/vehicles and isn't tied to any one site: vehicles.json lists
// each model with its real-world scale, which way its front faces, and its licence credit.
// Add more with `npm run add-vehicle` (see README).

export async function loadVehicleCatalog() {

	try {

		const res = await fetch( new URL( 'vehicles/vehicles.json', document.baseURI ) );
		return res.ok ? await res.json() : [];

	} catch {

		return [];

	}

}

// Rotation about the vertical axis that turns a model's front (the axis named in the catalog,
// in glTF's Y-up frame) to face -Z, so heading 0 means the vehicle faces north.
export function frontToYaw( front = '-z' ) {

	return { '-z': 0, '+z': Math.PI, '+x': Math.PI / 2, '-x': - Math.PI / 2 }[ front ] ?? 0;

}

// Model config for placing a catalog vehicle, in the same shape as MODELS in config.js.
export function vehicleConfig( vehicle, placement ) {

	return {
		name: vehicle.name,
		url: `vehicles/${ vehicle.file }`,
		scale: vehicle.scale,
		front: vehicle.front,
		up: null,
		...placement,
	};

}
