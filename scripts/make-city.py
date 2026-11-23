"""World Drive's city drives: one city's buildings, streets, bridges, ground, sea and parks, cut
from an OpenStreetMap extract and an elevation model into two small files the city page builds in
the browser (src/drive-app/city).

    pip install osmium shapely rasterio
    curl -o vancouver.osm.pbf https://download.bbbike.org/osm/bbbike/Vancouver/Vancouver.osm.pbf
    python scripts/make-city.py vancouver.osm.pbf --id vancouver --name Vancouver \
        --bbox 49.270,-123.160,49.335,-123.035 --dem canada --start "Robson Street:49.2846,-123.1225"

OpenStreetMap's data is open (ODbL): free to use, commercially too, crediting
"(c) OpenStreetMap contributors", which the page shows. The ground is Natural Resources Canada's
High Resolution Digital Elevation Model (`--dem canada`: the 1 m bare-earth model from lidar, Open
Government Licence - Canada, also credited), read over the internet for just the box (it's a
cloud-optimised GeoTIFF); `--dem <file or URL>` takes any other elevation GeoTIFF (USGS 3DEP,
Copernicus GLO-30). Nothing here is anyone's model or photo.

What's kept, in metres east and north of the box's middle (rounded to a decimetre):
- buildings (and the parts tall towers are mapped as): footprint, base and top height over the
  ground, colour. A building mapped as parts is drawn as its parts. Its height is its `height`, or
  its floors at 3.2 m each, or a typical one for its kind.
- roads you can drive (and paths, drawn thinner): centre line, width, and for bridges the deck's
  height above sea level at each point, rising from the ground at its ends at a gentle grade to the
  middle. Tunnels are left out. Other roads follow the ground (the page drapes them).
- the ground: heights every --spacing metres (default 10) over the box, and what each spot is: land,
  sea (from the coastline, land to its left), a park or wood, a beach, or a lake. In
  <id>.ground.bin: Int16 heights in decimetres above sea level, then a Uint8 kind for each, rows
  from the north, each from the west (ground.kinds names them).
- start spots: the road nearest each --start, facing along it.

The JSON: { id, name, credit, size: [ width, height ], origin: [ lat, lon ], starts,
ground: { file, columns, rows, spacing, west, north, kinds }, buildings: [ [ ring, base, top,
colour ], ... ], roads: [ [ line, width, kind, deck heights? ], ... ] }, where a ring or line is
[ x0, y0, x1, y1, ... ] in decimetres.
"""

import argparse
import json
import math
import os
import re
import zlib
from collections import defaultdict

import osmium
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import linemerge, split, unary_union

import numpy as np

R = 6371008.8
FLOOR = 3.2
# Natural Resources Canada's 1 m bare-earth mosaic for southern BC and Alberta (the HRDEM, from
# its STAC catalogue at datacube.services.geo.ca, collection hrdem-mosaic-1m).
CANADA_DEM = 'https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m/2_3-mosaic-1m-dtm.tif'
DEM_CREDIT = { 'canada': 'Elevation: Natural Resources Canada HRDEM, Open Government Licence - Canada' }
# What each spot of the ground is (ground.bin's kinds).
KINDS = [ 'land', 'sea', 'green', 'sand', 'lake' ]
LAND, SEA, GREEN_K, SAND_K, LAKE = range( 5 )
# The sea bed's height (m) where the elevation model has none, below the water's surface at 0.
SEA_BED = - 3

