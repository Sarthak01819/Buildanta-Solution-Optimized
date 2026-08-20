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

# ── MEASURED off art-source/market-cinema-camera-front.png (785x1511, so
#    model x = px - 341.5, model y = 467 - py). Re-derived 20 Aug by circle
#    fit + alpha-threshold silhouette scan; several constants that had been
#    inherited as "measured" were simply wrong. Do not invent — measure.
LENS_R_FLANGE  = 117.0     # bright chamfer spike at r116-117
LENS_R_GROOVE  = 106.0     # turned groove r104-108
LENS_R_STEP    = 96.0      # step r81-88 -> annulus, outer face
LENS_R_RETAIN  = 71.5      # bright retaining ring r71-73
LENS_R_BORE    = 66.0      # dark bore r60-70
LENS_DOME_R    = 60.0      # glass silhouette r=60
REEL_X, REEL_Y = 180.0, 319.5   # CONTRACT anchors — never move (see note below)
REEL_R         = 138.0     # circle fit R=139.0
REEL_WEB_R     = 131.0     # flat web to r131, then the groove
REEL_CUT_R, REEL_CUT_ON = 35.0, 83.0   # windows r35 on pitch radius 82.8
HUB_R, HUB_HOLE_R, HUB_HOLE_ON = 35.0, 5.5, 21.0
BODY_X, BODY_TOP, BODY_BOT = 214.0, 165.0, -152.0
PANEL_W, PANEL_H = 396.0, 287.0        # outer recessed panel
PANEL_CX, PANEL_CY = -2.0, 7.5
PLATE_W, PLATE_H = 260.0, 251.0        # nested raised plate
PLATE_CY = 5.5
KNOB_X, KNOB_Y = 221.0, 6.5            # flange face x; dial builds OUTWARD
KNOB_R = 56.0
CRANK_X, CRANK_Y = 259.0, -170.6       # CONTRACT anchor
HEAD_TOP, HEAD_BOT = -202.0, -256.0
CROWN_TOP, CROWN_BOT = -343.0, -403.0
FEET_Y   = -958.0
BRACE_Y  = -605.0

# ⚠️ ON RECORD, deliberately NOT applied: the reference's reel centre fits at
# y ~ +308.5 by two independent estimators, against our contractual anchor at
# +319.5. The anchor stays — the reel SPINS about that node, so moving the
# geometry off it would make the wheel wobble. Silhouette fidelity loses to
# the animation contract here, on purpose.

# ── CHOSEN (depth: the elevation carries no Z — tune freely) ─────────────────
BODY_DEPTH           = 300.0
REEL_THICK           = 26.0
REEL_SETBACK         = 40.0     # from body front
LENS_PROTRUDE        = 90.0
VIEWFINDER_PROTRUDE  = 106.0
FEET_SPLAY_Z         = 300.0

# ── TOPOLOGY ────────────────────────────────────────────────────────────────
# ⚠️ Every count must keep its facet angle BELOW the runtime's 18deg crease
# threshold, or the part renders faceted and loses its specular sweep.
SEG_REEL, SEG_CUT, SEG_HOLE = 64, 32, 24
SEG_LENS, SEG_KNOB, SEG_LEG = 64, 32, 32
# ⚠️ ONE segment, not two. A 2-segment bevel splits a 90deg edge into facets
# 30deg apart, and ANY crease threshold above that smooths all three into a
# continuous soft roll — which is what made every panel, ring and window on
# this machine read as a rounded blob. A 1-segment bevel is a single 45deg
# chamfer: both its edges stay sharp at any sane threshold, so it renders as
# the hairline bright line the reference shows on every shoulder. It also
# halves every bevel's triangles.
BODY_BEVEL_SEG       = 1

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
    o.data.materials.append(MAT_BASE)
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
    o.data.materials.append(MAT_BASE)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(rotation=True)
    return o

def ring(name, R, tube, at, seg_major, seg_minor=24):   # 15deg facets: smooth under the 18deg crease
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=tube,
        major_segments=seg_major, minor_segments=seg_minor, location=at,
        rotation=(math.pi/2, 0, 0))
    o = bpy.context.object; o.name = name
    o.data.materials.append(MAT_BASE)
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
    o.data.materials.append(MAT_BASE)
    o.scale = (sx / 2, sy / 2, sz / 2)
    bpy.ops.object.transform_apply(scale=True)
    return o

