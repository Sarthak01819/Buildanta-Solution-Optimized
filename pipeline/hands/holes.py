import bpy, bmesh, sys
import os
_BASE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(_BASE, "assets", "models")
for name in ("fancy_hand_2", "human_hand_1", "human_hand_2"):
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f"{D}/{name}.glb")
    for o in [o for o in bpy.data.objects if o.name.startswith("Icosphere")]:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in [o for o in bpy.data.objects if o.type == "MESH"]:
        bm = bmesh.new(); bm.from_mesh(m.data)
        boundary = [e for e in bm.edges if len(e.link_faces) == 1]
        print("[h] %-15s %-28s verts %5d  boundary edges %4d  %s" % (
            name, m.name, len(bm.verts), len(boundary),
            "WATERTIGHT" if not boundary else "open (forearm cut end — expected)"), flush=True)
        bm.free()