# Roads you can drive, and their width (m) when the lanes aren't mapped.
ROADS = {
	'motorway': 14, 'trunk': 13, 'primary': 12, 'secondary': 11, 'tertiary': 10,
	'motorway_link': 7, 'trunk_link': 7, 'primary_link': 7, 'secondary_link': 7, 'tertiary_link': 7,
	'unclassified': 8, 'residential': 8, 'living_street': 6, 'service': 5, 'pedestrian': 7, 'track': 4,
}
# Paths: drawn, thinner, and driven on like the rest (it's a game).
PATHS = { 'footway': 2.5, 'cycleway': 3, 'path': 2.5, 'bridleway': 2.5 }
# Typical heights (m) by kind of building, when neither height nor floors are mapped.
TYPICAL = {
	'house': 7, 'detached': 7, 'semidetached_house': 7, 'terrace': 8, 'garage': 3, 'garages': 3,
	'shed': 3, 'hut': 3, 'kiosk': 3, 'cabin': 4, 'roof': 0, 'carport': 0, 'canopy': 0,
	'apartments': 12, 'commercial': 12, 'retail': 8, 'office': 20, 'hotel': 25, 'industrial': 9,
	'warehouse': 9, 'church': 15, 'school': 10, 'yes': 10,
}
GREEN = { ( 'leisure', 'park' ), ( 'leisure', 'garden' ), ( 'leisure', 'pitch' ), ( 'leisure', 'golf_course' ),
	( 'landuse', 'grass' ), ( 'landuse', 'recreation_ground' ), ( 'landuse', 'forest' ), ( 'landuse', 'meadow' ),
	( 'landuse', 'village_green' ), ( 'natural', 'wood' ), ( 'natural', 'scrub' ), ( 'natural', 'grassland' ) }
SAND = { ( 'natural', 'beach' ), ( 'natural', 'sand' ) }
COLOURS = {
	'white': '#eeeeea', 'black': '#2a2a2a', 'grey': '#8c8c8c', 'gray': '#8c8c8c', 'silver': '#b8bcc0',
	'red': '#9b3b2e', 'brown': '#7a5a44', 'beige': '#d8c8a8', 'tan': '#c9b28a', 'yellow': '#d9c27a',
	'blue': '#5a7896', 'green': '#5f7f62', 'orange': '#c47a3a', 'cream': '#ece3c8', 'pink': '#d8a8a0',
}


def number( text ):

	"""Metres from an OSM length ("45", "45 m", "150'", "12 ft"), or None."""
	if not text:
		return None
	text = text.strip().lower().replace( ',', '.' )
	feet = re.match( r'^(\d+(?:\.\d+)?)\s*(?:\'|ft|feet)$', text )
	if feet:
		return float( feet.group( 1 ) ) * 0.3048
	plain = re.match( r'^(\d+(?:\.\d+)?)\s*(?:m)?$', text )
	return float( plain.group( 1 ) ) if plain else None


def colour( text ):

	if not text:
		return None
	text = text.strip().lower()
	if re.match( r'^#[0-9a-f]{6}$', text ):
		return text
	if re.match( r'^#[0-9a-f]{3}$', text ):
		return '#' + ''.join( c * 2 for c in text[ 1: ] )
	return COLOURS.get( text )