def knurl(name, r, depth, at, axis, seg=SEG_KNOB):
    """A dial that reads MACHINED: body cylinder + two edge rings + a proud
    cap. The reference's side hardware is all knurled dials — plain cylinders
    are what made the old build look like a toy (Yash, 23:23)."""
    #  spec 20 Aug: '24 vertical flats, not smooth cylinders'. The flats are
    #  GEOMETRY — 24 rib bars around the barrel — because the runtime smooths
    #  any facet under 40deg, so a faceted cylinder would render as a smooth
    #  tube. Ribs carry the WEAR slot: ridges are where hands polish metal.
    parts = [cyl(name, r - 1.5, depth, at, seg, axis)]
    for i in range(24):
        a = i * math.pi / 12
        ra = list(at)
        # ⚠️ ribs must get their rotation AT CREATION and never a post-hoc
        # transform_apply: box() bakes location into the mesh, so applying a
        # rotation afterwards spins the rib about the WORLD origin and flings
        # it ~300mm (found when the head audit read y ±300). join() bakes
        # matrix_world, so an unapplied object rotation is perfectly safe.
        if axis == 'X':
            ra[1] += math.cos(a) * (r - 1); ra[2] += math.sin(a) * (r - 1)
            dims, rot = (depth - 6, 3.2, 3.2), (a, 0, 0)
        else:
            ra[0] += math.cos(a) * (r - 1); ra[2] += math.sin(a) * (r - 1)
            dims, rot = (3.2, depth - 6, 3.2), (0, a, 0)
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.mesh.primitive_cube_add(size=2, location=tuple(ra), rotation=rot)
        rib = bpy.context.object; rib.name = name + "_rib"
        rib.data.materials.append(MAT_BASE)
        rib.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
        parts.append(tag_wear(rib))
    capat = list(at)
    if axis == 'X': capat[0] += depth / 2 + 2
    elif axis == 'Y': capat[1] += depth / 2 + 2
    else: capat[2] += depth / 2 + 2
    parts.append(cyl(name + "_cap", r * 0.44, 10, tuple(capat), 16, axis))
    return join(parts, name)

def bevel(o, width=1.6, segs=BODY_BEVEL_SEG):
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

# ── materials (spec 20 Aug: wear is a SLOT, assigned per-part before join —
# join preserves slots, glTF splits primitives by material, and the runtime
# brightens every "wear" primitive: reel rims, knob ridges, crank grip, leg
# collars. Parts created by helpers get MAT_BASE so joins stay deterministic. */
MAT_BASE = bpy.data.materials.new("cam_base")
MAT_WEAR = bpy.data.materials.new("cam_wear")

def tag_wear(o):
    o.data.materials.clear()
    o.data.materials.append(MAT_WEAR)
    return o

# ── 1 · body: a two-level bolted front, a tapered top plate ─────────────────
body = box("body", BODY_X * 2, BODY_DEPTH, BODY_TOP - BODY_BOT,
           B(0, (BODY_TOP + BODY_BOT) / 2, 0)); bevel(body, 4, 1)
# outer recessed panel (396x287, 8mm deep) with its own four screw wells,
# then a nested plate standing 10mm proud carrying four more: the reference
# has EIGHT screws on two levels, not four on one.
recess = box("recess_cut", PANEL_W, 16, PANEL_H, (PANEL_CX, FRONT, PANEL_CY))
cut(body, recess)                       # recess floor at FRONT + 8
plate = box("plate", PLATE_W, 10, PLATE_H, (0, FRONT - 3, PLATE_CY))
screws = []
for wx, wz, host, wy in [(-116, 113, "p", FRONT - 6), (116, 113, "p", FRONT - 6),
                         (-116, -99, "p", FRONT - 6), (116, -99, "p", FRONT - 6),
                         (-171, 139, "b", FRONT + 2), (171, 139, "b", FRONT + 2),
                         (-171, -117, "b", FRONT + 2), (171, -117, "b", FRONT + 2)]:
    target = plate if host == "p" else body
    cut(target, cyl("well_cut", 6.5, 12, (wx, wy - 3, wz), 16, 'Y'))
    screws.append(cyl("screw", 5.5, 5, (wx, wy - 1, wz), 12, 'Y'))
