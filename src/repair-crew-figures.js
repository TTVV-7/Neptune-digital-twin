// The timeline's crew, drawn and animated (src/repair-crew.js places them): a labourer breaking
// out concrete with a hand-held pneumatic chipping hammer, and a compact remote-controlled
// demolition machine with a hydraulic breaker. Generic: no brands. Low-poly, about 3000 triangles
// each, readable from 15-25 m.
//
//   makeWorker( { aim } )  wall (aim 0), floor (aim -1.2) or soffit (aim 1.25), blended between;
//                          userData.setAim( aim ) re-poses the joints without rebuilding.
//   makeMachine()          tracked, outriggers down, three-part arm, breaker working in front.
//
// Metres, +Y up, every figure faces +Z with its origin on the ground. userData.reach() -> { forward,
// height, x } is the resting working point (the chisel or pick tip) from the figure's origin: put a
// figure at target - ( x, height, forward ) turned by its heading, and the tip touches the target.
// userData.tick( t ) animates for the absolute time t (s), with no state carried between calls;
// userData.dispose() frees what it made.

import * as THREE from 'three';

// ===========================================================================
// Shared helpers
// ===========================================================================

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (x) => x - Math.floor(x);
/** Smoothstep from e0 to e1 (works for e0 > e1 too). */
const smooth = (e0, e1, x) => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
/** Deterministic pseudo-random number in [0, 1) from any number (no Math.random, so no drift). */
const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);
/** A time argument: finite seconds, or null for the rest pose. */
const timeOrNull = (t) => (Number.isFinite(t) ? t : null);

/**
 * Work/pause envelope of a breaker operator: hammering for `onFrac` of every `period` seconds,
 * then the trigger is released to re-bite. Smooth 0..1, pure function of t.
 */
function dutyCycle(t, period, onFrac, phase = 0) {
	const ph = frac(t / period + phase);
	return smooth(0, 0.04, ph) * (1 - smooth(onFrac - 0.04, onFrac, ph));
}

/** Collects every geometry and material a figure creates so dispose() can free them. */
class Kit {
	constructor() {
		this.geometries = new Set();
		this.materials = new Set();
		this.cache = new Map();
	}
	mat(color, opts = {}) {
		const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
		this.materials.add(m);
		return m;
	}
	geo(geometry) {
		this.geometries.add(geometry);
		return geometry;
	}
	/** One geometry per key, built on first use and shared by every mesh that asks for it. */
	shared(key, build) {
		let g = this.cache.get(key);
		if (!g) this.cache.set(key, (g = this.geo(build())));
		return g;
	}
	mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
		this.geometries.add(geometry);
		const m = new THREE.Mesh(geometry, material);
		m.position.set(x, y, z);
		parent.add(m);
		return m;
	}
	dispose() {
		for (const g of this.geometries) g.dispose();
		for (const m of this.materials) m.dispose();
		this.geometries.clear();
		this.materials.clear();
		this.cache.clear();
	}
}

/** An empty transform node (a joint) with a fixed offset inside its parent. */
function joint(parent, name, x = 0, y = 0, z = 0) {
	const j = new THREE.Group();
	j.name = name;
	j.position.set(x, y, z);
	parent.add(j);
	return j;
}

/**
 * Transform of `obj` relative to the figure's own root group (not the world), so poses and
 * reach() do not depend on where the figure is placed. Every local matrix on the way is
 * refreshed, so a joint edit can never leave a stale result behind.
 */
function rootMatrix(obj, root, out) {
	out.identity();
	for (let o = obj; o && o !== root; o = o.parent) {
		o.updateMatrix();
		out.premultiply(o.matrix);
	}
	return out;
}
const _rm = new THREE.Matrix4();
const _rp = new THREE.Vector3();
const _rs = new THREE.Vector3();
function rootPos(obj, root, out) {
	return out.setFromMatrixPosition(rootMatrix(obj, root, _rm));
}
function rootQuat(obj, root, out) {
	rootMatrix(obj, root, _rm).decompose(_rp, out, _rs);
	return out;
}
const _pq = new THREE.Quaternion();
/** Give joint `j` the root-space orientation `q` (converted to its parent's frame). */
function setRootQuat(j, root, q) {
	rootQuat(j.parent, root, _pq);
	j.quaternion.copy(_pq.invert().multiply(q));
	j.updateMatrix();
}
const _aq = new THREE.Quaternion();
/** Rotate joint `j` so that its rest axis (local -Y, i.e. "down the limb") points along `dir` (root space). */
function aimJoint(j, root, dir) {
	_aq.setFromUnitVectors(DOWN, dir);
	setRootQuat(j, root, _aq);
}

/**
 * Analytic two-bone IK. Upper bone from S (length l1), lower bone (length l2) towards T.
 * The middle joint bends towards `pole`. Writes the middle joint and the reachable end point.
 */
const _ikDir = new THREE.Vector3();
const _ikBend = new THREE.Vector3();
function solveTwoBone(S, T, l1, l2, pole, outMid, outEnd) {
	_ikDir.subVectors(T, S);
	const dist = clamp(_ikDir.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995);
	_ikDir.normalize();
	const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist); // distance to the mid joint's projection
	const h = Math.sqrt(Math.max(0, l1 * l1 - a * a)); // how far the mid joint sticks out
	_ikBend.copy(pole).addScaledVector(_ikDir, -pole.dot(_ikDir));
	if (_ikBend.lengthSq() < 1e-8) _ikBend.set(0, 0, 1);
	_ikBend.normalize();
	outMid.copy(S).addScaledVector(_ikDir, a).addScaledVector(_ikBend, h);
	outEnd.copy(S).addScaledVector(_ikDir, dist);
}

/** Lathe (surface of revolution about Y) from a flat [r, y, r, y, ...] profile, optionally squashed in depth. */
function latheGeo(profile, segments, depthScale = 1) {
	const pts = [];
	for (let i = 0; i < profile.length; i += 2) pts.push(new THREE.Vector2(profile[i], profile[i + 1]));
	const g = new THREE.LatheGeometry(pts, segments);
	if (depthScale !== 1) g.scale(1, 1, depthScale);
	return g;
}
/** Radius of a [r, y, ...] lathe profile at height y (piecewise linear). */
function profileRadius(profile, y) {
	for (let i = 0; i + 3 < profile.length; i += 2) {
		const r0 = profile[i], y0 = profile[i + 1], r1 = profile[i + 2], y1 = profile[i + 3];
		if (y >= y0 && y <= y1) return y1 === y0 ? Math.max(r0, r1) : lerp(r0, r1, (y - y0) / (y1 - y0));
	}
	return 0;
}
/** Reflective band hugging a lathe profile between heights y0..y1. */
function bandGeo(profile, y0, y1, segments, depthScale, gap = 0.006) {
	const r = Math.max(profileRadius(profile, y0), profileRadius(profile, (y0 + y1) / 2), profileRadius(profile, y1)) + gap;
	const g = new THREE.LatheGeometry([new THREE.Vector2(r, y0), new THREE.Vector2(r, y1)], segments);
	g.scale(1, 1, depthScale);
	return g;
}

/** Cylinder whose axis runs along +Z from z0 to z1 (r0 at z0, r1 at z1). */
function zCyl(r0, r1, z0, z1, seg) {
	const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg);
	g.rotateX(Math.PI / 2);
	g.translate(0, 0, (z0 + z1) / 2);
	return g;
}
/** Cylinder whose axis runs along X, centred on (x, y, z). */
function xCyl(r, len, seg, x = 0, y = 0, z = 0) {
	const g = new THREE.CylinderGeometry(r, r, len, seg);
	g.rotateZ(Math.PI / 2);
	g.translate(x, y, z);
	return g;
}
/** Box spanning z0..z1 along Z, centred on x = 0 and on height y. */
function zBox(w, h, z0, z1, y = 0) {
	const g = new THREE.BoxGeometry(w, h, z1 - z0);
	g.translate(0, y, (z0 + z1) / 2);
	return g;
}
/** Static cylinder between two points (unit geometry shared per radius, stretched along its axis). */
function rodBetween(kit, parent, a, b, r, material, seg = 8, openEnded = false) {
	const geo = kit.shared(`rod:${r}:${seg}:${openEnded}`, () => new THREE.CylinderGeometry(r, r, 1, seg, 1, openEnded));
	const d = new THREE.Vector3().subVectors(b, a);
	const m = kit.mesh(geo, material, parent);
	m.position.copy(a).addScaledVector(d, 0.5);
	m.scale.y = d.length();
	m.quaternion.setFromUnitVectors(UP, d.normalize());
	return m;
}
/** Static square beam between two points (unit geometry shared per section). */
function beamBetween(kit, parent, a, b, w, h, material) {
	const geo = kit.shared(`beam:${w}:${h}`, () => new THREE.BoxGeometry(w, 1, h));
	const d = new THREE.Vector3().subVectors(b, a);
	const m = kit.mesh(geo, material, parent);
	m.position.copy(a).addScaledVector(d, 0.5);
	m.scale.y = d.length();
	m.quaternion.setFromUnitVectors(UP, d.normalize());
	return m;
}
const _ax = new THREE.Vector3(), _az = new THREE.Vector3(), _am = new THREE.Matrix4();
/**
 * Turn `obj` so its local +Y runs along the unit vector `d` while its local X stays horizontal.
 * A cylinder lying on the floor then keeps a tight bounding box (its cross-section is not
 * tipped corner-down), so nothing reads as dipping below y = 0.
 */
