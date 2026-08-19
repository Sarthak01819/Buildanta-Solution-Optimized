"""
AGENT 1 — PROCEDURAL MODELLER (project brief, 19 Aug 2026)

Builds the market-act cinema camera entirely from the parameter table below.
No external service, no sculpting. Re-run to re-derive; diff constants to see
every design change.

COORDINATE FRAME
  Model space (the brief's): X right, Y up, Z toward viewer, mm, origin at
  the LENS CENTRE.  1 mm = 1 px of the 785x1511 reference.
  Blender space here:        X right, Z up, -Y toward viewer.
    blender.x = model.x      blender.z = model.y      blender.y = -model.z
  The glTF exporter (+Y up) then lands the GLB exactly in model space.

Run:  blender --background --python build_camera.py -- /path/out/camera.glb
"""
import bpy, bmesh, math, sys

# ── MEASURED (X/Y from the shipped asset — do not invent) ────────────────────
LENS_R_FLANGE, LENS_R_MID, LENS_R_BARREL = 118.0, 100.0, 86.0
LENS_DOME_R          = 64.0
REEL_X, REEL_Y       = 180.0, 319.5
REEL_R               = 135.5
REEL_CUT_R, REEL_CUT_ON = 37.0, 78.0
HUB_R, HUB_HOLE_R, HUB_HOLE_ON = 36.0, 7.0, 19.0
BODY_X, BODY_TOP, BODY_BOT = 222.0, 179.0, -177.0
PLATE_W              = 266.0
KNOB_X, KNOB_Y, KNOB_R = 262.0, -7.5, 33.4
CRANK_X, CRANK_Y, CRANK_ARM = 259.0, -170.6, 141.3
HEAD_TOP, HEAD_BOT   = -233.0, -327.0
CROWN_TOP, CROWN_BOT, CROWN_R = -339.0, -395.0, 187.0
FEET_Y               = -1026.0
BRACE_Y              = -585.0

# ── CHOSEN (depth: the elevation carries no Z — tune freely) ─────────────────
BODY_DEPTH           = 300.0
REEL_THICK           = 26.0
REEL_SETBACK         = 40.0     # from body front
LENS_PROTRUDE        = 90.0
VIEWFINDER_PROTRUDE  = 120.0
FEET_SPLAY_Z         = 380.0

# ── TOPOLOGY (segment counts, the triangle budget lever) ─────────────────────
SEG_REEL, SEG_CUT, SEG_HOLE = 96, 32, 16
SEG_LENS, SEG_KNOB, SEG_LEG = 96, 32, 16
BODY_BEVEL_SEG       = 2

FRONT = -BODY_DEPTH / 2          # blender.y of the body front face

# ── helpers ──────────────────────────────────────────────────────────────────
# ⚠️ Every helper DESELECTS ALL before adding its primitive. bpy ops like
# transform_apply act on EVERY selected object — without the deselect, each new
# part's apply re-applied earlier parts' pending transforms. That is how the
# body's depth got silently doubled (to z ±300), swallowing the entire lens
# inside it: invisible in the silhouette matcher (same alpha either way), found
# only when the lens failed to render in the real scene.
def B(x, y, z):        # model → blender
    return (x, -z, y)

def cyl(name, r, depth, at, seg, axis):
    """Cylinder along a NAMED blender axis. Explicit always — the v1 default
    of 'Y' put the tripod crown, head hub and every leg on the depth axis and
    rendered them face-on. 'Z' = vertical, 'Y' = depth (toward viewer),
    'X' = sideways."""
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=depth,
                                        location=at)
    o = bpy.context.object; o.name = name
    if axis == 'Y': o.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X': o.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.transform_apply(rotation=True)
    return o

def rod(name, r, p0, p1, seg):
    """Cylinder aimed from p0 to p1 (blender coords) — for tripod legs."""
    import mathutils
    d = mathutils.Vector((p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]))
    L = d.length
    mid = ((p0[0]+p1[0])/2, (p0[1]+p1[1])/2, (p0[2]+p1[2])/2)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=L, location=mid)
    o = bpy.context.object; o.name = name
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(rotation=True)
    return o

def ring(name, R, tube, at, seg_major, seg_minor=8):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=tube,
        major_segments=seg_major, minor_segments=seg_minor, location=at,
        rotation=(math.pi/2, 0, 0))
    o = bpy.context.object; o.name = name
    bpy.ops.object.transform_apply(rotation=True)
    return o

