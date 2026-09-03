import bpy, sys, math
from mathutils import Vector
import os
_BASE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(_BASE, "assets", "models")
OUT = os.path.join(_BASE, "out")
name = sys.argv[-1]
def log(*a): print("[p]", *a, flush=True)
bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=f"{D}/{name}.glb")
scene = bpy.context.scene
for o in [o for o in bpy.data.objects if o.name.startswith("Icosphere")]:
    bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
if arm.animation_data: arm.animation_data_clear()
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"; pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

# OUR pose tables, mapped onto Rigify DEF- chains (.01=MCP, .02=PIP, .03=DIP)
FIST_P = [(-0.92, -1.23, -0.86), (-1.14, -1.31, -0.92),
          (-1.22, -1.36, -0.95), (-1.29, -1.30, -0.91)]
REACH_P = [(-0.16, -0.22, -0.10), (-0.20, -0.26, -0.10),
           (-0.24, -0.30, -0.11), (-0.28, -0.34, -0.12)]
FAN_REACH = [-0.20, -0.06, 0.06, 0.18]
DIGITS = ["f_index", "f_middle", "f_ring", "f_pinky"]

def apply(table, fan, axis, sign):
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
    for ci, dg_ in enumerate(DIGITS):
        for j in range(3):
            bn = "DEF-%s.0%d.L" % (dg_, j + 1)
            if bn not in arm.pose.bones:
                log("MISSING", bn); continue
            pb = arm.pose.bones[bn]
            e = [0.0, 0.0, 0.0]
            e[axis] = table[ci][j] * sign
            if j == 0 and fan:
                e[2 if axis != 2 else 1] = fan[ci]
            pb.rotation_euler = tuple(e)
    for j in range(3):
        bn = "DEF-thumb.0%d.L" % (j + 1)
        if bn in arm.pose.bones:
            pb = arm.pose.bones[bn]
            e = [0.0, 0.0, 0.0]
            e[axis] = (-0.45, -0.72, -0.46)[j] * sign * (1 if table is FIST_P else 0.15)
            pb.rotation_euler = tuple(e)
    bpy.context.view_layer.update()

mat = bpy.data.materials.new("Clay"); mat.use_nodes = True
b = mat.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = ((0.09, 0.62, 0.30, 1) if "fancy" in name else (0.88, 0.66, 0.52, 1))
b.inputs["Roughness"].default_value = 0.42
for m in meshes:
    m.data.materials.clear(); m.data.materials.append(mat)
    for poly in m.data.polygons: poly.use_smooth = True
cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam); scene.camera = cam
for rot, e in (((0.8, 0.2, -0.35), 3.2), ((1.9, -0.4, 2.6), 1.5)):
    ld = bpy.data.lights.new("L", "SUN"); ld.energy = e
    lo = bpy.data.objects.new("L", ld); lo.rotation_euler = rot
    scene.collection.objects.link(lo)
w = bpy.data.worlds.new("W"); w.color = (0.70, 0.78, 0.83); scene.world = w
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 820; scene.render.resolution_y = 720

def shoot(tag):
    hand = arm.matrix_world @ arm.pose.bones["DEF-hand.L"].head
    tip = arm.matrix_world @ arm.pose.bones["DEF-f_middle.03.L"].tail
    ctr = (hand + tip) / 2
    r = max(0.16, (tip - hand).length) * 2.6
    F = (tip - hand).normalized()
    N = (arm.pose.bones["DEF-hand.L"].matrix.to_3x3() @ Vector((0, 0, 1))).normalized()
    N = (N - F * N.dot(F)).normalized()
    cam.location = ctr - N * r
    dv = ctr - cam.location
    cam.rotation_euler = dv.to_track_quat("-Z", "Z").to_euler()
    scene.render.filepath = f"{OUT}/prove-{name}-{tag}.png"
    bpy.ops.render.render(write_still=True)
    log("shot", tag)

# find which axis/sign curls the fingers: measure fingertip distance to palm
def tipdist():
    hand = arm.matrix_world @ arm.pose.bones["DEF-hand.L"].head
    tip = arm.matrix_world @ arm.pose.bones["DEF-f_middle.03.L"].tail
    return (tip - hand).length
base = tipdist()
best = None
for axis in (0, 1, 2):
    for sign in (1, -1):
        apply(FIST_P, None, axis, sign)
        d = tipdist()
        log("axis %d sign %+d -> tip dist %.3f (rest %.3f)" % (axis, sign, d, base))
        if best is None or d < best[0]:
            best = (d, axis, sign)
log("CURL AXIS =", best[1], "SIGN =", best[2], "(shortest tip distance = most curled)")
apply(FIST_P, None, best[1], best[2]); shoot("fist")
apply(REACH_P, FAN_REACH, best[1], best[2]); shoot("reach")