class Reader( osmium.SimpleHandler ):

	def __init__( self, bbox, project ):

		super().__init__()
		self.bbox = bbox
		self.project = project
		self.buildings = []  # ( polygon, tags, is_part, id )
		self.roads = []  # ( coords, tags, way id, first node, last node )
		self.coast = []
		self.water = []
		self.green = []
		self.sand = []

	def inside( self, lat, lon, margin = 0.002 ):

		s, w, n, e = self.bbox
		return s - margin < lat < n + margin and w - margin < lon < e + margin

	def way( self, w ):

		t = w.tags
		try:
			points = [ ( n.lat, n.lon ) for n in w.nodes ]
		except osmium.InvalidLocationError:
			return
		if len( points ) < 2 or not any( self.inside( *p ) for p in points ):
			return
		coords = [ self.project( *p ) for p in points ]
		if t.get( 'natural' ) == 'coastline':
			self.coast.append( LineString( coords ) )
			return
		kind = t.get( 'highway' )
		if kind in ROADS or kind in PATHS:
			if t.get( 'tunnel' ) in ( 'yes', 'building_passage', 'culvert' ) or t.get( 'covered' ) == 'yes':
				return
			if kind == 'footway' and t.get( 'footway' ) in ( 'sidewalk', 'crossing' ):
				return
			try:
				layer = int( t.get( 'layer', '0' ) )
			except ValueError:
				layer = 0
			if layer < 0:
				return
			self.roads.append( ( coords, dict( t ), w.id, w.nodes[ 0 ].ref, w.nodes[ -1 ].ref ) )

	def area( self, a ):

		t = a.tags
		is_building = 'building' in t and t.get( 'building' ) != 'no'
		is_part = 'building:part' in t and t.get( 'building:part' ) != 'no'
		pairs = { ( k, t.get( k ) ) for k in ( 'leisure', 'landuse', 'natural' ) }
		water = t.get( 'natural' ) == 'water' or t.get( 'waterway' ) == 'riverbank' or t.get( 'landuse' ) == 'reservoir'
		green = bool( pairs & GREEN )
		sand = bool( pairs & SAND )
		if not ( is_building or is_part or water or green or sand ):
			return
		polygons = []
		try:
			for outer in a.outer_rings():
				shell = [ ( n.lat, n.lon ) for n in outer ]
				if not any( self.inside( *p ) for p in shell ):
					continue
				holes = [ [ self.project( n.lat, n.lon ) for n in inner ] for inner in a.inner_rings( outer ) ]
				polygon = Polygon( [ self.project( *p ) for p in shell ], [ h for h in holes if len( h ) >= 4 ] )
				if not polygon.is_valid:
					polygon = polygon.buffer( 0 )
				if not polygon.is_empty:
					polygons.append( polygon )
		except osmium.InvalidLocationError:
			return
		for polygon in polygons:
			if is_building or is_part:
				self.buildings.append( ( polygon, dict( t ), is_part and not is_building, a.orig_id() ) )
			elif water:
				self.water.append( polygon )
			elif sand:
				self.sand.append( polygon )
			else:
				self.green.append( polygon )


def height_of( tags ):

	"""( base, top ) in metres, or None for what isn't drawn (roofs over nothing, canopies)."""
	top = number( tags.get( 'height' ) )
	levels = number( tags.get( 'building:levels' ) )
	if top is None and levels is not None:
		top = levels * FLOOR + ( 1 if levels >= 1 else 0 )
	if top is None:
		top = TYPICAL.get( tags.get( 'building' ) or tags.get( 'building:part' ), 10 )
	base = number( tags.get( 'min_height' ) )
	if base is None:
		min_level = number( tags.get( 'building:min_level' ) )
		base = min_level * FLOOR if min_level is not None else 0
	if top <= 0 or top <= base + 0.5:
		return None
	return base, top


# Facade colours when none is mapped: concretes and brick for most, glass for towers.
LOW = [ '#b9b2a6', '#a89f92', '#c8c1b4', '#9c8f80', '#8f7f70', '#b5a48c', '#a06a52', '#c4b49a', '#9fa3a6' ]
TALL = [ '#7f99a8', '#6f8a99', '#8ea3ad', '#5f7684', '#9aaab2', '#a3adb3', '#b6bcbf' ]


def pick( seed, palette ):

	return palette[ zlib.crc32( str( seed ).encode() ) % len( palette ) ]


def ring( coords ):

	out = []
	for x, y in list( coords )[ :-1 ]:
		out += [ round( x * 10 ), round( y * 10 ) ]
	return out


def polygon_out( polygon, tolerance = 0.3 ):

	"""[ outer, holes... ] of a (multi)polygon, as a list of such, simplified a little."""
	out = []
	parts = polygon.geoms if isinstance( polygon, MultiPolygon ) else [ polygon ]
	for part in parts:
		if part.is_empty or part.area < 4:
			continue
		part = part.simplify( tolerance, preserve_topology = True )
		if part.is_empty or not isinstance( part, Polygon ):
			continue
		out.append( [ ring( part.exterior.coords ) ] + [ ring( h.coords ) for h in part.interiors if Polygon( h ).area > 4 ] )
	return out


