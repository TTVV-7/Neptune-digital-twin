#!/usr/bin/env python3
"""Turn a STEP file into a GLB that `npm run add-own-asset` can take.

    python scripts/step-to-glb.py model.step model.glb [--deflection 2]

Keeps each solid's colour, and writes metres with Y up (STEP files are read in their own unit,
normally millimetres with Z up). --deflection is how far, in the file's unit, a flat facet may
stray from a curved surface: smaller is smoother and heavier.

Needs OpenCascade's Python bindings: pip install cadquery-ocp vtk (written for cadquery-ocp 8)
"""
import argparse
import sys

from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.collections import IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString, Sequence_TDF_Label
from OCP.IFSelect import IFSelect_RetDone
from OCP.Message import Message_ProgressRange
from OCP.RWGltf import RWGltf_CafWriter
from OCP.RWMesh import RWMesh_CoordinateSystem
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_DocumentTool

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("step")
parser.add_argument("glb")
parser.add_argument("--deflection", type=float, default=2.0)
args = parser.parse_args()

doc = TDocStd_Document(TCollection_ExtendedString("XmlXCAF"))
reader = STEPCAFControl_Reader()
reader.SetColorMode(True)
reader.SetNameMode(True)
if reader.ReadFile(args.step) != IFSelect_RetDone or not reader.Transfer(doc):
    sys.exit(f"Could not read {args.step}")

shapes = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
roots = Sequence_TDF_Label()
shapes.GetFreeShapes(roots)
for i in range(1, roots.Length() + 1):
    BRepMesh_IncrementalMesh(shapes.GetShape_s(roots.Value(i)), args.deflection, False, 0.4, True)

writer = RWGltf_CafWriter(TCollection_AsciiString(args.glb), True)
# The writer scales from the document's unit to metres itself; this turns Z-up into glTF's Y-up.
writer.ChangeCoordinateSystemConverter().SetInputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Zup)
if not writer.Perform(doc, IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString(), Message_ProgressRange()):
    sys.exit(f"Could not write {args.glb}")
print(f"Wrote {args.glb}")