function alignY(obj, d) {
	_ax.crossVectors(UP, d);
	if (_ax.lengthSq() < 1e-8) _ax.set(1, 0, 0);
	_ax.normalize();
	_az.crossVectors(_ax, d).normalize();
	obj.quaternion.setFromRotationMatrix(_am.makeBasis(_ax, d, _az));
}
/**
 * Extrude a side-view outline drawn in (z, y) across X, centred on x = 0.
 * outline: [[z, y], ...] or a THREE.Shape whose x is the figure's z.
 */
function sideExtrude(outline, width, curveSegments = 6) {
	let shape = outline;
	if (Array.isArray(outline)) {
		shape = new THREE.Shape();
		outline.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
		shape.closePath();
	}
	const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments });
	g.rotateY(-Math.PI / 2); // shape x -> +Z, extrusion -> -X
	g.translate(width / 2, 0, 0);
	return g;
}
/** Stadium (rounded-end) outline in (z, y): length L along z, height H, bottom on y = y0. */
function stadiumShape(L, H, y0 = 0) {
	const r = H / 2, c = L / 2 - r;
	const s = new THREE.Shape();
	s.moveTo(-c, y0);
	s.lineTo(c, y0);
	s.absarc(c, y0 + r, r, -Math.PI / 2, Math.PI / 2, false);
	s.lineTo(-c, y0 + H);
	s.absarc(-c, y0 + r, r, Math.PI / 2, Math.PI * 1.5, false);
	return s;
}

/**
 * Hydraulic ram re-posed between two points: barrel from `a` (62 % of the length), a darker
 * gland collar at the barrel mouth and a chrome rod out to `b`. Geometry is shared per size.
 */
function makeRam(kit, parent, barrelR, rodR, mats) {
	const group = joint(parent, 'ram');
	const barrelGeo = kit.shared(`ramBarrel:${barrelR}`, () => new THREE.CylinderGeometry(barrelR, barrelR, 1, 8).translate(0, 0.5, 0));
	const collarGeo = kit.shared(`ramCollar:${barrelR}`, () => new THREE.CylinderGeometry(barrelR * 1.2, barrelR * 1.2, 0.035, 6).translate(0, -0.0175, 0));
	// the rod's ends are hidden in the barrel and the clevis, so it needs no caps
	const rodGeo = kit.shared(`ramRod:${rodR}`, () => new THREE.CylinderGeometry(rodR, rodR, 1, 6, 1, true).translate(0, 0.5, 0));
	const barrel = kit.mesh(barrelGeo, mats.barrel, group);
	const collar = kit.mesh(collarGeo, mats.collar, group);
	const rod = kit.mesh(rodGeo, mats.rod, group);
	const d = new THREE.Vector3();
	return {
		group,
		/** a, b in the parent's frame. The barrel sits at a, the rod end at b. */
		set(a, b) {
			d.subVectors(b, a);
			const len = d.length();
			group.position.copy(a);
			group.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
			barrel.scale.set(1, len * 0.62, 1);
			collar.position.y = len * 0.62;
			rod.position.y = len * 0.38;
			rod.scale.set(1, len * 0.62, 1);
		},
	};
}

/** Interpolate a keyframe table (sorted by .aim) at x into `out` (numbers and arrays are lerped). */
function sampleKeys(keys, x, out) {
	x = clamp(x, keys[0].aim, keys[keys.length - 1].aim);
	let i = 0;
	while (i < keys.length - 2 && x > keys[i + 1].aim) i++;
	const a = keys[i], b = keys[i + 1];
	const t = (x - a.aim) / (b.aim - a.aim);
	for (const key of Object.keys(a)) {
		const va = a[key], vb = b[key];
		if (Array.isArray(va)) {
			const arr = (out[key] ??= new Array(va.length));
			for (let j = 0; j < va.length; j++) arr[j] = lerp(va[j], vb[j], t);
		} else out[key] = lerp(va, vb, t);
	}
	return out;
}

// ===========================================================================
// Dust puffs and concrete chips (shared by the worker and the machine)
// ===========================================================================

/**
 * Looping dust puffs and flying chips at a breaking point. Every particle lives for one cycle,
 * starts and ends invisible (so the loop never pops) and gets a fresh random seed each cycle.
 * Pure function of t. Positions are in `parent` space; nothing ever goes below y = 0.
 */
const PUFF_HALF_HEIGHT = 0.851; // half-height of a unit icosahedron (detail 0), unrotated
function buildDust(kit, parent, opts = {}) {
	const {
		puffs = 6, chips = 4, size = 0.045, life = 0.9, spread = 0.17, chipSize = 0.012,
		color = '#bdb7ab', chipColor = '#77736c', opacity = 0.55,
	} = opts;
	const puffGeo = kit.geo(new THREE.IcosahedronGeometry(1, 0));
	puffGeo.setAttribute('normal', puffGeo.getAttribute('position').clone()); // sphere normals: soft puffs
	const chipGeo = kit.geo(new THREE.TetrahedronGeometry(1));
	const chipMat = kit.mat(chipColor, { flatShading: true, roughness: 0.95 });
	const puffMeshes = [];
	const chipMeshes = [];
	for (let i = 0; i < puffs; i++) {
		const mat = kit.mat(color, { transparent: true, opacity: 0, depthWrite: false, roughness: 1 });
		puffMeshes.push(kit.mesh(puffGeo, mat, parent));
	}
	for (let i = 0; i < chips; i++) chipMeshes.push(kit.mesh(chipGeo, chipMat, parent));
	const all = [...puffMeshes, ...chipMeshes];
	const o = new THREE.Vector3(), n = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
	const p = new THREE.Vector3();
	/** Tangents of the broken surface around the normal n. */
	const tangents = () => {
		tA.set(0, 1, 0).cross(n);
		if (tA.lengthSq() < 1e-4) tA.set(1, 0, 0);
		tA.normalize();
		tB.crossVectors(n, tA).normalize();
	};
	return {
		/** Park every particle, tiny and invisible, just above `at` (never below the ground). */
		hide(at) {
			for (const m of all) {
				m.visible = false;
				m.scale.setScalar(1e-4);
				m.position.set(at.x, Math.max(at.y, 0) + 0.002, at.z);
			}
		},
		/**
		 * originAt(te, outPoint, outNormal): where the bit was biting at emission time te and the
		 * unit normal out of that surface. activeAt(te) -> 0..1: how hard the tool was working then.
		 */
		update(t, originAt, activeAt) {
			puffMeshes.forEach((m, i) => {
				const ph = t / life + i / puffs, age = frac(ph), seed = i * 17.3 + Math.floor(ph) * 3.71;
				const te = t - age * life;
				const intensity = activeAt(te);
				originAt(te, o, n);
				tangents();
				const ra = hash(seed) * 2 - 1, rb = hash(seed + 1.7) * 2 - 1;
				const out = spread * (0.15 + 0.85 * (1 - (1 - age) ** 2)); // billows out, then slows down
				const s = size * (0.3 + 1.5 * age) * (0.75 + 0.5 * hash(seed + 4.2));
				p.copy(o).addScaledVector(n, 0.02 + out * 0.8).addScaledVector(tA, ra * out * 0.9).addScaledVector(tB, rb * out * 0.9);
				p.y += 0.05 * age - 0.12 * age * age; // brief lift, then settles
				p.y = Math.max(p.y, PUFF_HALF_HEIGHT * s + 0.001); // a puff never dips into the floor
				m.position.copy(p);
				m.scale.setScalar(s);
				m.material.opacity = opacity * intensity * smooth(0, 0.12, age) * (1 - age) ** 1.5;
				m.visible = m.material.opacity > 0.01;
			});
			chipMeshes.forEach((m, i) => {
				const cl = life * 0.7, ph = t / cl + i / chips + 0.37, age = frac(ph), seed = i * 9.1 + Math.floor(ph) * 5.3;
				const te = t - age * cl;
				const intensity = activeAt(te) > 0.5 ? 1 : 0;
				originAt(te, o, n);
				tangents();
				const ra = hash(seed) * 2 - 1, rb = hash(seed + 2.3) * 2 - 1;
				// initial velocity: out of the surface, sideways, a little up
				const vx = n.x * 1.1 + tA.x * ra * 0.7 + tB.x * rb * 0.7;
				const vy = n.y * 1.1 + tA.y * ra * 0.7 + tB.y * rb * 0.7 + 0.5;
				const vz = n.z * 1.1 + tA.z * ra * 0.7 + tB.z * rb * 0.7;
				const c = chipSize * (0.6 + 0.8 * hash(seed + 7)); // this chip's radius
				const h0 = Math.max(0, o.y - c);
				const tLand = (vy + Math.sqrt(vy * vy + 2 * 9.81 * h0)) / 9.81;
				const tau = Math.min(age * cl, tLand);
				m.position.set(o.x + vx * tau, Math.max(c + 0.001, o.y + vy * tau - 4.905 * tau * tau), o.z + vz * tau);
				m.scale.setScalar(Math.max(1e-4, c * intensity * (1 - smooth(0.75, 1, age)) * smooth(0, 0.05, age)));
				m.rotation.set(age * 25 + seed, age * 17, 0);
				m.visible = m.scale.x > 2e-4;
			});
		},
	};
}

// ===========================================================================
// Worker
// ===========================================================================

/** Body dimensions (metres) for a ~1.75 m adult, roughly 8 heads tall. */
const BODY = {
	ankleH: 0.085, // ankle joint above the ground (= boot sole to ankle)
	shin: 0.42, // knee -> ankle
	thigh: 0.42, // hip -> knee
	hipX: 0.09, // half the distance between the hip joints
	lumbarY: 0.1, // hip-joint level -> lumbar joint
	chestY: 0.17, // lumbar -> chest joint
	shoulderX: 0.185, // half the distance between the shoulder joints
	shoulderY: 0.235, // chest joint -> shoulder joints
	neckY: 0.265, // chest joint -> neck base
	headY: 0.135, // neck base -> head centre
	upperArm: 0.29, // shoulder -> elbow
	forearm: 0.265, // elbow -> wrist
	fist: 0.07, // wrist -> centre of the fist (where the gripped bar runs)
	shrug: 0.035, // how far a shoulder may reach towards a far grip (m)
};
const LEG_LEN = BODY.thigh + BODY.shin;
/** Hips are lowered automatically whenever a foot would need more than this fraction of the leg. */
const LEG_MAX_STRETCH = 0.985;