def land_of( coast, frame ):

	"""The land inside the frame, from the coastline (land to its left as it's drawn)."""
	lines = [ l.intersection( frame.buffer( 50 ) ) for l in coast ]
	lines = [ g for l in lines for g in ( l.geoms if hasattr( l, 'geoms' ) else [ l ] ) if not g.is_empty and g.geom_type == 'LineString' ]
	if not lines:
		return frame
	merged = linemerge( lines )
	pieces = split( frame, merged )
	segments = [ g for g in ( merged.geoms if hasattr( merged, 'geoms' ) else [ merged ] ) ]
	land = []
	for piece in pieces.geoms:
		p = piece.representative_point()
		# The nearest coastline, and which side of it the piece is on.
		line = min( segments, key = lambda s: s.distance( p ) )
		d = line.project( line.interpolate( line.project( p ) ) )
		a = line.interpolate( max( 0, d - 1 ) )
		b = line.interpolate( min( line.length, d + 1 ) )
		q = line.interpolate( d )
		cross = ( b.x - a.x ) * ( p.y - q.y ) - ( b.y - a.y ) * ( p.x - q.x )
		if cross > 0:
			land.append( piece )
	return unary_union( land ) if land else frame


def bridge_heights( roads, ground_at ):

	"""Deck heights over sea level along bridges: each run of joined bridge ways starts from the
	ground at its ends and rises at a gentle grade to the middle, never below the ground under it."""
	bridges = [ i for i, r in enumerate( roads ) if r[ 1 ].get( 'bridge' ) not in ( None, 'no' ) ]
	ends = defaultdict( list )
	for i in bridges:
		ends[ roads[ i ][ 3 ] ].append( i )
		ends[ roads[ i ][ 4 ] ].append( i )
	seen = set()
	heights = {}
	for start in bridges:
		if start in seen:
			continue
		# Gather the run this way is in.
		run = []
		todo = [ start ]
		while todo:
			i = todo.pop()
			if i in seen:
				continue
			seen.add( i )
			run.append( i )
			for node in ( roads[ i ][ 3 ], roads[ i ][ 4 ] ):
				todo += [ j for j in ends[ node ] if j not in seen ]
		# Its ends: nodes only one way of the run touches, with the ground's height there.
		count = defaultdict( int )
		for i in run:
			count[ roads[ i ][ 3 ] ] += 1
			count[ roads[ i ][ 4 ] ] += 1
		points = []
		for i in run:
			coords = roads[ i ][ 0 ]
			for node, xy in ( ( roads[ i ][ 3 ], coords[ 0 ] ), ( roads[ i ][ 4 ], coords[ -1 ] ) ):
				if count[ node ] == 1:
					points.append( ( xy, max( 0, ground_at( *xy ) ) ) )
		total = sum( LineString( roads[ i ][ 0 ] ).length for i in run )
		top = max( 2.5, min( 28, total * 0.045 ) )
		for i in run:
			out = []
			for x, y in roads[ i ][ 0 ]:
				# The ground at the two nearest ends, weighted by how near each is, plus the rise.
				near = sorted( ( math.hypot( x - ex, y - ey ), g ) for ( ex, ey ), g in points )[ :2 ] or [ ( 0, 0 ) ]
				if len( near ) == 2 and near[ 0 ][ 0 ] + near[ 1 ][ 0 ] > 0:
					( d0, g0 ), ( d1, g1 ) = near
					base = ( g0 * d1 + g1 * d0 ) / ( d0 + d1 )
				else:
					base = near[ 0 ][ 1 ]
				rise = min( top, near[ 0 ][ 0 ] * 0.07 )
				out.append( round( max( base + rise, ground_at( x, y ) + 0.5 ) * 10 ) )
			heights[ i ] = out
	return heights


