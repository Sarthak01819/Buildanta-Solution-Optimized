import bpy, bmesh, math
from mathutils import Matrix, Vector
import os
_BASE = os.path.dirname(os.path.abspath(__file__))
D_MODELS = os.path.join(_BASE, "assets", "models")
OUT = os.path.join(_BASE, "out")
def log(*a): print("[n]", *a, flush=True)

bpy.ops.wm.read_homefile(use_empty=True)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, 100
scene.render.fps = 24

def bring(glb, mesh_name, arm_name):
    before = set(o.name for o in bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{D_MODELS}/{glb}.glb")
    fresh = [o.name for o in bpy.data.objects if o.name not in before]
    for n in [n for n in fresh if n.startswith("Icosphere")]:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    fresh = [n for n in fresh if n in bpy.data.objects and not n.startswith("Icosphere")]
    mesh = [bpy.data.objects[n] for n in fresh if bpy.data.objects[n].type == "MESH"][0]
    arm = [bpy.data.objects[n] for n in fresh if bpy.data.objects[n].type == "ARMATURE"][0]
    # glTF splits verts at UV seams; unmerged seams crack open under subdivision
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    v0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(mesh.data); bm.free()
    mesh.data.update()
    for poly in mesh.data.polygons:
        poly.use_smooth = True
    if arm.animation_data:
        arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"; pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    mesh.name = mesh_name; mesh.data.name = mesh_name + "Mesh"
    arm.name = arm_name; arm.data.name = arm_name + "Rig"
    log("imported %s -> %s/%s  verts %d -> %d" % (glb, arm_name, mesh_name, v0, len(mesh.data.vertices)))
    return mesh, arm

gmesh, green = bring("fancy_hand_2", "GreenHand", "Hand_Green")
hmesh, human = bring("human_hand_1", "HumanHand", "Hand_Human")
bpy.context.view_layer.update()

DIGITS = ["f_index", "f_middle", "f_ring", "f_pinky"]
HAND = "DEF-hand.L"
def fb(d, j):  return "DEF-%s.0%d.L" % (d, j + 1)
def tb(j):     return "DEF-thumb.0%d.L" % (j + 1)

# ── which local axis curls, per rig (measured, never assumed) ────────────
def curl_axis(arm):
    hb = arm.pose.bones[HAND]
    base = ((arm.matrix_world @ arm.pose.bones[fb("f_middle", 2)].tail)
            - (arm.matrix_world @ hb.head)).length
    best = None
    for axis in (0, 1, 2):
        for sign in (1, -1):
            for d in DIGITS:
                for j in range(3):
                    e = [0.0, 0.0, 0.0]; e[axis] = -1.0 * sign
                    arm.pose.bones[fb(d, j)].rotation_euler = tuple(e)
            bpy.context.view_layer.update()
            dist = ((arm.matrix_world @ arm.pose.bones[fb("f_middle", 2)].tail)
                    - (arm.matrix_world @ hb.head)).length
            if best is None or dist < best[0]:
                best = (dist, axis, sign)
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    log("%s curl axis=%d sign=%+d (tip %.3f vs rest %.3f)" % (arm.name, best[1], best[2], best[0], base))
    return best[1], best[2]

G_AXIS, G_SIGN = curl_axis(green)
H_AXIS, H_SIGN = curl_axis(human)

# ── pose tables (unchanged from the verified site animation) ─────────────
FIST_P = [(-0.92, -1.23, -0.86), (-1.14, -1.31, -0.92),
          (-1.22, -1.36, -0.95), (-1.29, -1.30, -0.91)]
REACH_P = [(-0.16, -0.22, -0.10), (-0.20, -0.26, -0.10),
           (-0.24, -0.30, -0.11), (-0.28, -0.34, -0.12)]
FAN_REACH = [-0.20, -0.06, 0.06, 0.18]
TH_FIST = (-0.45, -0.72, -0.46)
TH_REACH = (0.06, 0.02, 0.0)

def _set(arm, bn, curl, axis, sign, fan=0.0, frame=None):
    pb = arm.pose.bones[bn]
    pb.rotation_mode = "XYZ"
    e = [0.0, 0.0, 0.0]
    e[axis] = curl * sign
    if fan:
        e[2 if axis != 2 else 1] = fan
    pb.rotation_euler = tuple(e)
    if frame is not None:
        pb.keyframe_insert("rotation_euler", frame=frame)

def pose(arm, table, fans, thumb, axis, sign, frame=None, scale=1.0):
    for ci, d in enumerate(DIGITS):
        for j in range(3):
            _set(arm, fb(d, j), table[ci][j] * scale, axis, sign,
                 (fans[ci] * scale) if (fans and j == 0) else 0.0, frame)
    for j in range(3):
        _set(arm, tb(j), thumb[j] * scale, axis, sign, 0.0, frame)

def pose_reach(arm, axis, sign, frame=None, scale=1.0):
    pose(arm, REACH_P, FAN_REACH, TH_REACH, axis, sign, frame, scale)

def pose_fist(arm, axis, sign, frame=None, scale=1.0):
    pose(arm, FIST_P, None, TH_FIST, axis, sign, frame, scale)

# ── anatomy axes in hand-bone local space (measured on the reach pose) ───
def anatomy(arm, axis, sign):
    pose_reach(arm, axis, sign)
    bpy.context.view_layer.update()
    hb = arm.pose.bones[HAND]
    Hw = arm.matrix_world @ hb.matrix
    R = Hw.to_3x3()
    head = Hw.translation
    F_w = ((arm.matrix_world @ arm.pose.bones[fb("f_middle", 2)].tail) - head).normalized()
    T_w = ((arm.matrix_world @ arm.pose.bones[tb(2)].tail) - head).normalized()
    Ri = R.inverted()
    F_l = (Ri @ F_w).normalized()
    T_l = (Ri @ T_w)
    U_l = (T_l - F_l * T_l.dot(F_l)).normalized()
    return F_l, U_l

G_FL, G_UL = anatomy(green, G_AXIS, G_SIGN)
H_FL, H_UL = anatomy(human, H_AXIS, H_SIGN)
log("green anatomy local F %s U %s" % (tuple(round(v,2) for v in G_FL), tuple(round(v,2) for v in G_UL)))
log("human anatomy local F %s U %s" % (tuple(round(v,2) for v in H_FL), tuple(round(v,2) for v in H_UL)))

def basis(a, b):
    """columns = [b, a, b x a] so that local F -> a and local U -> b."""
    c = b.cross(a)
    return Matrix((b, a, c)).transposed()

def place(arm, F_l, U_l, pos, aim, up):
    """Put the HAND BONE at `pos` with fingers along `aim`, thumb toward `up`."""
    up = (up - aim * up.dot(aim)).normalized()
    R = basis(aim, up) @ basis(F_l, U_l).inverted()
    Hn = Matrix.Translation(pos) @ R.to_4x4()
    arm.matrix_world = Hn @ arm.pose.bones[HAND].matrix.inverted()
    bpy.context.view_layer.update()

def key_obj(arm, frame):
    arm.rotation_mode = "QUATERNION"
    arm.keyframe_insert("location", frame=frame)
    arm.keyframe_insert("rotation_quaternion", frame=frame)
    arm.keyframe_insert("scale", frame=frame)

# ── staging: same diagonal as the shipped act ───────────────────────────
DIR = Vector((1, 0, -0.62)).normalized()
Z = Vector((0, 0, 1))
UP = (Z - DIR * Z.dot(DIR)).normalized()
GRIP = Vector((0, 0, 0))

# measure each fist's forward reach so the knuckles meet, not overlap
pose_fist(green, G_AXIS, G_SIGN); pose_fist(human, H_AXIS, H_SIGN)
place(green, G_FL, G_UL, -DIR * 0.6, DIR, UP)
place(human, H_FL, H_UL, DIR * 0.6, -DIR, UP)
dg = bpy.context.evaluated_depsgraph_get(); dg.update()
def extent(ob, d):
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    vals = [(ev.matrix_world @ v.co).dot(d) for v in me.vertices]
    ev.to_mesh_clear()
    return min(vals), max(vals)
_, g_front = extent(gmesh, DIR)
h_back, _ = extent(hmesh, DIR)
# 🔴 measured, not assumed: the extent-along-DIR estimate leaves a real 0.043
# gap once subdivision shrinks the cage and because each fist's frontmost
# vertex sits on a different finger. Closing it needs half the measured gap
# per hand plus a little compression so they read as pressed together.
OVERLAP = 0.003    # SEPARATES the hands; measured gap ~= 2*OVERLAP + 0.003
                   # 0.007 read as too wide, -0.004 interpenetrated: 0.003 splits it
G_POS = -DIR * 0.6 + DIR * (-g_front - OVERLAP)
H_POS = DIR * 0.6 + DIR * (-h_back + OVERLAP)
log("fist fronts: green %.3f human %.3f -> contact at %.3f / %.3f"
    % (g_front, h_back, G_POS.dot(DIR), H_POS.dot(DIR)))

# ── choreography: reach in open, cascade into fists, bump, recoil, hold ──
def gpos(back):  return G_POS - DIR * back
def hpos(back):  return H_POS + DIR * back

# these arms are ~2x longer than the old forearm-only model, so they need
# far less travel to read as an approach — measured against the b2g stop
# travel scales inversely with the zoom (SCALE 9.44 -> 15.5), or the hands
# swing outside the tighter frame during the reach
TRAVEL = [(1, 0.28), (55, 0.135), (66, 0.085), (71, 0.055), (75, 0.0),
          (77, -0.002), (79, 0.0), (86, 0.06), (93, 0.042), (100, 0.042)]
for f, back in TRAVEL:
    place(green, G_FL, G_UL, gpos(back), DIR, UP); key_obj(green, f)
    place(human, H_FL, H_UL, hpos(back), -DIR, UP); key_obj(human, f)

def cascade(arm, axis, sign, complete, scale=1.0):
    """Measured succession: thumb leads in and settles last, fingers arrive
    radial->ulnar +1f each, PIP leads inside a digit, MCP finishes last +2,
    each joint overshoots 12% and settles back over 3 frames."""
    JOINT_OFF = (2, 0, 1)
    OVER, LAG, SETTLE = 1.12, 2, 3
    for ci, d in enumerate(DIGITS):
        base = complete + ci
        for j in range(3):
            f = base + JOINT_OFF[j]
            v = FIST_P[ci][j] * scale
            _set(arm, fb(d, j), v, axis, sign, 0.0, f)
            _set(arm, fb(d, j), v * OVER, axis, sign, 0.0, f + LAG)
            _set(arm, fb(d, j), v, axis, sign, 0.0, f + LAG + SETTLE)
    for j in range(3):
        f = complete - 2 + j
        _set(arm, tb(j), TH_FIST[j] * scale, axis, sign, 0.0, f)
        _set(arm, tb(j), TH_FIST[j] * 1.10 * scale, axis, sign, 0.0, f + 3)
        _set(arm, tb(j), TH_FIST[j] * scale, axis, sign, 0.0, f + 7)

pose_reach(green, G_AXIS, G_SIGN, frame=1);  pose_reach(green, G_AXIS, G_SIGN, frame=50)
pose_reach(human, H_AXIS, H_SIGN, frame=1, scale=0.85)
pose_reach(human, H_AXIS, H_SIGN, frame=50, scale=0.85)
cascade(green, G_AXIS, G_SIGN, 64)
cascade(human, H_AXIS, H_SIGN, 66, scale=0.94)
# impact bite on contact, release over 4 frames, then hold
for arm, axis, sign, sc in ((green, G_AXIS, G_SIGN, 1.0), (human, H_AXIS, H_SIGN, 0.94)):
    for ci, d in enumerate(DIGITS):
        for j in range(3):
            v = FIST_P[ci][j] * sc
            _set(arm, fb(d, j), v * 1.04, axis, sign, 0.0, 77)
            _set(arm, fb(d, j), v, axis, sign, 0.0, 81)
    for j in range(3):
        _set(arm, tb(j), TH_FIST[j] * sc, axis, sign, 0.0, 100)
    for ci, d in enumerate(DIGITS):
        for j in range(3):
            _set(arm, fb(d, j), FIST_P[ci][j] * sc, axis, sign, 0.0, 100)
log("keyed")

scene.frame_set(1)
out = OUT + "/newhands_site.blend"
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
log("SAVED", out)

# preview renders straight from the saved state
mat_g = bpy.data.materials.new("G"); mat_g.use_nodes = True
mat_g.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.62, 0.30, 1)
mat_h = bpy.data.materials.new("H"); mat_h.use_nodes = True
mat_h.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.88, 0.66, 0.52, 1)
gmesh.data.materials.clear(); gmesh.data.materials.append(mat_g)
hmesh.data.materials.clear(); hmesh.data.materials.append(mat_h)
cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam); scene.camera = cam
for rot, e in (((0.8, 0.2, -0.35), 3.2), ((1.9, -0.4, 2.6), 1.5)):
    ld = bpy.data.lights.new("L", "SUN"); ld.energy = e
    lo = bpy.data.objects.new("L", ld); lo.rotation_euler = rot
    scene.collection.objects.link(lo)
w = bpy.data.worlds.new("W"); w.color = (0.70, 0.78, 0.83); scene.world = w
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1100; scene.render.resolution_y = 700
for f in (50, 75, 100):
    scene.frame_set(f)
    cam.location = Vector((0, -2.4, 0.5))
    dv = Vector((0, 0, 0)) - cam.location
    cam.rotation_euler = dv.to_track_quat("-Z", "Z").to_euler()
    scene.render.filepath = OUT + f"/new-f{f:03d}.png"
    bpy.ops.render.render(write_still=True)
    log("preview f", f)
