import {
	Color,
	DynamicDrawUsage,
	IcosahedronGeometry,
	InstancedBufferAttribute,
	InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	Quaternion,
	Vector3,
} from 'three';

// The stream of material falling onto a stockpile while it's poured: little rocks dropped from
// above the pile that land on its surface and roll a short way down, coloured like the material.

const MAX = 500;
const GRAVITY = 9.81;
const ROLL_TIME = 0.6;
const ROLL_SPEED = 2.5;
const SIZE = 0.13;

const _matrix = new Matrix4();
const _rotation = new Quaternion();
const _scale = new Vector3();
const _colour = new Color();

// surfaceAt( x, z ): the ground height the rocks land on, or null where unknown.
export function createPourStream( { scene, surfaceAt } ) {

	const mesh = new InstancedMesh( new IcosahedronGeometry( SIZE, 0 ), new MeshStandardMaterial( { roughness: 0.9 } ), MAX );
	mesh.name = 'pour stream';
	mesh.instanceMatrix.setUsage( DynamicDrawUsage );
	mesh.instanceColor = new InstancedBufferAttribute( new Float32Array( MAX * 3 ), 3 );
	mesh.instanceColor.setUsage( DynamicDrawUsage );
	mesh.frustumCulled = false;
	mesh.count = 0;
	mesh.userData.noCollide = true;
	mesh.raycast = () => {};
	scene.add( mesh );

	const rocks = [];
	const sources = new Map(); // key -> { emitter( time ) -> Vector3, colour, rate, time, carry }

	const spawn = ( source, age ) => {

		const at = source.emitter( source.time - age );
		const angle = Math.random() * Math.PI * 2;
		const spread = Math.sqrt( Math.random() ) * 0.35;
		const rock = {
			position: at.clone().add( new Vector3( Math.cos( angle ) * spread, 0, Math.sin( angle ) * spread ) ),
			velocity: new Vector3( ( Math.random() - 0.5 ) * 0.6, - 0.5 - Math.random(), ( Math.random() - 0.5 ) * 0.6 ),
			rolling: - 1,
			life: 0,
			floor: at.y - 40,
			size: 0.6 + Math.random() * 0.8,
			axis: new Vector3( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).normalize(),
			spin: ( Math.random() - 0.5 ) * 12,
			colour: _colour.copy( source.colour ).multiplyScalar( 0.75 + Math.random() * 0.4 ).clone(),
		};
		step( rock, age );
		rocks.push( rock );

	};

	// Fall until it reaches the surface, then roll downhill for a moment.
	const step = ( rock, dt ) => {

		rock.life += dt;
		const { position, velocity } = rock;
		if ( rock.rolling < 0 ) {

			velocity.y -= GRAVITY * dt;
			position.addScaledVector( velocity, dt );
			const ground = surfaceAt( position.x, position.z );
			if ( ground !== null && position.y <= ground + SIZE ) {

				position.y = ground + SIZE;
				rock.rolling = 0;
				const downhill = slopeAt( position );
				velocity.set( downhill.x, 0, downhill.z ).multiplyScalar( ROLL_SPEED );

			}

			return;

		}

		rock.rolling += dt;
		velocity.multiplyScalar( Math.max( 0, 1 - 2 * dt ) );
		position.addScaledVector( velocity, dt );
		const ground = surfaceAt( position.x, position.z );
		if ( ground !== null ) position.y = ground + SIZE;

	};

	const slopeAt = ( { x, z } ) => {

		const d = 0.3;
		const h = ( a, b ) => surfaceAt( a, b ) ?? surfaceAt( x, z ) ?? 0;
		const gx = ( h( x + d, z ) - h( x - d, z ) ) / ( 2 * d );
		const gz = ( h( x, z + d ) - h( x, z - d ) ) / ( 2 * d );
		const length = Math.hypot( gx, gz );
		return length > 1e-3 ? { x: - gx / length * Math.min( 1, length ), z: - gz / length * Math.min( 1, length ) } : { x: 0, z: 0 };

	};

	return {

		// Start pouring for `key`: source = { emitter( time ) -> Vector3 (where rocks drop from,
		// time in seconds since the start), colour: Color, rate (rocks per second) }.
		start( key, source ) {

			sources.set( key, { rate: 140, ...source, time: 0, carry: 0 } );

		},

		stop( key ) {

			sources.delete( key );

		},

		update( dt ) {

			for ( const source of sources.values() ) {

				source.time += dt;
				source.carry += source.rate * dt;
				// Spread over the frame, so a slow frame still shows a stream rather than a clump.
				for ( ; source.carry >= 1 && rocks.length < MAX; source.carry -= 1 ) spawn( source, Math.random() * dt );
				source.carry = Math.min( source.carry, 1 );

			}

			for ( const rock of rocks ) step( rock, dt );
			for ( let i = rocks.length - 1; i >= 0; i -- ) {

				const rock = rocks[ i ];
				if ( rock.rolling > ROLL_TIME || rock.position.y < rock.floor || rock.life > 6 ) rocks.splice( i, 1 );

			}

			rocks.forEach( ( rock, i ) => {

				_rotation.setFromAxisAngle( rock.axis, rock.spin * rock.life );
				_matrix.compose( rock.position, _rotation, _scale.setScalar( rock.size ) );
				mesh.setMatrixAt( i, _matrix );
				mesh.setColorAt( i, rock.colour );

			} );
			mesh.count = rocks.length;
			mesh.instanceMatrix.needsUpdate = true;
			mesh.instanceColor.needsUpdate = true;

		},

		get active() {

			return rocks.length > 0 || sources.size > 0;

		},

	};

}