def read_ground( dem, frame, lat0, lon0, spacing ):

	"""The elevation model's heights (m) on a grid over the frame, every `spacing` m from its
	north-west corner, rows from the north; NaN where it has none (mostly the water)."""
	import os
	import rasterio
	from affine import Affine
	from rasterio.crs import CRS
	from rasterio.enums import Resampling
	from rasterio.transform import from_origin
	from rasterio.warp import reproject, transform_bounds
	from rasterio.windows import from_bounds

	os.environ.setdefault( 'GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR' )
	url = CANADA_DEM if dem == 'canada' else dem
	path = f'/vsicurl/{ url }' if url.startswith( 'http' ) else url
	# This script's own projection (see project in main), so the grid lines up with everything else.
	local = CRS.from_proj4( f'+proj=eqc +lat_ts={ lat0 } +lat_0={ lat0 } +lon_0={ lon0 } +x_0=0 +y_0=0 +R={ R } +units=m +no_defs' )
	x0, y0, x1, y1 = frame.bounds
	columns = int( round( ( x1 - x0 ) / spacing ) ) + 1
	rows = int( round( ( y1 - y0 ) / spacing ) ) + 1
	out = np.full( ( rows, columns ), np.nan, dtype = np.float32 )
	with rasterio.open( path ) as src:
		# Read only the box (and a margin), at about half the grid's spacing, from the file's overviews.
		bounds = transform_bounds( local, src.crs, x0 - 4 * spacing, y0 - 4 * spacing, x1 + 4 * spacing, y1 + 4 * spacing )
		window = from_bounds( *bounds, transform = src.transform ).round_offsets().round_lengths()
		step = max( 1, spacing / 2 / src.res[ 0 ] )
		shape = ( max( 1, int( window.height / step ) ), max( 1, int( window.width / step ) ) )
		data = src.read( 1, window = window, out_shape = shape, resampling = Resampling.average, masked = True ).filled( np.nan ).astype( np.float32 )
		transform = src.window_transform( window ) * Affine.scale( window.width / shape[ 1 ], window.height / shape[ 0 ] )
		reproject(
			data, out, src_transform = transform, src_crs = src.crs, src_nodata = np.nan,
			dst_transform = from_origin( x0 - spacing / 2, y1 + spacing / 2, spacing, spacing ), dst_crs = local, dst_nodata = np.nan,
			resampling = Resampling.bilinear,
		)
	return out


