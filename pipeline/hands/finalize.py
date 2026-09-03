import bpy, os, struct, json
from mathutils import Vector
import os
_BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_BASE, "out")
def log(*a): print("[x]", *a, flush=True)
bpy.ops.wm.open_mainfile(filepath=OUT + "/newhands_site.blend")
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, 100

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def paint(mesh_name, arm_name, stops):
    """Vertex-colour gradient along elbow->fingertip. The new mesh carries real
    geometric detail, so no baked normal map is needed — colour is all we add.
    Site material already multiplies matcap x COLOR_0."""
    ob = bpy.data.objects[mesh_name]
    arm = bpy.data.objects[arm_name]
    elbow = arm.pose.bones["DEF-forearm.L"].head
    tip = arm.pose.bones["DEF-f_middle.03.L"].tail
    axis = (tip - elbow)
    L = axis.length
    axis = axis.normalized()
    me = ob.data
    if not me.color_attributes:
        me.color_attributes.new(name="Shade", type="FLOAT_COLOR", domain="POINT")
    ca = me.color_attributes[0]
    for i, v in enumerate(me.vertices):
        t = max(0.0, min(1.0, (v.co - elbow).dot(axis) / L))
        # piecewise through the stops
        col = stops[-1][1]
        for k in range(len(stops) - 1):
            p0, c0 = stops[k]; p1, c1 = stops[k + 1]
            if t <= p1:
                u = 0.0 if p1 <= p0 else (t - p0) / (p1 - p0)
                col = lerp(c0, c1, max(0.0, min(1.0, u)))
                break
        ca.data[i].color = (col[0], col[1], col[2], 1.0)
    log("painted", mesh_name, len(me.vertices), "verts")

# Yash's own textures now carry all the colour (matcap-hand.webp for the
# green, the baked human_hands atlas tile for the skin), so COLOR_0 must be
# neutral white or it would tint them.
paint("GreenHand", "Hand_Green", [(0.0, (1,1,1)), (1.0, (1,1,1))]) if True else paint("GreenHand", "Hand_Green", [
    (0.00, (0.05, 0.42, 0.18)),
    (0.55, (0.09, 0.62, 0.26)),
    (0.86, (0.16, 0.80, 0.34)),
    (1.00, (0.34, 0.95, 0.44)),
])
# human: warm rosy-beige, slightly flushed toward the fingers
paint("HumanHand", "Hand_Human", [(0.0, (1,1,1)), (1.0, (1,1,1))])

# subdivide for the close-up (the site camera sees these large)
for n in ("GreenHand", "HumanHand"):
    ob = bpy.data.objects[n]
    if not any(m.type == "SUBSURF" for m in ob.modifiers):
        sub = ob.modifiers.new("Smooth", "SUBSURF")
        sub.levels = 1; sub.render_levels = 1
bpy.ops.wm.save_mainfile()

for o in bpy.data.objects:
    o.select_set(o.name in ("Hand_Green", "GreenHand", "Hand_Human", "HumanHand"))
out = OUT + "/newhands.glb"
bpy.ops.export_scene.gltf(
    filepath=out, use_selection=True, export_format="GLB",
    export_animations=True, export_animation_mode="SCENE",
    export_anim_scene_split_object=False,
    export_bake_animation=True, export_apply=True,
    export_vertex_color="ACTIVE", export_vertex_color_name="Shade",
    export_all_vertex_colors=True, export_active_vertex_color_when_no_material=True,
    export_frame_range=True, export_yup=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6)
log("EXPORTED", round(os.path.getsize(out) / 1048576, 2), "MB")
raw = open(out, "rb").read()
n = struct.unpack("<I", raw[12:16])[0]
j = json.loads(raw[20:20 + n])
log("animations:", [(a.get("name"), len(a["channels"])) for a in j.get("animations", [])])
log("meshes:", [m.get("name") for m in j.get("meshes", [])])
attrs = set()
for m in j.get("meshes", []):
    for pr in m["primitives"]:
        attrs |= set(pr["attributes"].keys())
log("attrs:", sorted(attrs))
log("nodes with 'Green':", [nd.get("name") for nd in j.get("nodes", []) if "Green" in (nd.get("name") or "")][:4])
