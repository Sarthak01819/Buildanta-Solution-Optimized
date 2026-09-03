import bpy
from mathutils import Vector, kdtree
import os
_BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_BASE, "out")
bpy.ops.wm.open_mainfile(filepath=OUT + "/newhands_site.blend")
scene = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
for f in (75, 77):
    scene.frame_set(f); dg.update()
    pts = {}
    for n in ("GreenHand", "HumanHand"):
        ev = bpy.data.objects[n].evaluated_get(dg); me = ev.to_mesh()
        pts[n] = [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    kd = kdtree.KDTree(len(pts["GreenHand"]))
    for i, p in enumerate(pts["GreenHand"]): kd.insert(p, i)
    kd.balance()
    best = min((kd.find(p)[2], p) for p in pts["HumanHand"])
    close = sum(1 for p in pts["HumanHand"] if kd.find(p)[2] < 0.01)
    print("[g] f%d  min gap %.4f model units | human verts within 0.01: %d" % (f, best[0], close), flush=True)