def main():

	parser = argparse.ArgumentParser()
	parser.add_argument( 'pbf' )
	parser.add_argument( '--id', required = True )
	parser.add_argument( '--name', required = True )
	parser.add_argument( '--bbox', required = True, help = 'south,west,north,east' )
	parser.add_argument( '--start', action = 'append', default = [], help = 'Name:lat,lon' )
	parser.add_argument( '--dem', help = '"canada" (NRCan HRDEM), or an elevation GeoTIFF file or URL' )
	parser.add_argument( '--spacing', type = float, default = 10, help = 'metres between ground heights' )
	parser.add_argument( '--out' )
	args = parser.parse_args()

	s, w, n, e = map( float, args.bbox.split( ',' ) )
	lat0, lon0 = ( s + n ) / 2, ( w + e ) / 2
	cos0 = math.cos( math.radians( lat0 ) )

	def project( lat, lon ):

		return ( math.radians( lon - lon0 ) * R * cos0, math.radians( lat - lat0 ) * R )

	x0, y0 = project( s, w )
	x1, y1 = project( n, e )
	frame = box( x0, y0, x1, y1 )

	reader = Reader( ( s, w, n, e ), project )
	reader.apply_file( args.pbf, locations = True )

	# Buildings mapped as parts are drawn as their parts.
	parts = [ b for b in reader.buildings if b[ 2 ] ]
	tree = STRtree( [ p[ 0 ].representative_point() for p in parts ] ) if parts else None
	buildings = []
	for polygon, tags, is_part, osm_id in reader.buildings:
		polygon = polygon.intersection( frame )
		if polygon.is_empty:
			continue
		if not is_part and tree is not None and len( tree.query( polygon, predicate = 'contains' ) ) > 0:
			continue
		heights = height_of( tags )
		if not heights:
			continue
		base, top = heights
		fill = colour( tags.get( 'building:colour' ) ) or pick( osm_id, TALL if top > 40 else LOW )
		for shape in polygon_out( polygon, 0.15 ):
			buildings.append( [ shape[ 0 ], round( base * 10 ), round( top * 10 ), fill ] )

	land = land_of( reader.coast, frame )
	sea = frame.difference( land )

	# The ground: heights from the elevation model (or flat), and what each spot is.
	spacing = args.spacing
	x0g, y0g, x1g, y1g = frame.bounds
	if args.dem:
		heights_grid = read_ground( args.dem, frame, lat0, lon0, spacing )
	else:
		columns = int( round( ( x1g - x0g ) / spacing ) ) + 1
		heights_grid = np.full( ( int( round( ( y1g - y0g ) / spacing ) ) + 1, columns ), 1.0, dtype = np.float32 )
	rows, columns = heights_grid.shape
	kinds = rasterize_kinds( ( rows, columns ), spacing, x0g, y1g, sea = sea, lakes = reader.water, green = reader.green, sand = reader.sand, frame = frame )
	# Lakes keep the model's height (its water surface), filled where it has none; the sea's bed is
	# below the water; land is at least a little over it, and has a height everywhere.
	heights_grid = fill_gaps( heights_grid )
	heights_grid[ kinds == SEA ] = np.minimum( np.nan_to_num( heights_grid[ kinds == SEA ], nan = SEA_BED ), SEA_BED )
	on_land = kinds != SEA
	heights_grid[ on_land ] = np.maximum( heights_grid[ on_land ], 0.4 )

	def ground_at( x, y ):

		c = ( x - x0g ) / spacing
		r = ( y1g - y ) / spacing
		c0 = int( min( max( math.floor( c ), 0 ), columns - 2 ) )
		r0 = int( min( max( math.floor( r ), 0 ), rows - 2 ) )
		fc = min( max( c - c0, 0 ), 1 )
		fr = min( max( r - r0, 0 ), 1 )
		h = heights_grid
		return float( ( h[ r0, c0 ] * ( 1 - fc ) + h[ r0, c0 + 1 ] * fc ) * ( 1 - fr ) + ( h[ r0 + 1, c0 ] * ( 1 - fc ) + h[ r0 + 1, c0 + 1 ] * fc ) * fr )

	heights = bridge_heights( reader.roads, ground_at )
	roads = []
	for i, ( coords, tags, way, a, b ) in enumerate( reader.roads ):
		kind = tags[ 'highway' ]
		width = PATHS.get( kind ) or ROADS[ kind ]
		lanes = number( tags.get( 'lanes' ) )
		if kind in ROADS and lanes:
			width = max( width * 0.6, min( 28, lanes * 3.3 + 1 ) )
		line = LineString( coords )
		if i not in heights:
			line = line.intersection( frame )
			if line.is_empty:
				continue
		parts_of = line.geoms if hasattr( line, 'geoms' ) else [ line ]
		for part in parts_of:
			if part.geom_type != 'LineString' or part.length < 1:
				continue
			flat = []
			for x, y in part.coords:
				flat += [ round( x * 10 ), round( y * 10 ) ]
			cls = 'path' if kind in PATHS else 'major' if kind in ( 'motorway', 'trunk', 'primary', 'secondary' ) or kind.endswith( '_link' ) else 'minor'
			road = [ flat, round( width * 10 ) / 10, cls ]
			if i in heights:
				road.append( heights[ i ] )
			roads.append( road )

	starts = []
	for spec in args.start:
		name, at = spec.rsplit( ':', 1 )
		lat, lon = map( float, at.split( ',' ) )
		px, py = project( lat, lon )
		best = None
		for coords, tags, *_ in reader.roads:
			if tags[ 'highway' ] not in ROADS or tags.get( 'bridge' ) not in ( None, 'no' ):
				continue
			line = LineString( coords )
			d = line.distance( Point( px, py ) )
			if best is None or d < best[ 0 ]:
				best = ( d, line )
		if best:
			line = best[ 1 ]
			at = line.project( Point( px, py ) )
			q = line.interpolate( at )
			ahead = line.interpolate( min( line.length, at + 2 ) )
			behind = line.interpolate( max( 0, at - 2 ) )
			heading = math.degrees( math.atan2( ahead.x - behind.x, ahead.y - behind.y ) ) % 360
			starts.append( { 'name': name, 'at': [ round( q.x, 1 ), round( q.y, 1 ) ], 'heading': round( heading ) } )

	dem_credit = DEM_CREDIT.get( args.dem, 'Elevation: open data' if args.dem else None )
	ground_file = f'{ args.id }.ground.bin'
	city = {
		'id': args.id,
		'name': args.name,
		'credit': 'Map data (c) OpenStreetMap contributors, ODbL' + ( f' | { dem_credit }' if dem_credit else '' ),
		'origin': [ round( lat0, 6 ), round( lon0, 6 ) ],
		'size': [ round( x1 - x0 ), round( y1 - y0 ) ],
		'starts': starts,
		'ground': { 'file': ground_file, 'columns': columns, 'rows': rows, 'spacing': spacing, 'west': round( x0g, 1 ), 'north': round( y1g, 1 ), 'kinds': KINDS },
		'buildings': buildings,
		'roads': roads,
	}
	out = args.out or f'drive/public/cities/{ args.id }.json'
	with open( out, 'w' ) as f:
		json.dump( city, f, separators = ( ',', ':' ) )
	with open( os.path.join( os.path.dirname( out ), ground_file ), 'wb' ) as f:
		f.write( np.round( heights_grid * 10 ).clip( -32000, 32000 ).astype( '<i2' ).tobytes() )
		f.write( kinds.astype( np.uint8 ).tobytes() )
	land_cells = heights_grid[ kinds != SEA ]
	print( f'{ out }: { len( buildings ) } buildings, { len( roads ) } roads ({ len( heights ) } bridge ways), '
		f'ground { columns } x { rows } every { spacing } m, { land_cells.min():.1f} to { land_cells.max():.1f} m, { len( starts ) } starts' )


