import bpy, math
from mathutils import Vector
import os
_BASE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(_BASE, "assets", "models")
for name in ("fancy_hand_2", "human_hand_1"):
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f"{D}/{name}.glb")
    for o in [o for o in bpy.data.objects if o.name.startswith("Icosphere")]:
        bpy.data.objects.remove(o, do_unlink=True)
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    mesh = [o for o in bpy.data.objects if o.type == "MESH"][0]
    print("[H]", name, "arm:", arm.name, "mesh:", mesh.name, flush=True)
    roots = [b for b in arm.pose.bones if b.parent is None]
    print("[H]   roots:", [b.name for b in roots], flush=True)
    def walk(b, d=0):
        print("[H]   " + "  " * d + b.name, flush=True)
        for c in b.children:
            if d < 2: walk(c, d + 1)
    for r in roots: walk(r)
    hb = arm.pose.bones["DEF-hand.L"]
    M = hb.matrix.to_3x3()
    print("[H]   hand bone local axes in world: X %s  Y %s  Z %s" % (
        tuple(round(v,2) for v in (M @ Vector((1,0,0)))),
        tuple(round(v,2) for v in (M @ Vector((0,1,0)))),
        tuple(round(v,2) for v in (M @ Vector((0,0,1))))), flush=True)
    tip = arm.matrix_world @ arm.pose.bones["DEF-f_middle.03.L"].tail
    head = arm.matrix_world @ hb.head
    print("[H]   finger dir (world):", tuple(round(v,2) for v in (tip-head).normalized()), flush=True)
    # chirality: cross(fingerdir, thumbdir) tells left vs right
    th = arm.matrix_world @ arm.pose.bones["DEF-thumb.03.L"].tail
    print("[H]   thumb dir  (world):", tuple(round(v,2) for v in (th-head).normalized()), flush=True)
    print("[H]   arm obj matrix_world translation:", tuple(round(v,2) for v in arm.matrix_world.translation), flush=True)