/** Hand-held pneumatic chipping hammer. Tool origin = centre of the D-handle grip bar, axis +Z. */
const TOOL = {
	barHalf: 0.09, // D-handle grip bar half-length (along X): wide enough for two gloved hands
	barR: 0.017,
	loopZ: 0.072, // where the D-loop meets the back head
	headZ0: 0.065, headZ1: 0.118, headR: 0.05, // back head / valve chest
	bodyZ1: 0.25, bodyR: 0.042, // cylinder
	sleeveZ1: 0.36, sleeveR: 0.035, // rubber grip sleeve on the front (front-hand grip)
	retainerZ1: 0.4, retainerR: 0.026, // chisel retainer
	chiselZ1: 0.6, chiselR: 0.012, // hex chisel shank
	tipZ: 0.65, // point of the chisel
	inlet: [-0.078, -0.022, 0.092], // end of the air fitting on the right side of the back head
	inletDir: [-1, -0.45, -0.1],
	stroke: 0.008, // hammering stroke (m): the tool kicks back this far from the work on each blow
	freq: 19, // blows per second
	workPeriod: 3.7, workOn: 0.78, workPhase: 0.3, // hammer ~2.9 s, release ~0.8 s to re-bite
	backOff: 0.012, // the bit lifts this far off the face while the trigger is released
};

/** Where the hands go, in tool space: point + the direction of the bar the fist closes round. */
const grip = (p, axis) => ({ p: v3(p), axis: v3(axis) });
const GRIPS = {
	rear: grip([0, 0, 0], [1, 0, 0]), // right hand, middle of the D-handle
	rearRight: grip([-0.046, 0, 0], [1, 0, 0]), // two hands on the handle (floor work)
	rearLeft: grip([0.046, 0, 0], [1, 0, 0]),
};

/** Supported aim range (rad). Steeper overhead aims would need a taller reach than an arm has. */
const AIM_MIN = -1.4, AIM_MAX = 1.25;
/** Aim band over which the left hand slides from the front sleeve back to the D-handle. */
const TWO_HANDS_FROM = -0.3, TWO_HANDS_AT = -0.95;

/**
 * Pose keyframes by aim (radians, = pitch of the tool). Lengths in metres, angles in radians.
 *  tip: rest position of the chisel point (always on x = 0). pelvis: hip-joint centre
 *  (lowered automatically if a leg cannot reach its foot). pitch > 0 leans forward;
 *  yaw < 0 turns the left shoulder forward. foot: [x, z] of the ankle on the ground;
 *  pole: elbow bend direction (root space). frontGrip: where the left hand holds the sleeve
 *  (tool z). hose: [x, z, out, lead]: where the air hose meets the floor, how far it leaves the
 *  inlet before drooping, and how far ahead of that point it arrives along the floor.
 */
const WORKER_POSES = [
	{
		aim: -1.2, // chipping the floor just in front: bent at hips and knees, both hands on the handle
		tip: [0.0, 0.002, 0.6], // 2 mm up: the point's (conservative) bounds stay above the floor
		pelvis: [0.0, 0.73, -0.22], pelvisPitch: 0.42, pelvisYaw: 0.0,
		lumbarPitch: 0.28, chestPitch: 0.2, chestYaw: 0.0,
		footL: [0.18, -0.03], footR: [-0.18, -0.06], footYawL: 0.3, footYawR: -0.3,
		poleL: [1.0, -0.3, 0.2], poleR: [-1.0, -0.3, 0.2],
		headLook: 0.6, frontGrip: 0.325,
		hose: [-0.5, 0.12, 0.25, 0.3],
	},
	{
		aim: 0, // chipping a wall at waist-to-chest height: lunging into the tool, left foot forward
		tip: [0.0, 1.17, 1.02],
		pelvis: [0.05, 0.862, 0.0], pelvisPitch: 0.1, pelvisYaw: -0.18,
		lumbarPitch: 0.12, chestPitch: 0.12, chestYaw: -0.26,
		footL: [0.18, 0.23], footR: [-0.1, -0.23], footYawL: 0.08, footYawR: -0.55,
		poleL: [0.7, -1.0, -0.1], poleR: [-0.95, -0.8, -0.55],
		headLook: 0.75, frontGrip: 0.325,
		hose: [-0.46, -0.02, 0.3, 0.35],
	},
	{
		aim: 1.25, // chipping a soffit overhead: upright and braced, arms raised
		tip: [0.0, 2.18, 0.47],
		pelvis: [0.1, 0.9, -0.02], pelvisPitch: -0.02, pelvisYaw: -0.1, // body left of the tool: handle beside the face
		lumbarPitch: -0.04, chestPitch: -0.02, chestYaw: -0.16,
		footL: [0.24, 0.15], footR: [-0.05, -0.17], footYawL: 0.15, footYawR: -0.45,
		poleL: [0.8, -1.0, 0.1], poleR: [-0.8, -1.0, -0.1],
		headLook: 0.7, frontGrip: 0.27,
		hose: [-0.58, -0.12, 0.42, 0.3],
	},
];

const WORKER_COLORS = {
	vest: '#c9ec1f', // fluorescent yellow-green
	reflect: '#dfe5ea', // silver reflective tape
	shirt: '#283850', // navy work shirt
	trousers: '#2d323a',
	skin: '#c18f6c',
	hair: '#3a2c22',
	hat: '#f5f5f0',
	glove: '#c48a3c',
	boot: '#3b2b1f',
	sole: '#161616',
	lens: '#8fc2dc', // light blue-tinted safety lenses: they read against skin and under the brim
	frame: '#1d2b36',
	earMuff: '#c23a2b',
	mask: '#ebe8e0',
	toolBody: '#2c3035',
	toolGrip: '#131313',
	steel: '#a2aab2',
	hose: '#b8291d', // red air hose: reads as its own object next to the hi-vis vest
	dust: '#bdb7ab',
	chips: '#77736c',
};

/** Air hose dimensions. */
const HOSE = { r: 0.014, hang: 10, tail: 4, tailBack: 0.9 };

/** Profiles ([r, y, ...] from bottom to top) of the turned body parts. */
const PROFILE = {
	hips: [0, -0.115, 0.1, -0.105, 0.152, -0.06, 0.16, -0.01, 0.142, 0.06, 0.115, 0.13, 0, 0.14],
	abdomen: [0, -0.1, 0.182, -0.095, 0.172, -0.03, 0.163, 0.04, 0.158, 0.12, 0.16, 0.19, 0, 0.2],
	chest: [0, -0.07, 0.125, -0.065, 0.142, 0.0, 0.17, 0.035, 0.188, 0.14, 0.196, 0.2, 0.186, 0.245, 0.15, 0.28, 0.08, 0.3, 0, 0.305],
	upperArm: [0, -0.318, 0.034, -0.31, 0.046, -0.27, 0.052, -0.15, 0.06, -0.03, 0.05, 0.04, 0, 0.065],
	forearm: [0, -0.27, 0.035, -0.262, 0.037, -0.19, 0.047, -0.06, 0.046, 0.0, 0, 0.04],
	thigh: [0, -0.465, 0.05, -0.45, 0.064, -0.38, 0.08, -0.17, 0.088, -0.04, 0.078, 0.035, 0, 0.075],
	shin: [0, -0.4, 0.05, -0.39, 0.052, -0.26, 0.062, -0.1, 0.06, 0.0, 0, 0.05],
};
const TORSO_DEPTH = 0.64; // depth / width of the torso cross-section