def box(name, sx, sy, sz, at):
    """Full-dimension box. ⚠️ v1-v4 scaled a size-1 cube by s/2 — half of a
    half — so every box in the model rendered at HALF SIZE while all the
    cylinders were right. Found by scanline: the body measured 222px across
    where the spec (and the reference) say 444. size=2 cube × s/2 = s."""
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cube_add(size=2, location=at)
    o = bpy.context.object; o.name = name
    o.scale = (sx / 2, sy / 2, sz / 2)
    bpy.ops.object.transform_apply(scale=True)
    return o

def knurl(name, r, depth, at, axis, seg=SEG_KNOB):
    """A dial that reads MACHINED: body cylinder + two edge rings + a proud
    cap. The reference's side hardware is all knurled dials — plain cylinders
    are what made the old build look like a toy (Yash, 23:23)."""
    parts = [cyl(name, r, depth, at, seg, axis)]
    off = (depth / 2 - 2)
    for d in (-1, 1):
        ra = list(at)
        if axis == 'X': ra[0] += d * off; rot = (0, math.pi/2, 0)
        elif axis == 'Y': ra[1] += d * off; rot = (math.pi/2, 0, 0)
        else: ra[2] += d * off; rot = (0, 0, 0)
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.mesh.primitive_torus_add(major_radius=r - 1, minor_radius=3.2,
            major_segments=24, minor_segments=6, location=tuple(ra), rotation=rot)
        t = bpy.context.object; t.name = name + "_ring"
        bpy.ops.object.transform_apply(rotation=True)
        parts.append(t)
    capat = list(at)
    if axis == 'X': capat[0] += off + 4
    elif axis == 'Y': capat[1] += off + 4
    else: capat[2] += off + 4
    parts.append(cyl(name + "_cap", r * 0.44, 10, tuple(capat), 16, axis))
    return join(parts, name)

def bevel(o, width=6, segs=BODY_BEVEL_SEG):
    m = o.modifiers.new("bev", 'BEVEL'); m.width = width; m.segments = segs
    m.limit_method = 'ANGLE'; m.angle_limit = math.radians(40)

def cut(target, cutter):
    m = target.modifiers.new("cut", 'BOOLEAN'); m.operation = 'DIFFERENCE'
    m.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name
    return parts[0]

def set_origin(o, model_xyz):
    bpy.context.scene.cursor.location = B(*model_xyz)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

# ── clean scene ──────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()

# ── 1 · body ─────────────────────────────────────────────────────────────────
body = box("body", BODY_X * 2, BODY_DEPTH, BODY_TOP - BODY_BOT,
           B(0, (BODY_TOP + BODY_BOT) / 2, 0)); bevel(body, 8)
# the recessed front plate: proud of the body's front face by 4mm, built in
# ONE call — the old build-then-reassign dance left a phantom plate at double
# depth that swallowed the lens
plate = box("plate", PLATE_W, 8, PLATE_W, (0, FRONT - 4, 0))
screws = []
for sx in (-1, 1):
    for sz in (-1, 1):
        s = cyl("screw", 7, 6, (sx * (PLATE_W/2 - 18), FRONT - 8, sz * (PLATE_W/2 - 18)), 12, 'Y')
        screws.append(s)
# raised bezel frame around the plate + mid-edge screws — the reference's
# front is a BOLTED panel, not a flat card (detail pass, 23:23)
F_IN = PLATE_W - 44
frame_bars = [
    box("fr_t", F_IN, 6, 10, (0, FRONT - 9, F_IN/2 - 5)),
    box("fr_b", F_IN, 6, 10, (0, FRONT - 9, -F_IN/2 + 5)),
    box("fr_l", 10, 6, F_IN, (-F_IN/2 + 5, FRONT - 9, 0)),
    box("fr_r", 10, 6, F_IN, (F_IN/2 - 5, FRONT - 9, 0)),
]
for sx, sz in ((0, 1), (0, -1), (1, 0), (-1, 0)):
    screws.append(cyl("screw", 6, 6, (sx * (PLATE_W/2 - 18), FRONT - 8, sz * (PLATE_W/2 - 18)), 12, 'Y'))
body_parts = [body, plate] + screws + frame_bars

