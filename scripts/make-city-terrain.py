"""World Drive's city drives' ground: the real heights under a city (scripts/make-city.py's box), so its
streets, parks and buildings follow its hills (under the water no lower than SEA_FLOOR: the sea is its own surface), and so it can be laid under Google's 3D map
(src/drive-app/city/terrain.js).

    pip install pillow
    python scripts/make-city-terrain.py drive/public/cities/vancouver.json

Heights are AWS's open Terrain Tiles (Mapzen's "terrarium" encoding, free, no key; for Canada from
Natural Resources Canada's CDEM, elsewhere SRTM and others: credited as "Terrain Tiles: Mapzen, AWS
Open Data; sources: NRCan CDEM, SRTM, ..."), metres above sea level, sampled every STEP m on the
city's own grid (make-city.py's projection: metres east and north of its origin, a plane tangent
there) by bilinear interpolation between the tiles' pixels (about 3 m apart at zoom 15).

Writes <city>-terrain.bin beside the city: a little-endian header of six float32 (west, south, step,
columns, rows, lowest) and then columns × rows int16, decimetres above `lowest`, row by row from the
south edge, each row west to east.
"""

import argparse
import io
import json
import math
import os
import ssl
import struct
import urllib.request

from PIL import Image

R = 6371008.8
STEP = 10
ZOOM = 15
SEA_FLOOR = - 2
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


def main():

	parser = argparse.ArgumentParser()
	parser.add_argument( 'city', help = 'the city file make-city.py wrote' )
	parser.add_argument( '--step', type = float, default = STEP )
	parser.add_argument( '--zoom', type = int, default = ZOOM )
	args = parser.parse_args()
	city = json.load( open( args.city ) )
	lat0, lon0 = city[ 'origin' ]
	width, height = city[ 'size' ]
	cos0 = math.cos( math.radians( lat0 ) )
	west, south = - width / 2, - height / 2
	columns = int( math.ceil( width / args.step ) ) + 1
	rows = int( math.ceil( height / args.step ) ) + 1

	def unproject( east, north ):

		return lat0 + math.degrees( north / R ), lon0 + math.degrees( east / ( R * cos0 ) )

	tiles = {}
	context = ssl.create_default_context( cafile = os.environ.get( 'SSL_CERT_FILE' ) or None )
	n = 2 ** args.zoom

	def pixel( lat, lon ):

		# The tile pixel ( fx, fy ) at zoom, Web Mercator.
		x = ( lon + 180 ) / 360 * n * 256
		y = ( 1 - math.log( math.tan( math.radians( lat ) ) + 1 / math.cos( math.radians( lat ) ) ) / math.pi ) / 2 * n * 256
		return x, y

	def height_at_pixel( px, py ):

		tx, ty = int( px // 256 ), int( py // 256 )
		key = ( tx, ty )
		if key not in tiles:

			data = urllib.request.urlopen( URL.format( z = args.zoom, x = tx, y = ty ), context = context, timeout = 60 ).read()
			tiles[ key ] = Image.open( io.BytesIO( data ) ).convert( 'RGB' ).load()

		r, g, b = tiles[ key ][ int( px ) % 256, int( py ) % 256 ]
		return r * 256 + g + b / 256 - 32768

	def height( lat, lon ):

		px, py = pixel( lat, lon )
		x0, y0 = math.floor( px - 0.5 ), math.floor( py - 0.5 )
		fx, fy = px - 0.5 - x0, py - 0.5 - y0
		h00 = height_at_pixel( x0, y0 )
		h10 = height_at_pixel( x0 + 1, y0 )
		h01 = height_at_pixel( x0, y0 + 1 )
		h11 = height_at_pixel( x0 + 1, y0 + 1 )
		return ( h00 * ( 1 - fx ) + h10 * fx ) * ( 1 - fy ) + ( h01 * ( 1 - fx ) + h11 * fx ) * fy

	values = []
	for j in range( rows ):

		for i in range( columns ):

			values.append( height( *unproject( west + i * args.step, south + j * args.step ) ) )

	# Under the water the tiles give the sea floor (and the odd broken pixel, thousands of metres down):
	# the city's water is its own surface, so the ground is kept no lower than SEA_FLOOR there.
	values = [ max( SEA_FLOOR, v ) for v in values ]
	lowest = math.floor( min( values ) )
	out = args.city.replace( '.json', '-terrain.bin' )
	with open( out, 'wb' ) as f:

		f.write( struct.pack( '<6f', west, south, args.step, columns, rows, lowest ) )
		f.write( struct.pack( f'<{ len( values ) }h', *( max( - 32768, min( 32767, round( ( v - lowest ) * 10 ) ) ) for v in values ) ) )

	print( f'{ out }: { columns } x { rows } every { args.step } m, { len( tiles ) } tiles, { min( values ):.1f} to { max( values ):.1f} m' )


main()