# top plate is TAPERED in three steps (measured 516 -> 452 -> 392 wide)
bracket = [box("br_a", 516, 70, 14, B(0, 190, 0)),
           box("br_b", 452, 70, 10, B(0, 178, 0)),
           box("br_c", 392, 70, 14, B(0, 166, 0))]
body_parts = [body, plate] + screws + bracket

# ── 2 · lens: the measured radial profile ───────────────────────────────────
# flange r117 with a turned groove at r106, a step to r96, a taper to the
# retaining ring r71.5, then the bore r66 and the glass at r60.
LP0 = FRONT - 2                        # the new plate face
lens_parts = [
    cyl("l_flange", LENS_R_FLANGE, 20, (0, LP0 - 10, 0), SEG_LENS, 'Y'),
    cyl("l_step",   LENS_R_STEP,   16, (0, LP0 - 28, 0), SEG_LENS, 'Y'),
]
cut(lens_parts[0], ring("l_gr_cut", LENS_R_GROOVE, 3.0, (0, LP0 - 18.5, 0), 48, 24))
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.mesh.primitive_cone_add(vertices=SEG_LENS, radius1=LENS_R_STEP, radius2=72,
    depth=34, location=(0, LP0 - 53, 0), rotation=(math.pi / 2, 0, 0))
taper = bpy.context.object; taper.name = "l_taper"
taper.data.materials.append(MAT_BASE)
bpy.ops.object.transform_apply(rotation=True)
lens_parts += [
    taper,
    tag_wear(ring("l_retain", LENS_R_RETAIN, 3.5, (0, LP0 - 70, 0), 48, 24)),
]
# ⚠️ the bore must be a TUBE, not a plug: it was a solid cylinder, so the
# iris built inside it was buried and all you saw was the plug's front face
bore = cyl("l_bore", LENS_R_BORE, 34, (0, LP0 - 86, 0), SEG_LENS, 'Y')
cut(bore, cyl("bore_hollow", LENS_R_BORE - 2.5, 60, (0, LP0 - 86, 0), SEG_LENS, 'Y'))
lens_parts.append(bore)
BARREL_FRONT = LP0 - 88

# ── THE IRIS (Yash, 10:46: "the lens does not look real") ───────────────────
# A real aperture, not a ball in a hole. NINE blades, each a thin plate that
# is a full disc MINUS a circular bite: plate_k = disc(IRIS_R) - cyl(ARC_R at
# distance ARC_D, angle k*40deg). Stacked at descending z, the topmost blade
# hides all but its own bite, the next shows through that, and so on — which
# is exactly how a real iris reads: a pinwheel of arc edges spiralling into
# the pupil. The pupil is where EVERY blade is absent, so its inradius falls
# out of the geometry as ARC_D - ARC_R; no separate hole is modelled.
IRIS_R      = 63.0
# ⚠️ The bite must CONTAIN the axis. With ARC_R < ARC_D every blade covered
# the centre and the iris closed completely — a pinwheel with no pupil. The
# pupil inradius is ARC_R - ARC_D, so the bite reaches 9mm past the axis.
# Bite centre sits OUTSIDE the iris (69 > 63) so each blade's leading arc
# sweeps right across the face instead of curling up near the axis — that
# broad sweep is what makes a real iris read. Pupil is unchanged: it is
# always ARC_R - ARC_D.
ARC_R       = 78.0
ARC_D       = 69.0            # pupil inradius = 78 - 69 = 9mm (14% of iris dia)
BLADE_T     = 0.9
BLADE_STEP  = 0.5             # z pitch: enough to beat z-fighting at 13x
IRIS_FRONT  = BARREL_FRONT + 14
blades = []
for k in range(9):
    a = k * 2 * math.pi / 9 + math.radians(12)
    zy = IRIS_FRONT + k * BLADE_STEP           # blender y = depth
    plate = cyl("iris_blade", IRIS_R, BLADE_T, (0, zy, 0), SEG_LENS, 'Y')
    # ⚠️ NO per-blade tilt. join() bakes the FIRST part's transform as the
    # merged mesh's frame, so tilting blade 0 tilted the space the runtime's
    # pinwheel shader measures its angle in — the sector convergence drifted
    # off the pupil. Blades stay coplanar; the stack's z-step gives the
    # overlap read instead.
    bite = cyl("bite", ARC_R, BLADE_T * 6,
               (math.cos(a) * ARC_D, zy, math.sin(a) * ARC_D), 48, 'Y')
    cut(plate, bite)
    blades.append(tag_wear(plate) if k % 3 == 0 else plate)