# ── 2 · lens (revolved stack on the origin, protruding forward) ──────────────
# DETAIL PASS (Yash's reference, 23:23): the glass is RECESSED into the
# barrel behind a retaining ring — the old dome bulged 64mm past the barrel
# and read as a ball bearing, the single loudest "plain 3D" tell. Machined
# ridge rings on the mid step give the assembly its lathe-turned character.
BARREL_FRONT = FRONT - LENS_PROTRUDE          # blender.y of the barrel's front face
lens_parts = [
    cyl("l_flange", LENS_R_FLANGE, 16, (0, FRONT - 8, 0), SEG_LENS, 'Y'),
    cyl("l_mid",    LENS_R_MID,    28, (0, FRONT - 16 - 14, 0), SEG_LENS, 'Y'),
    cyl("l_barrel", LENS_R_BARREL, LENS_PROTRUDE - 44,
        (0, FRONT - 44 - (LENS_PROTRUDE - 44) / 2, 0), SEG_LENS, 'Y'),
    ring("l_ridge1", LENS_R_MID, 3.5, (0, FRONT - 18, 0), 48, 6),
    ring("l_ridge2", LENS_R_MID, 3.5, (0, FRONT - 40, 0), 48, 6),
    # the retaining ring: the bright machined lip that holds the glass
    ring("l_retain", LENS_R_BARREL - 14, 5, (0, BARREL_FRONT + 2, 0), 48, 6),
    # inner bore wall behind the retaining ring, so the recess has depth
    cyl("l_bore", LENS_R_BARREL - 12, 26, (0, BARREL_FRONT + 14, 0), SEG_LENS, 'Y'),
]
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.mesh.primitive_uv_sphere_add(segments=SEG_LENS, ring_count=32,
    radius=LENS_DOME_R, location=(0, BARREL_FRONT + LENS_DOME_R - 22, 0))
dome = bpy.context.object; dome.name = "l_glass"
# The GLASS is a CHILD of the lens node, not joined into it: the reference's
# lens surround is BRIGHT machined metal and only the element is dark — two
# materials need two meshes, and the runtime splits them by name (l_glass).
lens = join(lens_parts, "lens")
set_origin(lens, (0, 0, 0))
bpy.ops.object.select_all(action='DESELECT')
dome.select_set(True); lens.select_set(True)
bpy.context.view_layer.objects.active = lens
bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)

# ── 3 · reels (build A, then mirror-place B) ─────────────────────────────────
def build_reel(name, mx):
    ry = FRONT + REEL_SETBACK + REEL_THICK / 2      # blender.y of reel centre
    disc = cyl(name + "_disc", REEL_R - 8, REEL_THICK, (mx, ry, REEL_Y), SEG_REEL, 'Y')
    rim  = ring(name + "_rim", REEL_R - 7, 7.5, (mx, ry, REEL_Y), SEG_REEL)
    for k in range(5):
        a = k * 2 * math.pi / 5 + math.radians(19)   # phase MEASURED off the reference
        c = cyl("c", REEL_CUT_R, REEL_THICK * 2,
                (mx + math.cos(a) * REEL_CUT_ON, ry, REEL_Y + math.sin(a) * REEL_CUT_ON),
                SEG_CUT, 'Y')
        cut(disc, c)
    hub = cyl(name + "_hub", HUB_R, REEL_THICK + 14, (mx, ry, REEL_Y), SEG_CUT, 'Y')
    for k in range(6):
        a = k * math.pi / 3
        h = cyl("h", HUB_HOLE_R, REEL_THICK * 3,
                (mx + math.cos(a) * HUB_HOLE_ON, ry, REEL_Y + math.sin(a) * HUB_HOLE_ON),
                SEG_HOLE, 'Y')
        cut(hub, h)
    capc = cyl(name + "_cap", 13, 10, (mx, ry - REEL_THICK / 2 - 9, REEL_Y), 16, 'Y')
    reel = join([disc, rim, hub, capc], name)
    set_origin(reel, (mx, REEL_Y, 0))   # origin on the spool axis
    return reel

reel_a = build_reel("reel_a", -REEL_X)
reel_b = build_reel("reel_b",  REEL_X)

# ── 4 · magazine + 5 · bracket ───────────────────────────────────────────────
mag = box("magazine", 70, REEL_THICK + 26, 150, B(0, REEL_Y - 46, 0))
mag.location.y = FRONT + REEL_SETBACK + REEL_THICK / 2
bracket = box("bracket", BODY_X * 2 - 40, 60, 34, B(0, BODY_TOP + 12, 0))