/** Turned body parts, garments and PPE hung on the skeleton. */
function buildWorkerBody(kit, M, J) {
	const { pelvis, lumbar, chest, neck, head, legs, arms } = J;
	const SEG = 10;

	// --- torso: trousers at the hips, hi-vis vest on the abdomen and chest -------------------
	kit.mesh(latheGeo(PROFILE.hips, SEG, TORSO_DEPTH - 0.04), M.trousers, pelvis);
	kit.mesh(latheGeo(PROFILE.abdomen, SEG, TORSO_DEPTH + 0.02), M.vest, lumbar); // hem flares over the hips
	kit.mesh(latheGeo(PROFILE.chest, SEG, TORSO_DEPTH), M.vest, chest);
	kit.mesh(bandGeo(PROFILE.abdomen, -0.01, 0.03, SEG, TORSO_DEPTH + 0.02), M.reflect, lumbar);
	kit.mesh(bandGeo(PROFILE.chest, 0.005, 0.045, SEG, TORSO_DEPTH), M.reflect, chest); // also hides the abdomen/chest seam
	// vertical braces of the vest: front, over the shoulder, down the back
	for (const side of [1, -1]) kit.mesh(braceGeo(side * 0.088), M.reflect, chest);

	// --- neck and head ---------------------------------------------------------------------------
	kit.mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.13, 8), M.skin, neck, 0, 0.055, 0);
	const skull = new THREE.SphereGeometry(0.1, 10, 7);
	skull.scale(0.9, 1.15, 1.0);
	kit.mesh(skull, M.skin, head);
	// short hair at the back and sides of the head, below the hat
	const hair = new THREE.SphereGeometry(0.1, 8, 3, Math.PI * 1.08, Math.PI * 0.84, Math.PI * 0.2, Math.PI * 0.42);
	hair.scale(0.93, 1.16, 1.04);
	kit.mesh(hair, M.hair, head);
	// hard hat: shell and a brim with a front peak
	const shell = new THREE.SphereGeometry(0.13, 12, 4, 0, TAU, 0, Math.PI / 2);
	shell.scale(1.0, 0.95, 1.1);
	kit.mesh(shell, M.hat, head, 0, 0.04, -0.005);
	const brim = new THREE.CylinderGeometry(0.15, 0.152, 0.012, 12);
	brim.scale(1, 1, 1.15);
	kit.mesh(brim, M.hat, head, 0, 0.04, 0.02);
	// ear defenders clipped to the hat
	for (const side of [1, -1]) {
		kit.mesh(xCyl(0.041, 0.034, 8), M.earMuff, head, side * 0.104, -0.008, -0.008);
		kit.mesh(new THREE.BoxGeometry(0.012, 0.06, 0.016), M.toolGrip, head, side * 0.117, 0.03, -0.008);
	}
	// wrap-around safety glasses: tall tinted lens band with a dark top frame, clear of the brim
	const lens = new THREE.CylinderGeometry(0.1, 0.1, 0.042, 10, 1, true, -1.05, 2.1);
	lens.scale(0.98, 1, 1.08);
	kit.mesh(lens, M.lens, head, 0, 0.008, 0);
	const frame = new THREE.CylinderGeometry(0.101, 0.101, 0.008, 10, 1, true, -1.1, 2.2);
	frame.scale(0.98, 1, 1.08);
	kit.mesh(frame, M.frame, head, 0, 0.031, 0);
	// half-mask dust respirator
	const mask = new THREE.SphereGeometry(0.052, 7, 4);
	mask.scale(1.0, 0.85, 0.72);
	kit.mesh(mask, M.mask, head, 0, -0.05, 0.082);

	// --- arms: shirt sleeves and gloves ------------------------------------------------------
	const upperArmGeo = latheGeo(PROFILE.upperArm, 8);
	const forearmGeo = latheGeo(PROFILE.forearm, 8);
	const cuffGeo = new THREE.CylinderGeometry(0.047, 0.043, 0.06, 8);
	const fistGeo = new THREE.SphereGeometry(1, 6, 4); // rounded gloved fist; the bar runs through it along X
	fistGeo.scale(0.047, 0.05, 0.043);
	for (const arm of arms) {
		kit.mesh(upperArmGeo, M.shirt, arm.shoulder);
		kit.mesh(forearmGeo, M.shirt, arm.elbow);
		kit.mesh(cuffGeo, M.glove, arm.wrist, 0, -0.005, 0);
		kit.mesh(fistGeo, M.glove, arm.wrist, 0, -BODY.fist + 0.004, 0);
	}

	// --- legs: trousers with reflective bands, steel-toe boots --------------------------------
	const thighGeo = latheGeo(PROFILE.thigh, 8);
	const shinGeo = latheGeo(PROFILE.shin, 8);
	const shinBand = bandGeo(PROFILE.shin, -0.21, -0.17, 8, 1, 0.005);
	const bootGeo = sideExtrude(
		[[-0.078, -0.07], [0.205, -0.07], [0.222, -0.05], [0.205, -0.02], [0.15, 0.0], [0.07, 0.02], [0.055, 0.105], [-0.068, 0.105], [-0.085, -0.03]],
		0.104,
	);
	const soleGeo = new THREE.BoxGeometry(0.11, 0.016, 0.31);
	soleGeo.translate(0, -BODY.ankleH + 0.008, 0.07);
	const toeCapGeo = new THREE.SphereGeometry(0.056, 6, 2, 0, TAU, 0, Math.PI / 2);
	toeCapGeo.scale(0.95, 0.75, 1.0);
	for (const leg of legs) {
		kit.mesh(thighGeo, M.trousers, leg.hip);
		kit.mesh(shinGeo, M.trousers, leg.knee);
		kit.mesh(shinBand, M.reflect, leg.knee);
		kit.mesh(bootGeo, M.boot, leg.ankle);
		kit.mesh(soleGeo, M.sole, leg.ankle);
		kit.mesh(toeCapGeo, M.boot, leg.ankle, 0, -0.07, 0.165);
	}
}