iris = join(blades, "iris_blades")

# the tunnel behind the pupil — without it the pupil reads as a black DISC
# rather than a hole with depth
tunnel = cyl("iris_tunnel", 11.0, 120, (0, IRIS_FRONT + 66, 0), 32, 'Y')

# the front element: a shallow spherical CAP, not a marble. A large-radius
# sphere clipped by the bore gives a gently domed glass cover whose apex
# stands only 6mm proud — the reference's glass is nearly flat and reads by
# its specular sweep, not by its bulge.
GLASS_R = 190.0
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.mesh.primitive_uv_sphere_add(segments=SEG_LENS, ring_count=48,
    radius=GLASS_R, location=(0, BARREL_FRONT + 6 + GLASS_R, 0))
dome = bpy.context.object; dome.name = "l_glass"
dome.data.materials.append(MAT_BASE)
cut(dome, cyl("glass_trim", IRIS_R + 3, GLASS_R * 3,
              (0, BARREL_FRONT + 6 + GLASS_R + GLASS_R, 0), SEG_LENS, 'Y'))
lens_parts.append(tunnel)
lens = join(lens_parts, "lens")
set_origin(lens, (0, 0, 0))
bpy.ops.object.select_all(action='DESELECT')
dome.select_set(True); iris.select_set(True); lens.select_set(True)
bpy.context.view_layer.objects.active = lens
bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)

# ── 3 · reels: flat web, hard groove, PROUD rim band ────────────────────────
def build_reel(name, mx):
    ry = FRONT + REEL_SETBACK + REEL_THICK / 2
    # the web is thinner than the rim, so the rim stands proud on both faces —
    # the old torus lip sat BELOW the web and read as a dent
    disc = cyl(name + "_disc", REEL_WEB_R, REEL_THICK - 6, (mx, ry, REEL_Y), SEG_REEL, 'Y')
    rim = cyl(name + "_rim", REEL_R, REEL_THICK, (mx, ry, REEL_Y), SEG_REEL, 'Y')
    cut(rim, cyl("rimbore", REEL_WEB_R, REEL_THICK * 3, (mx, ry, REEL_Y), SEG_REEL, 'Y'))
    tag_wear(rim)
    for k in range(5):
        a = k * 2 * math.pi / 5 + math.radians(89.5)   # one window at 12 o'clock
        c = cyl("c", REEL_CUT_R, REEL_THICK * 2,
                (mx + math.cos(a) * REEL_CUT_ON, ry, REEL_Y + math.sin(a) * REEL_CUT_ON),
                SEG_CUT, 'Y')
        cut(disc, c)
    hub = cyl(name + "_hub", HUB_R, REEL_THICK + 12, (mx, ry, REEL_Y), 48, 'Y')
    # SEVEN BLIND pockets (six on a ring + one dead centre), front face only —
    # the reference is opaque behind every one of them
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 6
        cut(hub, cyl("hp", HUB_HOLE_R, 16,
                     (mx + math.cos(a) * HUB_HOLE_ON, ry - (REEL_THICK + 12) / 2,
                      REEL_Y + math.sin(a) * HUB_HOLE_ON), SEG_HOLE, 'Y'))
    cut(hub, cyl("hp", HUB_HOLE_R, 16, (mx, ry - (REEL_THICK + 12) / 2, REEL_Y), SEG_HOLE, 'Y'))
    reel = join([disc, rim, hub], name)
    set_origin(reel, (mx, REEL_Y, 0))
    return reel

reel_a = build_reel("reel_a", -REEL_X)
reel_b = build_reel("reel_b",  REEL_X)