def rasterize_kinds( shape, spacing, west, north, sea, lakes, green, sand, frame ):

	"""What each grid spot is: parks and beaches on the land, lakes, and the sea over everything."""
	from rasterio.features import rasterize
	from rasterio.transform import from_origin
	transform = from_origin( west - spacing / 2, north + spacing / 2, spacing, spacing )
	shapes = [ ( p.intersection( frame ), GREEN_K ) for p in green ] + [ ( p.intersection( frame ), SAND_K ) for p in sand ]
	shapes += [ ( p.intersection( frame ), LAKE ) for p in lakes ]
	shapes += [ ( g, SEA ) for g in ( sea.geoms if hasattr( sea, 'geoms' ) else [ sea ] ) ]
	shapes = [ ( g, v ) for g, v in shapes if not g.is_empty ]
	return rasterize( shapes, out_shape = shape, transform = transform, fill = LAND, dtype = 'uint8' )


def fill_gaps( grid ):

	"""NaNs filled from their nearest neighbours, spreading inward a ring at a time."""
	grid = grid.copy()
	for _ in range( 200 ):
		gaps = np.isnan( grid )
		if not gaps.any():
			break
		padded = np.pad( grid, 1, constant_values = np.nan )
		near = np.stack( [ padded[ 1 + dy:padded.shape[ 0 ] - 1 + dy, 1 + dx:padded.shape[ 1 ] - 1 + dx ] for dy in ( -1, 0, 1 ) for dx in ( -1, 0, 1 ) if dy or dx ] )
		with np.errstate( all = 'ignore' ):
			mean = np.nanmean( near, axis = 0 )
		grid[ gaps ] = mean[ gaps ]
	return np.nan_to_num( grid, nan = 0 )


if __name__ == '__main__':
	main()