/** A reflective brace strip at x on the chest: up the front, over the shoulder, down the back. */
function braceGeo(x) {
	const prof = PROFILE.chest;
	const halfW = 0.021, lift = 0.009;
	const centre = new THREE.Vector3(0, 0.12, 0);
	const pts = [];
	const ys = [0.03, 0.08, 0.13, 0.18, 0.22, 0.25, 0.27, 0.285]; // starts under the chest band
	const surf = (y, sgn) => {
		const r = profileRadius(prof, y);
		const z = sgn * TORSO_DEPTH * Math.sqrt(Math.max(0, r * r - x * x));
		const p = new THREE.Vector3(x, y, z);
		return p.add(new THREE.Vector3(0, p.y - centre.y, p.z).normalize().multiplyScalar(lift));
	};
	for (const y of ys) pts.push(surf(y, 1));
	pts.push(new THREE.Vector3(x, 0.3 + lift, 0)); // over the top of the shoulder
	for (let i = ys.length - 1; i >= 0; i--) pts.push(surf(ys[i], -1));
	const pos = [];
	const idx = [];
	pts.forEach((p, i) => {
		pos.push(p.x - halfW, p.y, p.z, p.x + halfW, p.y, p.z);
		if (i > 0) {
			const a = (i - 1) * 2;
			idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

/** The chipping hammer, built in tool space (origin at the D-handle grip, axis +Z). */
function buildBreaker(kit, M, parent) {
	const T = TOOL;
	const tool = joint(parent, 'breaker');
	tool.rotation.order = 'YXZ'; // yaw (wobble) then pitch (aim)
	// D-handle: rubber grip bar, two side bows to the back head, trigger lever inside the loop
	kit.mesh(xCyl(T.barR, T.barHalf * 2, 8), M.toolGrip, tool);
	for (const s of [1, -1]) {
		rodBetween(kit, tool, new THREE.Vector3(s * T.barHalf, 0, 0), new THREE.Vector3(s * (T.barHalf + 0.004), 0, 0.04), 0.012, M.toolBody, 6, true);
		rodBetween(kit, tool, new THREE.Vector3(s * (T.barHalf + 0.004), 0, 0.04), new THREE.Vector3(s * 0.03, 0, T.loopZ + 0.01), 0.012, M.toolBody, 6, true);
	}
	const trigger = kit.mesh(new THREE.BoxGeometry(0.07, 0.01, 0.024), M.steel, tool, 0, -0.006, 0.03);
	trigger.rotation.x = 0.35;
	// back head, cylinder with cooling ribs, grip sleeve, retainer
	kit.mesh(zCyl(T.headR, T.headR * 0.92, T.headZ0, T.headZ1, 12), M.toolBody, tool);
	kit.mesh(zCyl(T.bodyR, T.bodyR, T.headZ1, T.bodyZ1, 10), M.toolBody, tool);
	for (const z of [0.15, 0.2]) kit.mesh(zCyl(T.bodyR + 0.006, T.bodyR + 0.006, z, z + 0.014, 8), M.toolBody, tool);
	kit.mesh(zCyl(T.sleeveR + 0.004, T.sleeveR, T.bodyZ1, T.sleeveZ1, 10), M.toolGrip, tool);
	kit.mesh(zCyl(T.retainerR, T.retainerR * 0.9, T.sleeveZ1, T.retainerZ1, 8), M.steel, tool);
	// exhaust deflector on top
	kit.mesh(new THREE.BoxGeometry(0.03, 0.022, 0.05), M.toolBody, tool, 0, T.headR - 0.004, 0.09);
	// chisel: collar, hex shank, point
	kit.mesh(zCyl(0.019, 0.019, T.retainerZ1, T.retainerZ1 + 0.016, 6), M.steel, tool);
	kit.mesh(zCyl(T.chiselR, T.chiselR, T.retainerZ1, T.chiselZ1, 6), M.steel, tool);
	// the point is two cones so its bounding box stays tight where it touches the work
	const neckZ = T.tipZ - 0.012, neckR = (T.chiselR * 0.012) / (T.tipZ - T.chiselZ1);
	kit.mesh(zCyl(T.chiselR, neckR, T.chiselZ1, neckZ, 6), M.steel, tool);
	kit.mesh(zCyl(neckR, 0.0, neckZ, T.tipZ, 6), M.steel, tool);
	// air inlet: swivel fitting on the right of the back head
	rodBetween(kit, tool, new THREE.Vector3(-0.04, -0.012, 0.092), v3(T.inlet), 0.011, M.steel, 6, true);
	const tip = joint(tool, 'tip', 0, 0, T.tipZ);
	const inlet = joint(tool, 'inlet', ...T.inlet);
	return { tool, tip, inlet };
}

/**
 * Air hose laid from the pose: a hanging run (cubic Bezier from the tool's inlet down to the
 * pose's floor point) and a short tail on the floor ending in a claw coupling. Transforms only:
 * the geometry is never rebuilt.
 */
function buildHose(kit, M, root) {
	const R = HOSE.r;
	const FLOOR_Y = R + 0.004; // centreline height of the hose lying on the ground
	const N = HOSE.hang + HOSE.tail;
	const segGeo = kit.geo(new THREE.CylinderGeometry(R, R, 1, 6, 1, true));
	const segs = Array.from({ length: N }, () => kit.mesh(segGeo, M.hose, root));
	const COUPLING_R = 0.022;
	const coupling = kit.mesh(new THREE.CylinderGeometry(COUPLING_R, COUPLING_R, 0.07, 8), M.steel, root);
	const pts = Array.from({ length: N + 1 }, () => new THREE.Vector3());
	const bez = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
	const g2 = new THREE.Vector3(), g3 = new THREE.Vector3(), d = new THREE.Vector3();
	return {
		/** start, dir: the inlet fitting's end and outward direction (root space); key: pose hose key. */
		update(start, dir, key) {
			const [gx, gz, out, lead] = key;
			bez.v0.copy(start);
			bez.v1.copy(start).addScaledVector(dir, out);
			bez.v1.y = Math.max(bez.v1.y, FLOOR_Y);
			bez.v3.set(gx, FLOOR_Y, gz);
			bez.v2.set(gx + 0.04 * lead, FLOOR_Y, gz + lead); // arrives along the floor, heading back
			for (let i = 0; i <= HOSE.hang; i++) bez.getPoint(i / HOSE.hang, pts[i]);
			// tail: a gentle curve straight back behind the worker
			const g1 = bez.v3;
			g2.set(gx - 0.07, FLOOR_Y, gz - 0.5 * HOSE.tailBack);
			g3.set(gx - 0.02, FLOOR_Y, gz - HOSE.tailBack);
			for (let i = 1; i <= HOSE.tail; i++) {
				const s = i / HOSE.tail, r = 1 - s;
				pts[HOSE.hang + i].set(0, 0, 0).addScaledVector(g1, r * r).addScaledVector(g2, 2 * r * s).addScaledVector(g3, s * s);
			}
			for (let i = 0; i < N; i++) {
				d.subVectors(pts[i + 1], pts[i]);
				const len = d.length();
				const s = segs[i];
				s.position.copy(pts[i]).addScaledVector(d, 0.5);
				if (len < 1e-6) {
					s.scale.set(1, 1e-4, 1);
					continue;
				}
				alignY(s, d.multiplyScalar(1 / len));
				s.scale.set(1, len + 0.01, 1); // overlap hides the seams at the bends
			}
			d.subVectors(g3, pts[N - 1]).setY(0).normalize();
			coupling.position.copy(g3).addScaledVector(d, 0.03);
			coupling.position.y = COUPLING_R + 0.001;
			alignY(coupling, d);
		},
	};
}

/**
 * A construction worker breaking out concrete with a hand-held pneumatic chipping hammer.
 * aim (rad, = pitch of the tool): 0 = wall in front at waist-to-chest height, -1.2 = floor in front,
 * +1.25 = soffit overhead (chisel point at 2.18 m; higher soffits need a platform, raised by
 * soffitHeight - reach().height); values in between blend, values outside [-1.4, 1.25] are clamped.
 */
export function makeWorker({ aim = 0 } = {}) {
	const kit = new Kit();
	const C = WORKER_COLORS;
	const M = {
		vest: kit.mat(C.vest, { roughness: 0.75, emissive: C.vest, emissiveIntensity: 0.2 }),
		reflect: kit.mat(C.reflect, { roughness: 0.35, metalness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.2, side: THREE.DoubleSide }),
		shirt: kit.mat(C.shirt),
		trousers: kit.mat(C.trousers, { roughness: 0.9 }),
		skin: kit.mat(C.skin, { roughness: 0.7 }),
		hair: kit.mat(C.hair, { roughness: 0.95, side: THREE.DoubleSide }),
		hat: kit.mat(C.hat, { roughness: 0.45 }),
		glove: kit.mat(C.glove, { roughness: 0.9 }),
		boot: kit.mat(C.boot, { roughness: 0.7 }),
		sole: kit.mat(C.sole, { roughness: 0.95 }),
		lens: kit.mat(C.lens, { roughness: 0.15, metalness: 0.3, emissive: C.lens, emissiveIntensity: 0.25, side: THREE.DoubleSide }),
		frame: kit.mat(C.frame, { roughness: 0.5, side: THREE.DoubleSide }),
		earMuff: kit.mat(C.earMuff, { roughness: 0.55 }),
		mask: kit.mat(C.mask, { roughness: 0.9 }),
		toolBody: kit.mat(C.toolBody, { roughness: 0.5, metalness: 0.35 }),
		toolGrip: kit.mat(C.toolGrip, { roughness: 0.9 }),
		steel: kit.mat(C.steel, { roughness: 0.35, metalness: 0.6 }),
		hose: kit.mat(C.hose, { roughness: 0.65 }),
	};

	const root = new THREE.Group();
	root.name = 'worker';

	// --- skeleton: pelvis > lumbar > chest > (neck > head, shoulder > elbow > wrist); pelvis > hip > knee > ankle
	const pelvis = joint(root, 'pelvis');
	const lumbar = joint(pelvis, 'lumbar', 0, BODY.lumbarY, 0);
	const chest = joint(lumbar, 'chest', 0, BODY.chestY, 0);
	const neck = joint(chest, 'neck', 0, BODY.neckY, 0);
	const head = joint(neck, 'head', 0, BODY.headY, 0);
	const legs = [1, -1].map((side) => {
		const hip = joint(pelvis, side > 0 ? 'hipL' : 'hipR', side * BODY.hipX, 0, 0);
		const knee = joint(hip, 'knee', 0, -BODY.thigh, 0);
		const ankle = joint(knee, 'ankle', 0, -BODY.shin, 0);
		return { side, hip, knee, ankle };
	});
	const arms = [1, -1].map((side) => {
		const base = new THREE.Vector3(side * BODY.shoulderX, BODY.shoulderY, 0);
		const shoulder = joint(chest, side > 0 ? 'shoulderL' : 'shoulderR', base.x, base.y, base.z);
		const elbow = joint(shoulder, 'elbow', 0, -BODY.upperArm, 0);
		const wrist = joint(elbow, 'wrist', 0, -BODY.forearm, 0);
		return { side, base, shoulder, elbow, wrist };
	});
	buildWorkerBody(kit, M, { pelvis, lumbar, chest, neck, head, legs, arms });
	const { tool, tip: tipMarker, inlet } = buildBreaker(kit, M, root);
	const hose = buildHose(kit, M, root);
	const dust = buildDust(kit, root, { puffs: 7, chips: 4, size: 0.045, life: 0.9, spread: 0.17, color: C.dust, chipColor: C.chips });

	// --- posing --------------------------------------------------------------------------------
	const v = {
		hip: new THREE.Vector3(), ankle: new THREE.Vector3(), knee: new THREE.Vector3(), end: new THREE.Vector3(),
		pole: new THREE.Vector3(), dir: new THREE.Vector3(), grip: new THREE.Vector3(), gripAxis: new THREE.Vector3(),
		sh: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), wrist: new THREE.Vector3(),
		elbow: new THREE.Vector3(), head: new THREE.Vector3(), tip: new THREE.Vector3(),
		hoseStart: new THREE.Vector3(), hoseDir: new THREE.Vector3(), restAxis: new THREE.Vector3(),
	};
	const q = { foot: new THREE.Quaternion(), hand: new THREE.Quaternion(), look: new THREE.Quaternion(), base: new THREE.Quaternion(), chest: new THREE.Quaternion() };
	const basis = new THREE.Matrix4();
	const euler = new THREE.Euler(0, 0, 0, 'YXZ');
	const toolAxis = new THREE.Vector3();
	const inletDir = v3(TOOL.inletDir).normalize();
	const P = {}; // current interpolated keyframe (reused)
	const frontGrip = grip([0, 0, 0], [0, 0, 1]); // left hand round the front sleeve; z comes from the pose
	const workingAt = (ts) => dutyCycle(ts, TOOL.workPeriod, TOOL.workOn, TOOL.workPhase);
	// the chisel point does not move while working (the wobble pivots about it), so dust is
	// emitted from the resting point, back along the tool (out of the surface being broken)
	const dustOrigin = (te, outPoint, outNormal) => {
		outPoint.set(P.tip[0], P.tip[1], P.tip[2]);
		outNormal.copy(v.restAxis).negate();
	};

	/** Lower the pelvis until both ankles are within LEG_MAX_STRETCH of a leg length (2 passes). */
	function settleHips() {
		for (let pass = 0; pass < 2; pass++) {
			pelvis.updateMatrix();
			let deficit = 0;
			for (const leg of legs) {
				const foot = leg.side > 0 ? P.footL : P.footR;
				v.hip.set(leg.side * BODY.hipX, 0, 0).applyMatrix4(pelvis.matrix);
				const horiz = Math.hypot(v.hip.x - foot[0], v.hip.z - foot[1]);
				const maxY = BODY.ankleH + Math.sqrt(Math.max(0, (LEG_LEN * LEG_MAX_STRETCH) ** 2 - horiz * horiz));
				deficit = Math.max(deficit, v.hip.y - maxY);
			}
			if (deficit <= 0) break;
			pelvis.position.y -= deficit;
		}
		pelvis.updateMatrix();
	}

	/** Re-pose every joint for tool pitch `aimIn`; t = time for the working motion, or null for the rest pose. */
	function applyPose(aimIn, t) {
		const a = clamp(aimIn, AIM_MIN, AIM_MAX);
		sampleKeys(WORKER_POSES, a, P);
		const live = t != null;
		// work cycle: hammering (on = 1) with short pauses to re-bite; the bit backs off while paused
		const on = live ? workingAt(t) : 0;
		const off = live ? 1 - on : 0;
		const blow = live ? frac(t * TOOL.freq) : 0;
		const vib = on * TOOL.stroke * (1 - blow) ** 2 + off * TOOL.backOff; // kick-back only, never into the work
		const buzz = live ? on * Math.sin(TAU * TOOL.freq * t + 1.1) : 0; // fast tremor, in step with the blows
		const sway = live ? Math.sin(TAU * 0.21 * t) : 0; // slow shift of weight
		const sway2 = live ? Math.sin(TAU * 0.13 * t + 1.3) : 0;
		const breath = live ? Math.sin(TAU * 0.27 * t + 0.4) : 0;
		const wobYaw = 0.035 * sway, wobPitch = 0.03 * sway2; // +-2 deg tool wobble about the fixed point

		// pelvis and spine
		pelvis.position.set(P.pelvis[0], P.pelvis[1] + 0.0015 * buzz, P.pelvis[2] + 0.006 * sway + 0.006 * on);
		pelvis.rotation.set(P.pelvisPitch, P.pelvisYaw + 0.01 * sway, 0, 'YXZ');
		settleHips();
		lumbar.rotation.set(P.lumbarPitch + 0.004 * buzz + 0.008 * breath, P.chestYaw * 0.4 + 0.3 * wobYaw, 0, 'YXZ');
		lumbar.updateMatrix();
		chest.rotation.set(P.chestPitch + 0.003 * buzz + 0.01 * breath, P.chestYaw * 0.6 - 0.01 * sway + 0.5 * wobYaw, 0.004 * buzz, 'YXZ');
		chest.updateMatrix();

		// legs: feet planted flat, knees over the toes
		for (const leg of legs) {
			const foot = leg.side > 0 ? P.footL : P.footR;
			const yaw = leg.side > 0 ? P.footYawL : P.footYawR;
			rootPos(leg.hip, root, v.hip);
			v.ankle.set(foot[0], BODY.ankleH, foot[1]);
			v.pole.set(Math.sin(yaw) + leg.side * 0.12, 0, Math.cos(yaw));
			solveTwoBone(v.hip, v.ankle, BODY.thigh, BODY.shin, v.pole, v.knee, v.end);
			aimJoint(leg.hip, root, v.dir.subVectors(v.knee, v.hip).normalize());
			aimJoint(leg.knee, root, v.dir.subVectors(v.end, v.knee).normalize());
			q.foot.setFromEuler(euler.set(0, yaw, 0));
			setRootQuat(leg.ankle, root, q.foot);
		}

		// the tool: pitched by `a`, chisel point at P.tip, wobbling about that point, kicked back by the blows
		v.restAxis.set(0, Math.sin(a), Math.cos(a));
		const ap = a + wobPitch;
		toolAxis.set(Math.sin(wobYaw) * Math.cos(ap), Math.sin(ap), Math.cos(wobYaw) * Math.cos(ap));
		tool.position.set(P.tip[0], P.tip[1], P.tip[2]).addScaledVector(toolAxis, -(TOOL.tipZ + vib));
		tool.rotation.set(-ap, wobYaw, 0);
		tool.updateMatrix();

		// head: looks at the chisel point
		neck.rotation.set(0, 0, 0);
		neck.updateMatrix();
		rootPos(head, root, v.head);
		v.tip.set(P.tip[0], P.tip[1], P.tip[2]);
		basis.lookAt(v.tip, v.head, UP);
		q.look.setFromRotationMatrix(basis);
		rootQuat(neck, root, q.base);
		setRootQuat(head, root, q.base.slerp(q.look, P.headLook));

		// arms: fists closed round the grips, two-bone IK from the shoulders
		const twoHands = smooth(TWO_HANDS_FROM, TWO_HANDS_AT, a); // 0: right on handle + left on sleeve, 1: both on the handle
		frontGrip.p.set(0, 0, P.frontGrip);
		rootQuat(chest, root, q.chest).invert();
		for (const arm of arms) {
			const right = arm.side < 0;
			const g0 = right ? GRIPS.rear : frontGrip;
			const g1 = right ? GRIPS.rearRight : GRIPS.rearLeft;
			v.grip.copy(g0.p).lerp(g1.p, twoHands).applyMatrix4(tool.matrix);
			v.gripAxis.copy(g0.axis).lerp(g1.axis, twoHands).normalize().applyQuaternion(tool.quaternion);
			arm.shoulder.position.copy(arm.base);
			rootPos(arm.shoulder, root, v.sh);
			// hand frame: X along the bar, Y back towards the shoulder (wrist side), Z = X x Y
			v.y.subVectors(v.sh, v.grip);
			v.y.addScaledVector(v.gripAxis, -v.y.dot(v.gripAxis));
			if (v.y.lengthSq() < 1e-8) v.y.copy(UP);
			v.y.normalize();
			v.z.crossVectors(v.gripAxis, v.y);
			basis.makeBasis(v.gripAxis, v.y, v.z);
			q.hand.setFromRotationMatrix(basis);
			v.wrist.copy(v.grip).addScaledVector(v.y, BODY.fist);
			// a far grip pulls the shoulder towards it a little (reaching), so the arm never locks straight
			v.dir.subVectors(v.wrist, v.sh);
			const dist = v.dir.length();
			const shrug = BODY.shrug * smooth(0.47, 0.56, dist);
			if (shrug > 0) {
				arm.shoulder.position.add(v.dir.multiplyScalar(shrug / dist).applyQuaternion(q.chest));
				rootPos(arm.shoulder, root, v.sh);
			}
			v.pole.fromArray(arm.side > 0 ? P.poleL : P.poleR);
			solveTwoBone(v.sh, v.wrist, BODY.upperArm, BODY.forearm, v.pole, v.elbow, v.end);
			aimJoint(arm.shoulder, root, v.dir.subVectors(v.elbow, v.sh).normalize());
			aimJoint(arm.elbow, root, v.dir.subVectors(v.end, v.elbow).normalize());
			setRootQuat(arm.wrist, root, q.hand);
		}

		// hose from the inlet fitting, dust and chips at the point
		rootPos(inlet, root, v.hoseStart);
		v.hoseDir.copy(inletDir).applyQuaternion(tool.quaternion);
		hose.update(v.hoseStart, v.hoseDir, P.hose);
		if (live) dust.update(t, dustOrigin, workingAt);
		else dust.hide(v.tip);
	}

	const state = { aim: Number.isFinite(aim) ? aim : 0, t: null };
	applyPose(state.aim, null);
	const restTip = new THREE.Vector3();

	root.userData = {
		kind: 'worker',
		/** Re-pose for a new aim without rebuilding any geometry (non-finite values are ignored). */
		setAim(next) {
			if (Number.isFinite(next)) state.aim = next;
			applyPose(state.aim, state.t);
		},
		/** Resting chisel point relative to the feet origin: forward = z, height = y (x is 0 at the key poses). */
		reach() {
			applyPose(state.aim, null);
			rootPos(tipMarker, root, restTip);
			if (state.t != null) applyPose(state.aim, state.t);
			return { forward: restTip.z, height: restTip.y, x: restTip.x };
		},
		/** Animate for absolute time t (s): work cycle, hammering, tremor, wobble, dust and chips. */
		tick(t) {
			state.t = timeOrNull(t);
			applyPose(state.aim, state.t);
		},
		dispose() {
			kit.dispose();
		},
	};
	return root;
}

// ===========================================================================
// Demolition machine
// ===========================================================================

const MACHINE = {
	trackX: 0.3, trackW: 0.18, trackL: 1.5, trackH: 0.34, // rubber tracks (centre x, width, length, height)
	lugs: 6, // grousers visible along the top run of each track
	chassisW: 0.42, chassisY0: 0.1, chassisY1: 0.4, chassisL: 1.3,
	slewY: 0.4, turntableR: 0.32, turntableH: 0.06,
	bodyW: 0.72, // upper body (power pack housing) width
	// power-pack housing side profile (z, y) in slew space: low front deck, tall hood at the back
	housing: [[-0.5, 0.06], [0.1, 0.06], [0.1, 0.3], [0.04, 0.36], [-0.14, 0.36], [-0.2, 0.55], [-0.47, 0.55], [-0.54, 0.48], [-0.54, 0.15]],
	hoodTop: 0.55, rearZ: -0.54,
	boomPivot: [0, 0.42, 0.3], // in slew space
	// arm segments: length and rest pitch (absolute, degrees above horizontal)
	arm: [
		{ len: 0.78, pitch: 50 },
		{ len: 0.8, pitch: 2 },
		{ len: 0.53, pitch: -60 },
	],
	breakerPitch: -43,
	// breaker, along its axis from the mounting pin: bracket, housing, front head, moil point
	bracketZ1: 0.12, housingZ1: 0.46, headZ1: 0.51, pointZ: 0.64, tipZ: 0.7,
	// outriggers (x, z mirrored): bracket on the chassis corner, leg pivot, pad, leg ram anchor
	legBracket: [0.2, 0.44, 0.66], legBracketSize: [0.1, 0.24, 0.1],
	legPivot: [0.25, 0.38, 0.69],
	legFoot: [0.45, 0.075, 0.98],
	legRamAnchor: [0.2, 0.53, 0.66],
	legW: 0.075, padR: 0.085, padH: 0.03,
	// work cycle: break for ~3.8 s, lift off, slew and re-bite for ~1.5 s
	stroke: 0.012, freq: 11,
	cycle: { period: 5.3, on: 0.72, phase: 0.3 },
	sweep: 0.05, // slew between bites (+-, rad)
	nod: 0.03, liftOff: 0.05, // boom raise (rad) for the per-bite height change and the lift-off
};

const MACHINE_COLORS = {
	body: '#efb21f', // construction yellow
	arm: '#3b4047', // dark grey
	dark: '#2a2d31',
	rubber: '#1b1c1e',
	steel: '#9aa2aa',
	chrome: '#d5dbe0',
	grille: '#202326',
	breaker: '#2b2e33',
	beacon: '#ff9d00',
	lamp: '#fff4d6',
	cable: '#1d1f22',
	dust: '#b9b3a8',
	chips: '#77736c',
};

/**
 * Compact remote-controlled demolition machine with outriggers deployed and a hydraulic breaker.
 * opts.cable (default false): trail an electric power cable ~1.6 m behind the machine.
 */
export function makeMachine({ cable = false } = {}) {
	const kit = new Kit();
	const C = MACHINE_COLORS;
	const MC = MACHINE;
	const flat = { flatShading: true };
	const M = {
		body: kit.mat(C.body, { ...flat, roughness: 0.5 }),
		arm: kit.mat(C.arm, { ...flat, roughness: 0.6, metalness: 0.2 }),
		dark: kit.mat(C.dark, { ...flat, roughness: 0.7 }),
		rubber: kit.mat(C.rubber, { ...flat, roughness: 0.95 }),
		steel: kit.mat(C.steel, { ...flat, roughness: 0.4, metalness: 0.55 }),
		chrome: kit.mat(C.chrome, { roughness: 0.2, metalness: 0.6 }),
		grille: kit.mat(C.grille, { ...flat, roughness: 0.9 }),
		breaker: kit.mat(C.breaker, { ...flat, roughness: 0.55, metalness: 0.2 }),
		beacon: kit.mat(C.beacon, { roughness: 0.3, emissive: C.beacon, emissiveIntensity: 0.6 }), // opaque: no sorting flicker
		lamp: kit.mat(C.lamp, { roughness: 0.3, emissive: C.lamp, emissiveIntensity: 0.9 }),
		cable: kit.mat(C.cable, { roughness: 0.9 }),
	};
	const root = new THREE.Group();
	root.name = 'demolition-machine';

	// --- undercarriage: tracks, chassis, outriggers -------------------------------------------
	const trackGeo = kit.geo(sideExtrude(stadiumShape(MC.trackL, MC.trackH), MC.trackW, 6));
	const frameGeo = kit.geo(sideExtrude(stadiumShape(MC.trackL - 0.12, MC.trackH - 0.12, 0.06), 0.012, 5));
	const wheelGeo = kit.geo(xCyl(0.1, 0.03, 12));
	const rollerGeo = kit.geo(xCyl(0.05, 0.026, 8));
	const lugGeo = kit.geo(new THREE.BoxGeometry(MC.trackW + 0.006, 0.016, 0.045));
	const lugSpan = MC.trackL - MC.trackH - 0.1;
	for (const s of [1, -1]) {
		const x = s * MC.trackX;
		kit.mesh(trackGeo, M.rubber, root, x, 0, 0);
		for (let i = 0; i < MC.lugs; i++) kit.mesh(lugGeo, M.dark, root, x, MC.trackH + 0.003, -lugSpan / 2 + (i * lugSpan) / (MC.lugs - 1));
		// yellow track frame, sprocket, idler and rollers seen inside the rubber belt
		const xo = x + s * (MC.trackW / 2 + 0.004);
		kit.mesh(frameGeo, M.body, root, xo, 0, 0);
		for (const z of [-1, 1]) kit.mesh(wheelGeo, M.steel, root, xo + s * 0.012, MC.trackH / 2, z * (MC.trackL / 2 - MC.trackH / 2));
		for (const z of [-0.22, 0.22]) kit.mesh(rollerGeo, M.steel, root, xo + s * 0.01, 0.09, z);
	}
	kit.mesh(new THREE.BoxGeometry(MC.chassisW, MC.chassisY1 - MC.chassisY0, MC.chassisL), M.body, root, 0, (MC.chassisY0 + MC.chassisY1) / 2, 0);
	kit.mesh(new THREE.BoxGeometry(MC.chassisW + 0.02, 0.03, MC.chassisL + 0.02), M.dark, root, 0, MC.chassisY1 - 0.015, 0); // top rim

	// outriggers (deployed): bracket, pivot pin, leg beam, ram above the leg, swivel and pad
	const bracketGeo = kit.geo(new THREE.BoxGeometry(...MC.legBracketSize));
	const pinGeo = kit.geo(xCyl(0.04, 0.14, 6));
	const padGeo = kit.geo(new THREE.CylinderGeometry(MC.padR, MC.padR + 0.005, MC.padH, 8));
	const legRamMats = { barrel: M.dark, collar: M.grille, rod: M.chrome };
	const legDir = new THREE.Vector3(), legUp = new THREE.Vector3(), ramEnd = new THREE.Vector3();
	for (const sx of [1, -1]) {
		for (const sz of [1, -1]) {
			const at = (p) => new THREE.Vector3(sx * p[0], p[1], sz * p[2]);
			const pivot = at(MC.legPivot);
			const foot = at(MC.legFoot);
			kit.mesh(bracketGeo, M.dark, root, ...at(MC.legBracket).toArray());
			kit.mesh(pinGeo, M.steel, root, pivot.x - sx * 0.02, pivot.y, pivot.z);
			beamBetween(kit, root, pivot, foot, MC.legW, MC.legW, M.body);
			const pad = kit.mesh(padGeo, M.dark, root, foot.x, MC.padH / 2, foot.z);
			pad.name = 'pad';
			rodBetween(kit, root, new THREE.Vector3(foot.x, MC.padH, foot.z), foot, 0.03, M.steel, 6, true);
			// the ram runs from a pin high on the bracket down to the top face of the leg, clear above it
			legDir.subVectors(foot, pivot).normalize();
			legUp.copy(UP).addScaledVector(legDir, -legDir.y).normalize();
			ramEnd.lerpVectors(pivot, foot, 0.5).addScaledVector(legUp, MC.legW / 2 + 0.012);
			makeRam(kit, root, 0.026, 0.016, legRamMats).set(at(MC.legRamAnchor), ramEnd);
		}
	}

	// optional power cable from the rear of the chassis, trailing over the floor
	if (cable) {
		const N = 8;
		const p0 = new THREE.Vector3(0.12, 0.3, -0.66), p1 = new THREE.Vector3(0.16, 0.1, -1.0);
		const p2 = new THREE.Vector3(0.2, 0.02, -1.15), p3 = new THREE.Vector3(0.45, 0.02, -2.25);
		const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
		const geo = kit.geo(new THREE.CylinderGeometry(0.016, 0.016, 1, 6, 1, true));
		const pts = curve.getPoints(N);
		for (let i = 0; i < N; i++) {
			const d = new THREE.Vector3().subVectors(pts[i + 1], pts[i]);
			const seg = kit.mesh(geo, M.cable, root);
			seg.position.copy(pts[i]).addScaledVector(d, 0.5);
			seg.scale.y = d.length() + 0.01;
			alignY(seg, d.normalize());
		}
	}

	// --- slewing upper body: turntable, stepped power-pack housing, boom mount -----------------
	const slew = joint(root, 'slew', 0, MC.slewY, 0);
	kit.mesh(new THREE.CylinderGeometry(MC.turntableR, MC.turntableR, MC.turntableH, 14), M.dark, slew, 0, MC.turntableH / 2, 0);
	kit.mesh(sideExtrude(MC.housing, MC.bodyW, 1), M.body, slew);
	kit.mesh(new THREE.BoxGeometry(MC.bodyW + 0.012, 0.04, 0.66), M.dark, slew, 0, 0.08, -0.21); // bumper skirt
	// cooling louvres on the rear and the hood sides, thin top vent (no cab: it is remote-controlled)
	const rearSlat = kit.geo(new THREE.BoxGeometry(0.5, 0.028, 0.02));
	for (let i = 0; i < 4; i++) kit.mesh(rearSlat, M.grille, slew, 0, 0.22 + i * 0.065, MC.rearZ - 0.006);
	const sideSlat = kit.geo(new THREE.BoxGeometry(0.02, 0.024, 0.2));
	for (const s of [1, -1]) for (let i = 0; i < 3; i++) kit.mesh(sideSlat, M.grille, slew, s * (MC.bodyW / 2 + 0.004), 0.38 + i * 0.05, -0.34);
	kit.mesh(new THREE.BoxGeometry(0.36, 0.012, 0.16), M.grille, slew, 0, MC.hoodTop + 0.004, -0.36);
	kit.mesh(new THREE.BoxGeometry(0.5, 0.025, 0.025), M.steel, slew, 0, 0.5, MC.rearZ - 0.02); // rear grab handle
	// beacon (blinks with tick), radio antenna, work lights on the front deck
	kit.mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.02, 8), M.dark, slew, -0.24, MC.hoodTop + 0.01, -0.42);
	kit.mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.065, 8), M.beacon, slew, -0.24, MC.hoodTop + 0.052, -0.42);
	kit.mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.28, 5).translate(0, 0.14, 0), M.grille, slew, 0.26, MC.hoodTop, -0.48);
	for (const s of [1, -1]) {
		kit.mesh(new THREE.BoxGeometry(0.09, 0.06, 0.03), M.dark, slew, s * 0.25, 0.24, 0.112);
		kit.mesh(new THREE.BoxGeometry(0.07, 0.042, 0.012), M.lamp, slew, s * 0.25, 0.24, 0.129);
	}
	kit.mesh(new THREE.BoxGeometry(0.22, 0.09, 0.18), M.dark, slew, 0.2, 0.405, -0.04); // valve block on the deck
	// boom mount: two side cheeks and the lug for the lift ram
	const cheek = kit.geo(sideExtrude([[0.02, 0.06], [0.46, 0.06], [0.46, 0.18], [0.38, 0.5], [0.22, 0.52], [0.02, 0.44]], 0.03));
	for (const s of [1, -1]) kit.mesh(cheek, M.body, slew, s * 0.085, 0, 0);
	kit.mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), M.dark, slew, 0, 0.11, 0.38);
	kit.mesh(xCyl(0.06, 0.22, 10, MC.boomPivot[0], MC.boomPivot[1], MC.boomPivot[2]), M.steel, slew);

	// --- arm: boom1 > boom2 > boom3 > breaker > pick ------------------------------------------
	const [A1, A2, A3] = MC.arm;
	const boom1 = joint(slew, 'boom1', ...MC.boomPivot);
	const boom2 = joint(boom1, 'boom2', 0, 0, A1.len);
	const boom3 = joint(boom2, 'boom3', 0, 0, A2.len);
	const breaker = joint(boom3, 'breaker', 0, 0, A3.len);
	const pick = joint(breaker, 'pick');
	// boom 1, with a yellow flash along its top
	kit.mesh(zBox(0.13, 0.15, -0.03, A1.len + 0.02), M.arm, boom1);
	kit.mesh(zBox(0.134, 0.035, 0.12, A1.len - 0.1, 0.064), M.body, boom1);
	kit.mesh(xCyl(0.075, 0.15, 10, 0, 0, A1.len), M.arm, boom1);
	// boom 2 with a lever horn behind its pivot, and a yellow flash
	kit.mesh(zBox(0.11, 0.13, -0.06, A2.len + 0.02), M.arm, boom2);
	kit.mesh(zBox(0.114, 0.03, 0.1, A2.len - 0.12, 0.056), M.body, boom2);
	kit.mesh(zBox(0.1, 0.13, -0.16, -0.02, 0.06), M.arm, boom2);
	kit.mesh(xCyl(0.07, 0.16, 10), M.steel, boom2);
	kit.mesh(xCyl(0.065, 0.13, 10, 0, 0, A2.len), M.arm, boom2);
	// boom 3
	kit.mesh(zBox(0.1, 0.12, -0.05, A3.len), M.arm, boom3);
	kit.mesh(zBox(0.09, 0.09, -0.11, -0.01, 0.045), M.arm, boom3); // lever horn for the boom-3 ram
	kit.mesh(xCyl(0.062, 0.14, 10), M.steel, boom3);
	// breaker: yellow bracket, dark housing, steel front head; the moil point vibrates
	kit.mesh(xCyl(0.055, 0.13, 10), M.steel, breaker);
	kit.mesh(zBox(0.17, 0.17, -0.05, MC.bracketZ1), M.body, breaker);
	kit.mesh(zBox(0.14, 0.14, MC.bracketZ1, MC.housingZ1), M.breaker, breaker);
	kit.mesh(zBox(0.146, 0.03, MC.bracketZ1 + 0.04, MC.housingZ1 - 0.06, 0.0), M.body, breaker); // side band
	kit.mesh(zCyl(0.06, 0.052, MC.housingZ1, MC.headZ1, 10), M.steel, breaker);
	kit.mesh(zCyl(0.028, 0.028, MC.headZ1 - 0.02, MC.pointZ, 8), M.steel, pick);
	kit.mesh(zCyl(0.028, 0.002, MC.pointZ, MC.tipZ, 8), M.steel, pick);
	const tipMarker = joint(pick, 'tip', 0, 0, MC.tipZ);

	// hydraulic rams on the arm: yellow barrels, dark glands, chrome rods (they read against the dark arm)
	const armRamMats = { barrel: M.body, collar: M.dark, rod: M.chrome };
	const armRams = [
		{ r: [0.036, 0.021], a: [slew, [0, 0.11, 0.44]], b: [boom1, [0, -0.085, 0.42]] },
		{ r: [0.03, 0.018], a: [boom1, [0, 0.095, 0.22]], b: [boom2, [0, 0.12, -0.13]] },
		{ r: [0.028, 0.016], a: [boom2, [0, 0.085, 0.3]], b: [boom3, [0, 0.08, -0.08]] },
		{ r: [0.025, 0.015], a: [boom3, [0, 0.075, 0.14]], b: [breaker, [0, 0.1, 0.03]] },
	].map((d) => ({ ...d, ram: makeRam(kit, slew, d.r[0], d.r[1], armRamMats) }));

	const dust = buildDust(kit, root, { puffs: 6, chips: 5, size: 0.08, life: 1.1, spread: 0.3, chipSize: 0.02, color: C.dust, chipColor: C.chips });

	const pa = new THREE.Vector3(), pb = new THREE.Vector3();
	const rel = new THREE.Matrix4();
	const toSlew = (node, local, out) => {
		out.fromArray(local);
		if (node !== slew) out.applyMatrix4(rootMatrix(node, slew, rel));
		return out;
	};

	/**
	 * Set the arm: slew angle, boom raise (rad), pick kick-back (m) and an upward body shake.
	 * A raise lifts boom 1 and drops boom 3 and the breaker by half as much, so the pick keeps its
	 * angle and moves up and slightly back: no arm motion ever pushes the pick into the work.
	 */
	function setArm(slewAngle, raise, kick, shake) {
		slew.rotation.y = slewAngle;
		slew.position.y = MC.slewY + 0.0012 * shake;
		boom1.rotation.x = -(A1.pitch * DEG + raise);
		boom2.rotation.x = -((A2.pitch - A1.pitch) * DEG);
		boom3.rotation.x = -((A3.pitch - A2.pitch) * DEG - 0.5 * raise);
		breaker.rotation.x = -((MC.breakerPitch - A3.pitch) * DEG - 0.5 * raise);
		pick.position.z = -kick;
		for (const o of [slew, boom1, boom2, boom3, breaker, pick]) o.updateMatrix();
		for (const r of armRams) r.ram.set(toSlew(r.a[0], r.a[1], pa), toSlew(r.b[0], r.b[1], pb));
	}

	// the bite point at rest, its shift per unit nod, and the breaker axis (for dust and chips)
	const restTip = new THREE.Vector3(), nodShift = new THREE.Vector3(), restAxis = new THREE.Vector3();
	setArm(0, MC.nod, 0, 0);
	rootPos(tipMarker, root, nodShift);
	setArm(0, 0, 0, 0);
	rootPos(tipMarker, root, restTip);
	nodShift.sub(restTip);
	rootQuat(breaker, root, _pq);
	restAxis.set(0, 0, 1).applyQuaternion(_pq);

	/** Slew angle and nod (0..1) of bite number k: pseudo-random, so every burst works a new spot. */
	const biteSlew = (k) => MC.sweep * (2 * hash(k * 7.13 + 1.1) - 1);
	const biteNod = (k) => hash(k * 3.71 + 4.2);
	const cyclePos = (t) => {
		const x = t / MC.cycle.period + MC.cycle.phase;
		const k = Math.floor(x);
		return { k, ph: x - k };
	};
	/** Hammering envelope: on during the bite, ramps off before the lift. */
	const workingAt = (t) => {
		const { ph } = cyclePos(t);
		return smooth(0, 0.03, ph) * (1 - smooth(MC.cycle.on - 0.03, MC.cycle.on, ph));
	};
	const _q = new THREE.Quaternion();
	/** Where bite number k(te) was being broken and the surface normal there (dust origin). */
	const dustOrigin = (te, outPoint, outNormal) => {
		const { k } = cyclePos(te);
		_q.setFromAxisAngle(UP, biteSlew(k));
		outPoint.copy(restTip).addScaledVector(nodShift, biteNod(k)).applyQuaternion(_q);
		outNormal.copy(restAxis).negate().applyQuaternion(_q);
	};

	/** Pose for absolute time t (s), or the rest pose for t = null. */
	function applyPose(t) {
		if (t == null) {
			setArm(0, 0, 0, 0);
			M.beacon.emissiveIntensity = 0.6;
			dust.hide(restTip);
			return;
		}
		const { k, ph } = cyclePos(t);
		const on = workingAt(t);
		// between bites: lift off the face, slew and re-aim, then lower onto the next spot
		const lift = smooth(MC.cycle.on, MC.cycle.on + 0.08, ph) - smooth(0.92, 1.0, ph);
		const move = smooth(MC.cycle.on + 0.06, 0.94, ph);
		const slewAngle = lerp(biteSlew(k), biteSlew(k + 1), move);
		const nod = lerp(biteNod(k), biteNod(k + 1), move);
		const blow = frac(t * MC.freq);
		const kick = on * MC.stroke * (1 - blow) ** 2; // sharp kick-back, pushed home before the next blow
		const shake = on * (0.5 + 0.5 * Math.sin(TAU * MC.freq * t + 0.5));
		setArm(slewAngle, MC.nod * nod + MC.liftOff * lift, kick, shake);
		M.beacon.emissiveIntensity = 0.3 + 1.2 * Math.max(0, Math.sin(TAU * 1.4 * t)) ** 3;
		dust.update(t, dustOrigin, workingAt);
	}

	const state = { t: null };
	applyPose(null);
	const tipNow = new THREE.Vector3();
	root.userData = {
		kind: 'demolition-machine',
		/** Deployed footprint (outrigger pads) and carrier width, for gallery clearance checks. */
		footprint: {
			width: 2 * (MC.legFoot[0] + MC.padR + 0.005),
			length: 2 * (MC.legFoot[2] + MC.padR + 0.005),
			carrierWidth: 2 * (MC.trackX + MC.trackW / 2 + 0.016),
		},
		/** Resting breaker point relative to the machine origin: forward = z, height = y. */
		reach() {
			applyPose(null);
			rootPos(tipMarker, root, tipNow);
			if (state.t != null) applyPose(state.t);
			return { forward: tipNow.z, height: tipNow.y, x: tipNow.x };
		},
		/** Animate for absolute time t (s): bites with lift-off and slew between them, beacon, dust. */
		tick(t) {
			state.t = timeOrNull(t);
			applyPose(state.t);
		},
		dispose() {
			kit.dispose();
		},
	};
	return root;
}