# ── 4 · magazine between the reels ──────────────────────────────────────────
mag = box("magazine", 112, REEL_THICK + 26, 122, B(0, 251, 0))
mag.location.y = FRONT + REEL_SETBACK + REEL_THICK / 2
mag_in = box("mag_in", 92, REEL_THICK + 34, 105, B(0, 253, 0))
mag_in.location.y = FRONT + REEL_SETBACK + REEL_THICK / 2
cut(mag_in, box("mag_slot", 27, 20, 72, (0, FRONT + REEL_SETBACK - 12, 237)))
mag_bolts = [cyl("mag_bolt", 6, 8, (sx * 39, FRONT + REEL_SETBACK - 6, 297), 12, 'Y')
             for sx in (-1, 1)]

# ── 5 · viewfinder: a HORIZONTAL horn on the body flank ─────────────────────
# was at y +237, which put it between the reels reading as a fin; measured
# axis is y = +112.5, on the body itself
VF_Y = 112.5
vf_parts = [
    cyl("vf_collar", 24, 10, (-221, 0, VF_Y), SEG_KNOB, 'X'),
    cyl("vf_barrel1", 19.5, 30, (-238, 0, VF_Y), SEG_KNOB, 'X'),
    cyl("vf_barrel2", 23, 50, (-277, 0, VF_Y), SEG_KNOB, 'X'),
]
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.mesh.primitive_cone_add(vertices=SEG_KNOB, radius1=46, radius2=23, depth=20,
    location=(-311, 0, VF_Y), rotation=(0, math.pi / 2, 0))
bell = bpy.context.object; bell.name = "vf_bell"
bell.data.materials.append(MAT_BASE)
bpy.ops.object.transform_apply(rotation=True)
vf_parts.append(bell)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.mesh.primitive_torus_add(major_radius=45, minor_radius=3, major_segments=32,
    minor_segments=24, location=(-320, 0, VF_Y), rotation=(0, math.pi / 2, 0))
vf_lip = bpy.context.object; vf_lip.name = "vf_lip"
vf_lip.data.materials.append(MAT_BASE)
bpy.ops.object.transform_apply(rotation=True)
vf_parts.append(tag_wear(vf_lip))
vf = join(vf_parts, "viewfinder")

# ── 6 · side hardware — ASYMMETRIC, as measured ─────────────────────────────
knobs = []
for sx in (-1, 1):
    knobs += [
        cyl("kn_flange", 60.5, 12, (sx * 221, 0, KNOB_Y), 32, 'X'),
        cyl("kn_drum", KNOB_R, 22, (sx * 238, 0, KNOB_Y), 32, 'X'),
        cyl("kn_neck", 33.0, 14, (sx * 263, 0, KNOB_Y), 24, 'X'),
        knurl("kn_ring", 45.0, 18, (sx * 278, 0, KNOB_Y), 'X'),
    ]
knobs.append(knurl("knob2", 19.5, 42, (-237, 0, -87.5), 'X'))     # left lower dial
knobs.append(cyl("stud2", 13, 24, (227, 0, -78), 16, 'X'))        # right lower stud
knobs.append(cyl("stub_neck", 14, 22, (227, 0, 109), 16, 'X'))    # right upper only
knobs.append(cyl("stub_cap", 22.5, 24, (250, 0, 109), 24, 'X'))

# ── 7 · pedestal: three tiers under the body ────────────────────────────────
ped = [box("ped_a", 310, 200, 18, B(-9, -161, 0)),
       box("ped_b", 218, 190, 16, B(0, -178, 0)),
       box("ped_c", 186, 180, 16, B(0, -194, 0))]
for t in ped: bevel(t, 3, 1)

camera_body = join(body_parts + [mag, mag_in] + mag_bolts + [vf] + knobs + ped, "camera_body")
set_origin(camera_body, (0, 0, 0))

# ── 8 · crank: right, THEN down (the reference's L) ─────────────────────────
c_hub = cyl("c_hub", 13.5, 24, (227, 0, -125), 32, 'Y')
c_arm = rod("c_arm", 7, (238, 0, -125), (318, 0, -125), SEG_HOLE)
c_drop = rod("c_drop", 6.5, (318, 0, -125), (318, 0, -188), SEG_HOLE)
c_shaft = rod("c_shaft", 6, (318, 0, -188), (358, 0, -188), SEG_HOLE)
c_grip = tag_wear(cyl("c_grip", 15, 68, (392, 0, -188), SEG_HOLE, 'X'))
crank = join([c_hub, c_arm, c_drop, c_shaft, c_grip], "crank")
set_origin(crank, (CRANK_X, CRANK_Y, 0))