# ── 6 · fittings: viewfinder (left), side knobs ──────────────────────────────
# viewfinder: the small flared eyepiece at upper-left, above the body top —
# measured off the reference at model (-150..-260, +237)
bpy.ops.mesh.primitive_cone_add(vertices=SEG_KNOB, radius1=40, radius2=16,
    depth=VIEWFINDER_PROTRUDE, location=B(-150 - VIEWFINDER_PROTRUDE / 2, 237, 0),
    rotation=(0, math.pi / 2, 0))
vf = bpy.context.object; vf.name = "viewfinder"
knobs = []
for sx in (-1, 1):
    knobs.append(knurl("knob", KNOB_R, 30, (sx * KNOB_X, 0, KNOB_Y), 'X'))
    knobs.append(knurl("knob2", KNOB_R * 0.62, 24, (sx * (KNOB_X - 6), 0, KNOB_Y - 148), 'X'))
    # the small upper stud each side — the reference's flanks are BUSY
    knobs.append(cyl("stud", 13, 26, (sx * (KNOB_X - 10), 0, KNOB_Y + 118), 16, 'X'))

# side housings: the reference body reads wider than the ±222 core because of
# motor/gear housings on both flanks (iter-3 band IoU: the largest mass gap)
housings = []
for sx in (-1, 1):
    housings.append(box("housing", 34, 170, 150, B(sx * (BODY_X + 12), 6, 0)))
# platform between body bottom and head: wide rounded slab
platform = box("platform", 220, 190, 26, B(0, BODY_BOT - 14, 0)); bevel(platform, 6)
camera_body = join(body_parts + [mag, bracket, vf] + knobs + housings + [platform], "camera_body")
set_origin(camera_body, (0, 0, 0))

# ── 7 · crank (L-arm; origin on pivot) ───────────────────────────────────────
# crank: hub on the pivot (depth axis), arm reaching up-right in the screen
# plane to the grip post, grip pointing at the viewer — the reference's shape
c_hub = cyl("c_hub", 20, 30, (CRANK_X, 0, CRANK_Y), SEG_KNOB, 'Y')
ARM_ANG = math.radians(27)
ax0, az0 = CRANK_X, CRANK_Y
ax1 = CRANK_X + math.cos(ARM_ANG) * CRANK_ARM * 0.77
az1 = CRANK_Y + math.sin(ARM_ANG) * CRANK_ARM * 0.77
c_arm = rod("c_arm", 10, (ax0, 0, az0), (ax1, 0, az1), SEG_HOLE)
c_post = rod("c_post", 9, (ax1, 0, az1), (ax1, 0, az1 - 8), SEG_HOLE)
c_grip = cyl("c_grip", 11, 70, (ax1 + 35, 0, az1), SEG_HOLE, 'X')
crank = join([c_hub, c_arm, c_post, c_grip], "crank")
set_origin(crank, (CRANK_X, CRANK_Y, 0))

# ── 8 · head ─────────────────────────────────────────────────────────────────
h_mount = box("h_mount", 216, 180, (BODY_BOT - HEAD_TOP) * -1 + 4,
              B(0, (BODY_BOT + HEAD_TOP) / 2, 0))
h_hub = cyl("h_hub", 62, HEAD_TOP - HEAD_BOT, (0, 0, (HEAD_TOP + HEAD_BOT) / 2), 32, 'Z')
h_boss = cyl("h_boss", 44, 70, (0, 0, (HEAD_TOP + HEAD_BOT) / 2), SEG_KNOB, 'Y')
# the tilt mechanism the reference shows under the body: a cross axle with
# knurled locking knobs on BOTH ends, through the pivot boss
h_axle = cyl("h_axle", 12, 300, (0, 0, HEAD_BOT + 30), SEG_HOLE, 'X')
h_k1 = knurl("h_k1", 26, 24, (-152, 0, HEAD_BOT + 30), 'X', seg=24)
h_k2 = knurl("h_k2", 26, 24, (152, 0, HEAD_BOT + 30), 'X', seg=24)
h_plate = box("h_plate", 236, 190, 12, B(0, HEAD_TOP + 8, 0))
head = join([h_mount, h_hub, h_boss, h_axle, h_k1, h_k2, h_plate], "head")
set_origin(head, (0, (HEAD_TOP + HEAD_BOT) / 2, 0))