# ── 9 · head: housing, tilt knobs on stalks, a three-disc pivot boss ────────
h_mount = box("h_mount", 148, 180, HEAD_TOP - HEAD_BOT, B(0, (HEAD_TOP + HEAD_BOT) / 2, 0))
h_should = box("h_should", 184, 170, 32, B(0, -212, 0))
h_axle = cyl("h_axle", 12, 180, (0, 0, -235.5), SEG_HOLE, 'X')
head_parts = [h_mount, h_should, h_axle]
for sx in (-1, 1):
    head_parts += [
        cyl("h_stalk", 11, 46, (sx * 108, 0, -235.5), 16, 'X'),
        cyl("h_stalk_c", 15, 16, (sx * 132, 0, -235.5), 24, 'X'),
        knurl("h_knob", 32.0, 38, (sx * 155, 0, -235.5), 'X', seg=32),
    ]
head_parts += [
    cyl("h_boss_o", 58, 40, (0, 0, -285.6), 48, 'Y'),
    cyl("h_boss_m", 48, 52, (0, 0, -285.6), 48, 'Y'),
    tag_wear(cyl("h_boss_c", 27.5, 62, (0, 0, -285.6), 32, 'Y')),
    cyl("h_bolt", 13, 30, (-60, 0, -339), 16, 'Y'),
    cyl("h_bolt", 13, 30, (60, 0, -339), 16, 'Y'),
    cyl("h_stem", 63, 20, (0, 0, -337), 32, 'Z'),
]
head = join(head_parts, "head")
set_origin(head, (0, (HEAD_TOP + HEAD_BOT) / 2, 0))

# ── 10 · tripod: two crown discs, two-stage legs, a REAL spreader ───────────
crown_a = cyl("crown_a", 121, 29, (0, 0, -357.5), 48, 'Z')
crown_b = cyl("crown_b", 130, 31, (0, 0, -387.5), 48, 'Z')
legs = [crown_a, crown_b, cyl("underplate", 74, 16, (0, 0, -411), 32, 'Z')]
AZ = (210, 330, 270)          # the third leg points TOWARD camera, as measured
hips, feet = {}, {}
for az in AZ:
    a = math.radians(az)
    hip = (math.cos(a) * 110, math.sin(a) * 110 * 0.9, CROWN_BOT)
    foot = (math.cos(a) * 285, math.sin(a) * FEET_SPLAY_Z * 0.9, FEET_Y)
    hips[az], feet[az] = hip, foot
    p69 = tuple(hip[i] + (foot[i] - hip[i]) * 0.693 for i in range(3))
    legs.append(rod("leg_u", 25, hip, p69, SEG_LEG))
    legs.append(rod("leg_l", 19, p69, foot, SEG_LEG))
    # two stacked clamp bands at the joint
    legs.append(tag_wear(cyl("coll_a", 27, 34, (p69[0], p69[1], p69[2] + 20), SEG_LEG, 'Z')))
    legs.append(tag_wear(cyl("coll_b", 29, 42, (p69[0], p69[1], p69[2] - 18), SEG_LEG, 'Z')))
    # ferrule + rounded bullet foot
    legs.append(tag_wear(cyl("ferrule", 21, 14, (foot[0], foot[1], foot[2] + 20), SEG_LEG, 'Z')))
    legs.append(cyl("bullet", 13, 20, (foot[0], foot[1], foot[2] + 6), SEG_LEG, 'Z'))
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=13,
                                         location=(foot[0], foot[1], foot[2] - 4))
    tip = bpy.context.object; tip.name = "tip"
    tip.data.materials.append(MAT_BASE)
    legs.append(tag_wear(tip))

# THE SPREADER: clamp band + lug + arched bar per leg, and a centre clamp.
# None of this existed before — the model had a fake plain column instead.
for az in AZ:
    hip, foot = hips[az], feet[az]
    t = (BRACE_Y - hip[2]) / (foot[2] - hip[2])
    onleg = tuple(hip[i] + (foot[i] - hip[i]) * t for i in range(3))
    legs.append(tag_wear(cyl("sp_band", 30, 50, onleg, SEG_LEG, 'Z')))
    inward = math.atan2(-onleg[1], -onleg[0])
    lug = (onleg[0] + math.cos(inward) * 26, onleg[1] + math.sin(inward) * 26, onleg[2])
    legs.append(box("sp_lug", 22, 22, 26, lug))
    if az != 270:
        legs.append(rod("sp_bar", 7, lug, (0, 0, BRACE_Y - 5), 8))
legs.append(box("sp_hub", 79, 46, 52, (0, feet[270][1] * 0.0, BRACE_Y - 5)))
legs.append(box("sp_latch", 14, 6, 22, (0, -26, BRACE_Y - 3)))
tripod = join(legs, "tripod")
set_origin(tripod, (0, (CROWN_TOP + CROWN_BOT) / 2, 0))

# ── BEVEL EVERYTHING (spec 20 Aug) ───────────────────────────────────────────
# 'Unbevelled edges are the main reason the current build reads as fake.'
# One bevel modifier per FINAL node: 2mm, 2 segments, 40deg angle limit —
# catching every hard edge across each merged mesh, boolean cuts included
# (that is what chamfers the reel windows and the screw wells). Applied at
# export by export_apply=True; a modifier alone never leaves Blender.
# ⚠️ WIDTH IS PER PART, NOT GLOBAL. A single 2mm chamfer ate the reels: the
# webs between windows are only ~18mm wide, so 2mm x 2 edges x 2 segments
# rounded them into inflated cushions and turned the hub into a faceted
# star (measured against the reference, which keeps FLAT faces with a thin
# crisp chamfer line). Chamfer must stay small relative to the face it sits
# on: big body panels can carry 2.5mm, reel webs no more than 1mm.
for o, w in [(camera_body, 2.0), (reel_a, 1.6), (reel_b, 1.6), (lens, 1.6),
             (dome, 1.0), (iris, 0.25), (crank, 1.2), (head, 1.6), (tripod, 1.6)]:
    bevel(o, w, 1)

# ── material ─────────────────────────────────────────────────────────────────
# Base material per spec (the RUNTIME re-materials everything; these values
# are the honest fallback for anyone opening the GLB raw). The cam_wear slot
# survives untouched — the runtime brightens those primitives toward #4A4A62.
MAT_BASE.use_nodes = True
_b = MAT_BASE.node_tree.nodes["Principled BSDF"]
_b.inputs["Base Color"].default_value = (0x30/255, 0x30/255, 0x40/255, 1)
_b.inputs["Metallic"].default_value = 0.78
_b.inputs["Roughness"].default_value = 0.38
MAT_WEAR.use_nodes = True
_w = MAT_WEAR.node_tree.nodes["Principled BSDF"]
_w.inputs["Base Color"].default_value = (0x4A/255, 0x4A/255, 0x62/255, 1)
_w.inputs["Metallic"].default_value = 0.85
_w.inputs["Roughness"].default_value = 0.30

# ── export ───────────────────────────────────────────────────────────────────
# ── bounds audit: every part's blender-y (depth) range, so a part sitting in
# front of the lens (y < -240) is caught at BUILD time, not in the site ──
print("AUDIT depth ranges (blender y; lens occupies -150..-294):")
for o in [camera_body, reel_a, reel_b, lens, dome, crank, head, tripod]:
    ys = [ (o.matrix_world @ v.co).y for v in o.data.vertices ]
    # tripod is exempt: the reference's third leg points TOWARD camera, so it
    # legitimately crosses the lens plane far below the lens itself
    flag = "  <-- IN FRONT OF LENS PLANE" if min(ys) < -244 and o.name not in ("lens", "l_glass", "tripod") else ""
    print(f"  {o.name:12} y {min(ys):8.1f} .. {max(ys):8.1f}{flag}")

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/camera.glb"
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                          export_apply=True)   # ⚠️ without this, every bevel
                                               # modifier silently stays home
tris = sum(len(o.data.polygons) * 2 for o in [camera_body, reel_a, reel_b, lens, crank, head, tripod])
print(f"BUILD OK -> {out}  (~{tris} tris rough estimate)")