# ── 9 · tripod ───────────────────────────────────────────────────────────────
crown = cyl("crown", CROWN_R, CROWN_TOP - CROWN_BOT, (0, 0, (CROWN_TOP + CROWN_BOT) / 2), 32, 'Z')
# legs read TELESCOPIC now (reference): fat upper tube, clamp collar, thinner
# mid tube, second collar, thin lower tube, then a spike with a ball tip
legs = [cyl("underplate", 96, 26, (0, 0, CROWN_BOT - 10), 32, 'Z')]
for az in (210, 330, 90):
    a = math.radians(az)
    hip  = (math.cos(a) * 120, math.sin(a) * 120 * 0.9, CROWN_BOT)
    foot = (math.cos(a) * 300,            math.sin(a) * FEET_SPLAY_Z * 0.9,   FEET_Y)
    p40  = tuple(hip[i] + (foot[i] - hip[i]) * 0.40 for i in range(3))
    p70  = tuple(hip[i] + (foot[i] - hip[i]) * 0.70 for i in range(3))
    legs.append(rod("leg_u", 26, hip, p40, SEG_LEG))
    legs.append(rod("leg_m", 19, p40, p70, SEG_LEG))
    legs.append(rod("leg_l", 13, p70, foot, SEG_LEG))
    legs.append(cyl("coll_a", 24, 42, p40, SEG_LEG, 'Z'))
    legs.append(cyl("coll_b", 17, 36, p70, SEG_LEG, 'Z'))
    bpy.ops.mesh.primitive_cone_add(vertices=SEG_LEG, radius1=11, radius2=3, depth=40,
        location=(foot[0], foot[1], FEET_Y + 26), rotation=(math.pi, 0, 0))
    ft = bpy.context.object; ft.name = "foot"; legs.append(ft)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=8,
        location=(foot[0], foot[1], FEET_Y + 2))
    bt = bpy.context.object; bt.name = "balltip"; legs.append(bt)
# spreader brace: three bars from the column to each leg at BRACE_Y
tbr = (BRACE_Y - CROWN_BOT) / (FEET_Y - CROWN_BOT)
for az in (210, 330, 90):
    a = math.radians(az)
    hip  = (math.cos(a) * (CROWN_R - 45), math.sin(a) * (CROWN_R - 45) * 0.9, CROWN_BOT)
    foot = (math.cos(a) * 300,            math.sin(a) * FEET_SPLAY_Z * 0.9,   FEET_Y)
    onleg = tuple(hip[i] + (foot[i] - hip[i]) * tbr for i in range(3))
    legs.append(rod("brace", 7, (0, 0, BRACE_Y), onleg, 8))
legs.append(cyl("column", 26, (CROWN_BOT - BRACE_Y) + 60, (0, 0, (CROWN_BOT + BRACE_Y) / 2), SEG_LEG, 'Z'))
tripod = join([crown] + legs, "tripod")
set_origin(tripod, (0, (CROWN_TOP + CROWN_BOT) / 2, 0))

# ── material ─────────────────────────────────────────────────────────────────
mat = bpy.data.materials.new("cam"); mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0x30/255, 0x30/255, 0x40/255, 1)
bsdf.inputs["Metallic"].default_value = 0.7
bsdf.inputs["Roughness"].default_value = 0.42
for i, o in enumerate([camera_body, reel_a, reel_b, lens, crank, head, tripod]):
    m = mat.copy(); m.name = f"cam_{o.name}"
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.38 + (i % 4) * 0.02
    o.data.materials.clear(); o.data.materials.append(m)

# ── export ───────────────────────────────────────────────────────────────────
# ── bounds audit: every part's blender-y (depth) range, so a part sitting in
# front of the lens (y < -240) is caught at BUILD time, not in the site ──
print("AUDIT depth ranges (blender y; lens occupies -150..-294):")
for o in [camera_body, reel_a, reel_b, lens, crank, head, tripod]:
    ys = [ (o.matrix_world @ v.co).y for v in o.data.vertices ]
    flag = "  <-- IN FRONT OF LENS PLANE" if min(ys) < -244 and o.name != "lens" else ""
    print(f"  {o.name:12} y {min(ys):8.1f} .. {max(ys):8.1f}{flag}")

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/camera.glb"
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True)
tris = sum(len(o.data.polygons) * 2 for o in [camera_body, reel_a, reel_b, lens, crank, head, tripod])
print(f"BUILD OK -> {out}  (~{tris} tris rough estimate)")
