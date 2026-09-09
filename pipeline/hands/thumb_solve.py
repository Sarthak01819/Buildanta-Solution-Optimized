"""thumb_solve.py -- solve the FIST THUMB numerically, on the evaluated skin.

The client note (9 Sep 2026): "thumbs rest on the index-finger nail so each
fist reads as a real fist". The old TH_FIST curled the thumb on one axis only,
which left it hanging BESIDE the curled index (16.5 mm green / 13.9 mm human,
measured). A real fist crosses the thumb over the OUTSIDE of the index and
rests the pad on the index nail (dorsal skin of DEF-f_index.03.L). That is a
3-axis CMC solve, so this script searches it instead of guessing angles:

  score = nail-contact term + over-the-nail term + orientation term
        + interpenetration penalty (BVH of the non-thumb skin + finger capsules)
        + joint-limit penalty
  search = random restarts x coordinate descent with shrinking steps
           + basin hops + Nelder-Mead polish  (numpy only; no scipy in Blender)

MEASURED FACT that shapes this file (9 Sep 2026, dbg on human_hand_1.glb):
the HUMAN rig's bones sit 25-65 mm away from its own skin (green: 3-8 mm, i.e.
inside the finger), by a per-joint-row offset, not a rigid shift. The finger
curls survive because every finger joint's X (curl) axis is parallel and the
offset is mostly along it; the thumb's axes are not, which is why the old
human thumb hooked upward. So NOTHING here uses a bone head/tail position:
nail and pad vertex SETS are classified once in the rest pose (facing / away
from the palm centroid) and tracked by index, and all axes are PCA of the
vertex groups. Bones only supply rotations.

Everything is measured on the evaluated skin (armature modifier) with the
SUBSURF modifier disabled for speed and a 1.5 mm cage allowance; the final
numbers are re-measured with subsurf ON, which is what ships.

PRODUCTION NOTE: zeroMirrorStage.prepareSourceFistBump() samples the GLB at
clip progress 0.75 (~f75). Round 1 copied the Hand_Green bone QUATERNIONS onto
BOTH source hands ("--joint" scored that transplant); it pivoted the human
thumb around the wrong points (its rig sits 25-65 mm off its skin) and made a
claw. Round 2 takes each hand's closing pose from ITS OWN rig in the GLB, so
each rig is solved in its own space and the transplant is only emulated on
request (--transplant).

ROUND 2 (9 Sep 2026) -- client on round 1: "Thumbs still look so weird, fix
upper part of the thumb and make it straight and align it to lower part of
the thumb so the whole thing doesn't look goofy." Round 1 hooked the IP to
58 deg to reach the nail. Now STRAIGHT wins: hard bounds IP 0..15 deg,
thumb.03 Y=Z=0, thumb.02 |Y|,|Z| <= 0.15 rad, MCP flexion <= 55 deg, plus a
strong term on the world-space angle between the .02 and .03 bone axes
("bend"). The .02-.03 rod must lie ACROSS the outside of the curled index and
middle fingers (perpendicular to their middle-phalanx axes, ulnar, tip toward
the knuckles); the pad-on-nail term is secondary. A face-intersection census
(BVH overlap: thumb.02 x thumb.03, thumb.01 x thumb.02, thumb x fingers/palm)
is scored and reported, not just vertex distances.

Usage (headless, from the repo root; always quote blender's path on Windows):
  blender -b --python pipeline/hands/thumb_solve.py -- --mode probe
  blender -b --python pipeline/hands/thumb_solve.py -- --mode solve --rig green --joint
  blender -b --python pipeline/hands/thumb_solve.py -- --mode solve --rig human
  blender -b --python pipeline/hands/thumb_solve.py -- --mode check \
      --green "x,y,z;x,y,z;x,y,z" [--human "x,y,z;x,y,z;x,y,z"]
  blender -b --python pipeline/hands/thumb_solve.py -- --mode final --frame 75
  blender -b --python pipeline/hands/thumb_solve.py -- --mode sweep --f0 56 --f1 80
  blender -b --python pipeline/hands/thumb_solve.py -- --mode geom --frame 75   (segment geometry in the hand frame)
  blender -b --python pipeline/hands/thumb_solve.py -- --mode tuck --frame 75   (finger PIP/DIP tightening probe)
Common: --out DIR (renders + json; default pipeline/hands/out/solve),
        --blend PATH (default out/newhands_site.blend), --frame N (default 100),
        --restarts N, --seed N, --norender, --wjoint F (weight of the transplant
        term in --joint, default 1.0)
"""
import bpy, sys, os, json, math, random, time
import numpy as np
from mathutils import Vector, Matrix, Euler, kdtree
from mathutils.bvhtree import BVHTree

_BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_BASE, "out")
def log(*a): print("[t]", *a, flush=True)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) else True
    return default
MODE = arg("--mode", "probe")
RIG = arg("--rig", "green")
JOINT = "--joint" in argv
NORENDER = "--norender" in argv
BLEND = arg("--blend", os.path.join(OUT, "newhands_site.blend"))
OUTDIR = arg("--out", os.path.join(OUT, "solve"))
FRAME = int(arg("--frame", 100))
RESTARTS = int(arg("--restarts", 12))
SEED = int(arg("--seed", 7))
WJOINT = float(arg("--wjoint", 1.0))
WOWN = float(arg("--wown", 1.0))      # weight of the primary rig's own score in --joint
DEBUG = "--debug" in argv
TRANSPLANT = "--transplant" in argv   # also emulate the round-1 green->human transplant in final/check
os.makedirs(OUTDIR, exist_ok=True)

MM = 1000.0
ALLOW = 0.0015          # subsurf shrinks the cage by up to ~1.5 mm: treat that as "touching"
NAIL_TARGET = 0.0021    # cage distance pad->nail to aim for (=> ~0.5..1.5 mm after subsurf)
DIGITS = ["f_index", "f_middle", "f_ring", "f_pinky"]
def fb(d, j): return "DEF-%s.0%d.L" % (d, j + 1)
def tb(j): return "DEF-thumb.0%d.L" % (j + 1)
HAND = "DEF-hand.L"
THUMB = [tb(j) for j in range(3)]
FINGERS = [fb(d, j) for d in DIGITS for j in range(3)]
RIGS = {"green": ("Hand_Green", "GreenHand"), "human": ("Hand_Human", "HumanHand")}
CLOSING = [HAND] + FINGERS + THUMB   # same set as isClosingBone(), parents first

# ── joint limits (rad). Flexion is measured along each rig's own flexion sign.
# Round 2: IP 0..15 deg (was 15..80), MCP flexion <= 55 deg, MCP side/twist
# <= 0.15 rad. Round 3: CMC total <= 75 deg (was 60: lifting the rod out
# from under the finger stack onto the index's outside needs the extra
# abduction; the client judges the look, not the CMC angle) and the CMC may
# EXTEND a little (x[0] >= -0.3) so the thumb MCP can rise to the knuckle
# plane. These are also HARD search bounds (LO/HI).
LIM = dict(cmc_total=math.radians(float(arg("--cmc", 75))), mcp_flex=math.radians(float(arg("--mcp", 55))),
           mcp_side=0.15, ip_lo=0.0, ip_hi=math.radians(15), cmc_ext=0.3)

# ── score weights (tuned by LOOKING at the renders; see the report in git log)
# ROUND 3 (9 Sep 2026, after the client chose the 45-deg roll): three judges
# agreed the round-2 thumb hung as a lobe UNDER the finger stack (thumb.02
# centroid 44 mm palmar of the knuckle plane, index.02 only 10-32 mm) with an
# air gap along the shaft, and that the rod must point AT the other fist. So:
#   pad    pad -> nearest INDEX skin (any index segment; the distal phalanx is
#          tucked with these finger tables, so index.03 alone was the wrong
#          target and dragged the tip to the bottom-back of the fist)
#   shaft  thumb.02 verts -> nearest index.01/.02 or middle.01/.02 skin: the
#          whole rod lies on the fingers, not just the pad (round-2 air gap)
#   fwd    rod . F >= 0.80 (was 0.35), down 0.25..0.45, ulnar >= 0.15, all in
#          an ORTHONORMAL hand frame (the old ulnar axis, index.01 -> pinky.01,
#          tilted 36 mm backward and 21 mm palmar, so "rod ulnar 0.6" partly
#          measured "rod backward")
#   behind thumb tip 6..11 mm behind the knuckle plane (was >= 4, landed 16)
#   nailout thumb nail faces radial (the camera side after the roll) >= 0.3
#   across only reported: with these loose middle phalanges (125 deg from F)
#          a rod perpendicular to them is a rod hanging DOWN, the round-2 look
# nail/lat/out (index.03 nail terms) are 0: reported only.
W = dict(pen=4.0e6, cap=6.0e6, nail=0.0, lat=0.0, out=0.0, pad=1.0e6, shaft=1.0e6, shaft1=0.0,
         ori_perp=0.0, ori_ulnar=0.0, lim=3000.0,
         straight=150.0, skin=0.0, across=0.0, fwd=800.0, rodulnar=300.0, down=800.0,
         behind=2.0e6, nailout=300.0, xsect=25.0)
# skin=0: the .03 skin PCA axis is too noisy on a short bulbous segment (reported only)
NAIL_CAP = 0.020
FWD_TARGET = float(arg("--fwd", 0.80))          # rod . F(palm->knuckles) at least this (tip toward the other fist)
ULNAR_TARGET = float(arg("--ulnar", 0.55))      # thumb.03 axis . ulnar at least this (reported only, weight 0)
RODULNAR_TARGET = float(arg("--rodulnar", 0.15)) # whole rod . ulnar at least this (leans onto the fingers, not away)
ACROSS_HI = float(arg("--across", 0.45))        # reported unless W['across'] > 0
DOWN_LO, DOWN_HI = float(arg("--downlo", 0.25)), float(arg("--downhi", 0.45))  # rod . palmar: slightly down, never dorsal
BEHIND_MM = float(arg("--behind", 6.0))         # thumb tip at least this far behind the knuckle contact plane
BEHIND_HI_MM = float(arg("--behindhi", 11.0))   # ... and at most this far (tip just under the knuckle contact line)
NAILOUT_TARGET = float(arg("--nailout", 0.3))   # thumb nail . radial at least this (nail toward the camera)
SHAFT_TARGET = float(arg("--shaft", 2.1)) / MM  # cage distance thumb.02 shaft -> index/middle skin to aim for
if arg("--w"):                                  # e.g. --w nail=2.5e5,down=400  (weight overrides for experiments)
    for kv in str(arg("--w")).split(","):
        k, v = kv.split("="); W[k] = float(v)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene

# ───────────────────────────── helpers ─────────────────────────────────────
def set_frame(f):
    scene.frame_set(f)
    bpy.context.view_layer.update()

def freeze():
    """Bake the current frame's pose and drop the animation so manual bone
    edits are not overwritten by the f-curves on the next update."""
    for an, mn in RIGS.values():
        arm = bpy.data.objects[an]
        if arm.animation_data:
            vals = {pb.name: (pb.location.copy(), pb.rotation_euler.copy(), pb.scale.copy())
                    for pb in arm.pose.bones}
            mw = arm.matrix_world.copy()
            arm.animation_data_clear()
            arm.matrix_world = mw
            for pb in arm.pose.bones:
                l, r, s = vals[pb.name]
                pb.location, pb.rotation_euler, pb.scale = l, r, s
    bpy.context.view_layer.update()

def subsurf(on):
    for _, mn in RIGS.values():
        for m in bpy.data.objects[mn].modifiers:
            if m.type == "SUBSURF":
                m.show_viewport = on; m.show_render = on
    bpy.context.view_layer.update()

def eval_mesh(ob, with_polys=False, groups=None):
    """World-space evaluated vertices (numpy Nx3) [+ polygon index lists]
    [+ {name: per-vertex weight} for the vertex-group name prefixes in `groups`].
    The evaluated mesh keeps interpolated deform weights through subsurf, so
    this works on the subdivided skin too (measured: all 17.5k verts carry them)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    n = len(me.vertices)
    buf = np.empty(n * 3, dtype=np.float32)
    me.vertices.foreach_get("co", buf)
    P = buf.reshape(-1, 3).astype(np.float64)
    M = np.array(ev.matrix_world, dtype=np.float64)
    P = P @ M[:3, :3].T + M[:3, 3]
    out = [P]
    if with_polys:
        ls = np.empty(len(me.polygons), dtype=np.int32); lt = np.empty(len(me.polygons), dtype=np.int32)
        me.polygons.foreach_get("loop_start", ls); me.polygons.foreach_get("loop_total", lt)
        li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", li)
        out.append([tuple(int(x) for x in li[s_:s_ + t]) for s_, t in zip(ls, lt)])
    if groups is not None:
        idx = {name: {vg.index for vg in ob.vertex_groups if vg.name.startswith(name)} for name in groups}
        W_ = {name: np.zeros(n) for name in groups}
        for v in me.vertices:
            for g in v.groups:
                for name, ids in idx.items():
                    if g.group in ids: W_[name][v.index] += g.weight
        out.append(W_)
    ev.to_mesh_clear()
    return out[0] if len(out) == 1 else tuple(out)

def weights(ob, prefixes):
    idx = {vg.index for vg in ob.vertex_groups if any(vg.name.startswith(p) for p in prefixes)}
    w = np.zeros(len(ob.data.vertices))
    for v in ob.data.vertices:
        w[v.index] = sum(g.weight for g in v.groups if g.group in idx)
    return w

def unit(v):
    v = np.asarray(v, dtype=np.float64); n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v
def perp(v, axis):
    v = np.asarray(v, dtype=np.float64); return v - axis * np.dot(v, axis)
def seg_dist(P, A, B):
    AB = B - A; L2 = float(np.dot(AB, AB))
    t = np.clip(((P - A) @ AB) / max(L2, 1e-12), 0.0, 1.0)
    return np.linalg.norm(P - (A + t[:, None] * AB), axis=1)
def pca_axis(Q, toward):
    """Principal axis of a vertex cloud, signed to point along `toward`."""
    c = Q.mean(axis=0); _, _, vt = np.linalg.svd(Q - c, full_matrices=False)
    a = vt[0]; return a if np.dot(a, toward) >= 0 else -a

def euler_of(arm, bn): return tuple(round(float(v), 4) for v in arm.pose.bones[bn].rotation_euler)
def parse_triples(s):
    return [tuple(float(x) for x in t.split(",")) for t in s.split(";")]
def bone_axis(arm, bn):
    """World-space direction of a pose bone (its local +Y), unit numpy."""
    return unit(np.array(arm.matrix_world.to_3x3() @ arm.pose.bones[bn].y_axis, dtype=np.float64))
def angle_deg(a, b):
    return math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(unit(a), unit(b)))))))
def group_polys(polys, w, thr=0.5):
    """Faces whose every vertex carries weight > thr in `w`."""
    return [p for p in polys if all(w[i] > thr for i in p)]
def census(V, polys_a, polys_b):
    """Face-intersection census: number of (a, b) face pairs that geometrically
    intersect (BVHTree.overlap), ignoring pairs that share a vertex. The two
    sets are built from disjoint weight>0.5 groups, so a reported pair is a
    real self-fold / penetration, not a shared edge."""
    if not polys_a or not polys_b: return 0
    ba = BVHTree.FromPolygons(V, polys_a, all_triangles=False)
    bb = BVHTree.FromPolygons(V, polys_b, all_triangles=False)
    n = 0
    for ia, ib in ba.overlap(bb):
        if set(polys_a[ia]).isdisjoint(polys_b[ib]): n += 1
    return n

def with_rest_pose(arm, fn):
    """Run fn() with every bone's rotation zeroed (scale/location untouched)."""
    saved = {pb.name: pb.rotation_euler.copy() for pb in arm.pose.bones}
    for pb in arm.pose.bones: pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    try: return fn()
    finally:
        for pb in arm.pose.bones: pb.rotation_euler = saved[pb.name]
        bpy.context.view_layer.update()

def transplant(dst, src, bones):
    """Emulate zeroMirrorStage.setFistBonePose(amount=1): for each bone NAME the
    destination bone takes the source bone's PARENT-RELATIVE ROTATION (the glTF
    node quaternion = rotation of parent.matrix^-1 @ bone.matrix); its own
    position/scale are kept. Parents first; update between bones."""
    for bn in bones:
        sp = src.pose.bones[bn]; dp = dst.pose.bones[bn]
        sl = (sp.parent.matrix.inverted() @ sp.matrix) if sp.parent else sp.matrix
        dl = (dp.parent.matrix.inverted() @ dp.matrix) if dp.parent else dp.matrix
        R = sl.to_quaternion().to_matrix().to_4x4()
        S = Matrix.Diagonal(dl.to_scale()).to_4x4()
        new_local = Matrix.Translation(dl.translation) @ R @ S
        dp.matrix = (dp.parent.matrix @ new_local) if dp.parent else new_local
        bpy.context.view_layer.update()

# ───────────────────────────── the rig model ───────────────────────────────
class Rig:
    def __init__(self, key, tag=None):
        self.key = key; self.tag = tag or key
        an, mn = RIGS[key]
        self.arm = bpy.data.objects[an]; self.ob = bpy.data.objects[mn]
        me = self.ob.data
        self.polys = [tuple(p.vertices) for p in me.polygons]
        self.w_thumb = weights(self.ob, ["DEF-thumb"])
        self.w_t = [weights(self.ob, [tb(j)]) for j in range(3)]
        self.w_idx = [weights(self.ob, [fb("f_index", j)]) for j in range(3)]
        self.grp = {bn: np.where(weights(self.ob, [bn]) > 0.5)[0] for bn in FINGERS + THUMB}
        self.palm_idx = np.where(weights(self.ob, ["DEF-palm", HAND]) > 0.5)[0]
        self.seg_idx = [np.where(self.w_t[j] > 0.5)[0] for j in range(3)]
        # verts tested for collisions: the two distal thumb segments. The
        # metacarpal/thenar is excluded: it is a soft blend into the palm and,
        # sitting inside the hole the thumb leaves in the static skin, it only
        # produces false "inside" readings (measured: 20 mm phantom depths)
        self.test_idx = np.where((self.w_t[1] > 0.5) | (self.w_t[2] > 0.5))[0]
        self.static_polys = [p for p in self.polys if all(self.w_thumb[i] <= 0.5 for i in p)]
        self.idx3_polys = [p for p in self.polys if all(self.w_idx[2][i] > 0.5 for i in p)]
        self.seg_polys = [group_polys(self.polys, self.w_t[j]) for j in range(3)]
        self.flex_sign = self.measure_flex_sign()
        self.rest_bend = with_rest_pose(self.arm, lambda: angle_deg(bone_axis(self.arm, tb(1)), bone_axis(self.arm, tb(2))))
        self.classify_rest()
        self.refresh()

    GROUPS = ("DEF-thumb", tb(0), tb(1), tb(2),
              fb("f_index", 0), fb("f_index", 1), fb("f_index", 2),
              fb("f_middle", 0), fb("f_middle", 1), fb("f_middle", 2), "DEF-palm", HAND)

    def measure_flex_sign(self):
        """Which sign of a thumb.02 X rotation FLEXES (moves thumb.03 toward the
        palm centroid)? A property of the bone's rest roll, measured in rest
        space so it is right even after a transplant rewrote the eulers."""
        def go():
            pb = self.arm.pose.bones[tb(1)]
            P = eval_mesh(self.ob); palm_c = P[self.palm_idx].mean(axis=0)
            d0 = np.linalg.norm(P[self.seg_idx[2]].mean(axis=0) - palm_c)
            pb.rotation_euler = (0.5, 0.0, 0.0); bpy.context.view_layer.update()
            P = eval_mesh(self.ob)
            d1 = np.linalg.norm(P[self.seg_idx[2]].mean(axis=0) - palm_c)
            pb.rotation_euler = (0.0, 0.0, 0.0); bpy.context.view_layer.update()
            return 1.0 if d1 < d0 else -1.0
        return with_rest_pose(self.arm, go)

    @staticmethod
    def classify(P, W_):
        """Rest-pose vertex SETS on any skin level (cage or subdivided): thumb
        pad = palmar side of thumb.03 (facing the palm centroid); index nail =
        dorsal side of index.03 (facing away from it)."""
        palm_idx = np.where(W_["DEF-palm"] + W_[HAND] > 0.5)[0]
        palm_c = P[palm_idx].mean(axis=0)
        t3 = np.where(W_[tb(2)] > 0.5)[0]; t2 = np.where(W_[tb(1)] > 0.5)[0]
        c3 = P[t3].mean(axis=0); a3 = pca_axis(P[t3], c3 - P[t2].mean(axis=0))
        rad = (P[t3] - c3) - np.outer((P[t3] - c3) @ a3, a3)
        face = unit(perp(palm_c - c3, a3))
        along = (P[t3] - c3) @ a3
        pad = t3[(rad @ face > 0.15 * np.linalg.norm(rad, axis=1).max()) & (along > -0.3 * np.abs(along).max())]
        i3 = np.where(W_[fb("f_index", 2)] > 0.5)[0]; i2 = np.where(W_[fb("f_index", 1)] > 0.5)[0]
        ci = P[i3].mean(axis=0); ai = pca_axis(P[i3], ci - P[i2].mean(axis=0))
        radi = (P[i3] - ci) - np.outer((P[i3] - ci) @ ai, ai)
        away = unit(perp(ci - palm_c, ai))
        nail = i3[radi @ away > 0.15 * np.linalg.norm(radi, axis=1).max()]
        return pad, nail

    def classify_rest(self):
        def go():
            P, W_ = eval_mesh(self.ob, groups=self.GROUPS)
            self.pad_idx, self.nail_idx = self.classify(P, W_)
        with_rest_pose(self.arm, go)

    # geometry that does not move while the thumb is solved -----------------
    def build_targets(self, P, polys, W_, pad_idx, nail_idx, cage):
        """BVH targets on one skin level (cage or subdivided): static skin
        (everything but the thumb) for the no-penetration term, the index.03
        nail (reported), the whole INDEX (pad target), the index/middle
        proximal+middle phalanges (shaft target), per-segment trees for the
        report, plus the thumb vertex sets on that level."""
        V = [Vector(p) for p in P]
        w_th = W_["DEF-thumb"]
        static = [p for p in polys if all(w_th[i] <= 0.5 for i in p)]
        # rim = static faces in the thumb blend zone (the edge of the hole the
        # thumb leaves in the palm). Never a real collision target for the
        # distal thumb, but their normals face away from thumb.02 verts 12 mm
        # off and read as phantom "inside" -- so they are skipped
        rim = np.array([any(w_th[i] > 0.05 for i in p) for p in static])
        def faces(names):
            return [p for p in polys if all(sum(W_[n][i] for n in names) > 0.5 for i in p)]
        def tree(fl): return BVHTree.FromPolygons(V, fl, all_triangles=False) if fl else None
        nail = np.zeros(len(P), dtype=bool); nail[nail_idx] = True
        i3f = faces([fb("f_index", 2)])
        npolys = [p for p in i3f if sum(1 for i in p if nail[i]) >= len(p) - 1]
        segs = (fb("f_index", 0), fb("f_index", 1), fb("f_index", 2), fb("f_middle", 0), fb("f_middle", 1), fb("f_middle", 2))
        return dict(V=V, static=static, rim=rim, bvh=tree(static), nail=tree(npolys),
                    index=tree(faces([fb("f_index", 0), fb("f_index", 1), fb("f_index", 2)])),
                    shaft=tree(faces([fb("f_index", 0), fb("f_index", 1), fb("f_middle", 0), fb("f_middle", 1)])),
                    seg={bn: tree(faces([bn])) for bn in segs},
                    seg_polys=[group_polys(polys, W_[tb(j)]) for j in range(3)],
                    test_idx=np.where((W_[tb(1)] > 0.5) | (W_[tb(2)] > 0.5))[0],
                    seg1=np.where(W_[tb(0)] > 0.5)[0], seg2=np.where(W_[tb(1)] > 0.5)[0], seg3=np.where(W_[tb(2)] > 0.5)[0],
                    pad_idx=pad_idx, allow=(ALLOW if cage else 0.0), cage=cage)

    def refresh(self):
        P, polys, W_ = eval_mesh(self.ob, with_polys=True, groups=self.GROUPS)
        self.P_static = P
        self.T = self.build_targets(P, polys, W_, self.pad_idx, self.nail_idx, cage=True)
        self.bvh = self.T["bvh"]; self.bvh_nail = self.T["nail"]; self.static_rim = self.T["rim"]
        i3 = self.grp[fb("f_index", 2)]; i2 = self.grp[fb("f_index", 1)]
        self.i3_c = P[i3].mean(axis=0); self.i2_c = P[i2].mean(axis=0)
        self.i3_axis = pca_axis(P[i3], self.i3_c - self.i2_c)
        self.nail_pt = P[self.nail_idx].mean(axis=0)
        self.i3_dorsal = unit(perp(self.nail_pt - self.i3_c, self.i3_axis))
        rel = P[i3] - self.i3_c
        self.i3_radius = float(np.median(np.linalg.norm(rel - np.outer(rel @ self.i3_axis, self.i3_axis), axis=1)))
        # raw across-the-fingers direction at the knuckles (index.01 -> pinky.01).
        # NOT orthogonal to F: the pinky knuckle sits ~36 mm behind and ~21 mm
        # palmar of the index knuckle in this fist, so it is only used to SIGN
        # the orthonormal ulnar axis below
        self.ulnar_raw = unit(P[self.grp[fb("f_pinky", 0)]].mean(axis=0) - P[self.grp[fb("f_index", 0)]].mean(axis=0))
        # middle-phalanx axes of index and middle (the rod crosses these)
        def seg_axis(d, j):
            Q = P[self.grp[fb(d, j)]]; prev = P[self.grp[fb(d, j - 1)]].mean(axis=0) if j else P[self.palm_idx].mean(axis=0)
            return pca_axis(Q, Q.mean(axis=0) - prev)
        self.i2_axis = seg_axis("f_index", 1); self.m2_axis = seg_axis("f_middle", 1)
        # hand frame: F palm -> knuckles (index+middle MCP), PALMAR = where the
        # flexed proximal phalanges point (measured, not the nail: in a curled
        # fist the index nail faces palmar-outward, so it is NOT the dorsum)
        self.palm_c = P[self.palm_idx].mean(axis=0)
        self.knuckle_c = (P[self.grp[fb("f_index", 0)]].mean(axis=0) + P[self.grp[fb("f_middle", 0)]].mean(axis=0)) / 2
        self.F = unit(self.knuckle_c - self.palm_c)
        p1 = (seg_axis("f_index", 0) + seg_axis("f_middle", 0)) / 2
        self.palmar = unit(perp(p1, self.F))
        self.N = -self.palmar                      # dorsal
        # orthonormal ulnar: perpendicular to F and palmar, signed toward the pinky
        u = np.cross(self.F, self.palmar)
        self.ulnar = u if np.dot(u, self.ulnar_raw) >= 0 else -u
        self.radial = -self.ulnar
        # the SITE camera after the client's 45-deg roll (rotateFistFrame in
        # zeroMirrorStage.js, derived 9 Sep 2026): with x = pinky->index,
        # y = wrist->knuckles, z = x cross y (= dorsal on these left-hand rigs),
        # the vector from the fist TOWARD the camera is 0.707x - 0.707z on the
        # green fist and 0.707x + 0.707z on the human one, i.e. the green is
        # seen from its radial-PALMAR diagonal and the human from its
        # radial-DORSAL diagonal; both see the thumb side, neither sees the
        # knuckle face (the contact axis lies in the camera plane).
        self.toward = unit(self.radial + (self.palmar if self.key == "green" else self.N))
        # knuckle plane: how far the fist's contact face reaches along F
        k_idx = np.concatenate([self.grp[fb("f_index", 0)], self.grp[fb("f_middle", 0)]])
        self.knuckle_front = float(((P[k_idx] - self.knuckle_c) @ self.F).max())
        # finger capsules from the skin (deep-penetration guard; BVH does fine contact)
        self.caps = []
        for d in DIGITS:
            prev = None
            for j in range(3):
                vi = self.grp[fb(d, j)]; Q = P[vi]; c = Q.mean(axis=0)
                a = pca_axis(Q, c - prev if prev is not None else c - P[self.palm_idx].mean(axis=0))
                al = (Q - c) @ a; h = float(np.percentile(np.abs(al), 90))
                r = float(np.median(np.linalg.norm((Q - c) - np.outer(al, a), axis=1)))
                self.caps.append((c - a * h, c + a * h, r * 0.8)); prev = c
        # fingertip tuck (distal segment -> palm skin, vertex-vertex), reported
        kd = kdtree.KDTree(len(self.palm_idx))
        for i, q in enumerate(P[self.palm_idx]): kd.insert(Vector(q), i)
        kd.balance()
        self.tuck = {d: min(kd.find(Vector(q))[2] for q in P[self.grp[fb(d, 2)]]) for d in DIGITS}

    # thumb pose --------------------------------------------------------------
    def get_params(self):
        e = [self.arm.pose.bones[tb(j)].rotation_euler for j in range(3)]
        s = self.flex_sign
        return np.array([e[0].x * s, e[0].y, e[0].z, e[1].x * s, e[1].y, e[1].z, e[2].x * s])
    def set_params(self, x):
        s = self.flex_sign; pb = self.arm.pose.bones
        pb[tb(0)].rotation_euler = (x[0] * s, x[1], x[2])
        pb[tb(1)].rotation_euler = (x[3] * s, x[4], x[5])
        pb[tb(2)].rotation_euler = (x[6] * s, 0.0, 0.0)
        bpy.context.view_layer.update()
    def triples(self):
        return [euler_of(self.arm, tb(j)) for j in range(3)]

    # measures ---------------------------------------------------------------
    def measure(self, P=None, T=None, detail=False):
        T = T or self.T
        if P is None: P = eval_mesh(self.ob)
        bvh = T["bvh"]; rim = T["rim"]; allow = T["allow"]
        seg1, seg2, seg3, pad_idx = T["seg1"], T["seg2"], T["seg3"], T["pad_idx"]
        Tv = P[T["test_idx"]]
        pen = 0.0; minclear = 1e9; n_in = 0; deepest = 0.0; dbg = []
        for v in Tv:
            vv = Vector(v)
            loc, nrm, fi, d = bvh.find_nearest(vv)
            if loc is None or rim[fi]: continue
            s = d if (vv - loc).dot(nrm) >= 0 else -d
            if s < -0.012: continue         # a finger is ~8 mm deep: deeper is an artefact, not a penetration
            if DEBUG and s < 0: dbg.append((s, v, np.array(loc), np.array(nrm)))
            if s < minclear: minclear = s
            if s < allow: pen += (allow - s) ** 2
            if s < 0:
                n_in += 1; deepest = max(deepest, -s)
        if DEBUG and dbg:
            dbg.sort(key=lambda t: t[0])
            for s_, v, loc, nrm in dbg[:6]:
                log("   DBG inside %.2f mm: v %s nearest %s n %s | v-to-thumb03c %.1f mm, to nailpt %.1f mm" % (
                    s_ * MM, np.round(v * MM, 1), np.round(loc * MM, 1), np.round(nrm, 2),
                    np.linalg.norm(v - P[seg3].mean(axis=0)) * MM, np.linalg.norm(v - self.nail_pt) * MM))
        cap = 0.0; capdeep = 0.0
        for A, B, r in self.caps:
            inside = r - seg_dist(Tv, A, B); m = inside[inside > 0]
            if len(m): cap += float(np.sum(m ** 2)); capdeep = max(capdeep, float(m.max()))
        def dmin(idx, tree):
            if tree is None or len(idx) == 0: return 1e9
            best = 1e9
            for v in P[idx]:
                loc, nrm, _, d = tree.find_nearest(Vector(v))
                if loc is not None and d < best: best = d
            return best
        dn = dmin(pad_idx, T["nail"])              # pad -> index.03 nail (round-2 target, reported)
        d_pad = dmin(pad_idx, T["index"])          # pad -> any index skin (round-3 target)
        d_shaft = dmin(seg2, T["shaft"])           # thumb.02 shaft -> index/middle proximal+middle phalanges
        c3 = P[seg3].mean(axis=0); c2 = P[seg2].mean(axis=0); c1 = P[seg1].mean(axis=0)
        a1 = unit(c2 - c1); pr = (P[seg1] - c1) @ a1
        seg1d = seg1[pr > np.percentile(pr, 67)]   # distal third of the metacarpal/thenar group
        d_shaft1 = dmin(seg1d, T["shaft"])
        o = c3 - self.nail_pt
        along = float(np.dot(o, self.i3_dorsal))
        lateral = float(np.linalg.norm(o - self.i3_dorsal * along))
        t3_axis = pca_axis(P[seg3], c3 - c2)
        t2_axis = unit(c3 - c1)
        # ── round 2: straightness + rod orientation + face census ──────────
        b2 = bone_axis(self.arm, tb(1)); b3 = bone_axis(self.arm, tb(2))
        bend = angle_deg(b2, b3)                          # world angle .02 vs .03 bone axes
        s2_axis = pca_axis(P[seg2], c3 - c2)              # .02 skin axis, proximal -> distal
        skin_bend = angle_deg(s2_axis, t3_axis)           # same on the skin PCA axes
        rod = pca_axis(P[np.concatenate([seg2, seg3])], c3 - c2)   # the .02-.03 rod, proximal -> tip
        across = float(math.hypot(np.dot(rod, self.i2_axis), np.dot(rod, self.m2_axis)))  # 0 = perpendicular to both
        fwd = float(np.dot(rod, self.F)); down = float(np.dot(rod, self.palmar)); rod_ulnar = float(np.dot(rod, self.ulnar))
        rodc = unit(c3 - c2)                              # centroid rod, robust to the bulbous pad
        # thumb tip vs the knuckle plane: the tip must stay BEHIND the fist's
        # contact face (the reference leaves a V notch; the thumbs never touch)
        tip_f = float(((P[seg3] - self.knuckle_c) @ self.F).max())
        tip_behind = self.knuckle_front - tip_f
        # round 3: where the rod sits relative to the index middle phalanx
        # (palmar = below it = the round-2 lobe), and which way the nail faces
        tip_below = float(np.dot(c3 - self.i2_c, self.palmar))
        shaft_below = float(np.dot(c2 - self.i2_c, self.palmar))
        pad_dir = unit(perp(P[pad_idx].mean(axis=0) - c3, t3_axis))
        nail_dir = -pad_dir
        nail_out = float(np.dot(nail_dir, self.radial))
        nail_cam = float(np.dot(nail_dir, self.toward))
        V = T["V"] if not T["cage"] else [Vector(p) for p in P]
        seg_polys = T["seg_polys"]
        x23 = census(V, seg_polys[1], seg_polys[2]); x12 = census(V, seg_polys[0], seg_polys[1])
        xst = census(V, seg_polys[1] + seg_polys[2], T["static"])
        m = dict(pen=pen, minclear=minclear, n_in=n_in, deepest=deepest, cap=cap, capdeep=capdeep,
                 d_nail=dn, d_pad=d_pad, d_shaft=d_shaft, d_shaft1=d_shaft1, along=along, lateral=lateral,
                 perp=float(np.dot(t3_axis, self.i3_axis)), ulnar=float(np.dot(t3_axis, self.ulnar)),
                 ulnar2=float(np.dot(t2_axis, self.ulnar)),
                 bend=bend, skin_bend=skin_bend, across=across, fwd=fwd, down=down, rod_ulnar=rod_ulnar,
                 rodc_fwd=float(np.dot(rodc, self.F)), rodc_down=float(np.dot(rodc, self.palmar)), rodc_ulnar=float(np.dot(rodc, self.ulnar)),
                 rod_cam=float(np.dot(rod, self.toward)),
                 tip_behind=tip_behind, tip_below=tip_below, shaft_below=shaft_below,
                 nail_out=nail_out, nail_cam=nail_cam, nail_palmar=float(np.dot(self.i3_dorsal, self.palmar)),
                 x23=x23, x12=x12, xst=xst)
        if detail:
            m["seg_mm"] = {"thumb02_" + k.split("-")[1].split(".")[0].replace("f_", "") + k.split(".")[1]: dmin(seg2, t) * MM
                           for k, t in T["seg"].items()}
            m["seg_mm"].update({"thumb03_" + k.split("-")[1].split(".")[0].replace("f_", "") + k.split(".")[1]: dmin(seg3, t) * MM
                                for k, t in T["seg"].items()})
            m["tuck_mm"] = {d: self.tuck[d] * MM for d in DIGITS}
        return m

    def score(self, m, x):
        s = W["pen"] * m["pen"] + W["cap"] * m["cap"]
        s += W["nail"] * (min(m["d_nail"], NAIL_CAP) - NAIL_TARGET) ** 2
        s += W["pad"] * (min(m["d_pad"], NAIL_CAP) - NAIL_TARGET) ** 2
        s += W["shaft"] * (min(m["d_shaft"], NAIL_CAP) - SHAFT_TARGET) ** 2
        s += W["shaft1"] * (min(m["d_shaft1"], NAIL_CAP) - SHAFT_TARGET) ** 2
        s += W["lat"] * max(0.0, m["lateral"] - 0.006) ** 2
        s += W["out"] * max(0.0, -m["along"]) ** 2
        s += W["ori_perp"] * m["perp"] ** 2
        s += W["ori_ulnar"] * max(0.0, ULNAR_TARGET - m["ulnar"]) ** 2
        # round 2: straight rod; round 3: rod aimed at the other fist, on the fingers
        s += W["straight"] * math.radians(m["bend"]) ** 2
        s += W["skin"] * math.radians(m["skin_bend"]) ** 2
        s += W["across"] * max(0.0, m["across"] - ACROSS_HI) ** 2
        s += W["fwd"] * max(0.0, FWD_TARGET - m["fwd"]) ** 2
        s += W["rodulnar"] * max(0.0, RODULNAR_TARGET - m["rod_ulnar"]) ** 2
        s += W["down"] * (max(0.0, DOWN_LO - m["down"]) ** 2 + max(0.0, m["down"] - DOWN_HI) ** 2)
        s += W["behind"] * (max(0.0, BEHIND_MM / MM - m["tip_behind"]) ** 2 + max(0.0, m["tip_behind"] - BEHIND_HI_MM / MM) ** 2)
        s += W["nailout"] * max(0.0, NAILOUT_TARGET - m["nail_out"]) ** 2
        s += W["xsect"] * (m["x23"] + m["x12"] + m["xst"])
        cmc = Euler((x[0], x[1], x[2]), "XYZ").to_quaternion().angle
        lim = max(0.0, cmc - LIM["cmc_total"]) ** 2 + max(0.0, -LIM["cmc_ext"] - x[0]) ** 2
        lim += max(0.0, x[3] - LIM["mcp_flex"]) ** 2 + max(0.0, -x[3]) ** 2
        lim += max(0.0, abs(x[4]) - LIM["mcp_side"]) ** 2 + max(0.0, abs(x[5]) - LIM["mcp_side"]) ** 2
        lim += max(0.0, LIM["ip_lo"] - x[6]) ** 2 + max(0.0, x[6] - LIM["ip_hi"]) ** 2
        s += W["lim"] * lim
        return s

    def joints_deg(self, x):
        """(CMC total, MCP flexion, IP flexion) in degrees from the params."""
        return (math.degrees(Euler((x[0], x[1], x[2]), "XYZ").to_quaternion().angle),
                math.degrees(x[3]), math.degrees(x[6]))

    def report(self, m, x=None, label=""):
        cmc, mcp, ip = self.joints_deg(x) if x is not None else (float("nan"),) * 3
        log("%-24s pad->index %5.2f mm (nail %5.2f) | shaft %5.2f mm (mc %5.2f) | clear %+5.2f mm (in %3d, deepest %4.2f) | cap %4.2f | "
            "CMC %4.1f MCP %4.1f IP %4.1f deg"
            % (label, m["d_pad"] * MM, m["d_nail"] * MM, m["d_shaft"] * MM, m["d_shaft1"] * MM, m["minclear"] * MM, m["n_in"],
               m["deepest"] * MM, m["capdeep"] * MM, cmc, mcp, ip))
        log("%-24s bend %4.1f deg (skin %4.1f, rest %4.1f) | rod: fwd %+.2f down %+.2f ulnar %+.2f across %.2f cam %+.2f (centroid rod %+.2f/%+.2f/%+.2f) | "
            "tip behind knuckles %+.1f mm, below index.02 %+.1f mm (shaft %+.1f) | nail radial %+.2f cam %+.2f | xsect 02x03 %d 01x02 %d thumb-x-static %d"
            % ("", m["bend"], m["skin_bend"], self.rest_bend, m["fwd"], m["down"], m["rod_ulnar"], m["across"], m["rod_cam"],
               m["rodc_fwd"], m["rodc_down"], m["rodc_ulnar"],
               m["tip_behind"] * MM, m["tip_below"] * MM, m["shaft_below"] * MM, m["nail_out"], m["nail_cam"], m["x23"], m["x12"], m["xst"]))
        if "seg_mm" in m:
            log("%-24s segments mm: %s | tuck mm: %s" % ("", {k: round(v, 1) for k, v in m["seg_mm"].items()},
                                                          {k: round(v, 1) for k, v in m["tuck_mm"].items()}))

    # true (subsurf ON) measurement on the subdivided skin, using its own
    # interpolated deform weights (no nearest-vertex transfer: that misfiles
    # nail verts as pad verts once the two skins are 2 mm apart)
    def measure_true(self, detail=True):
        subsurf(True)
        try:
            if not hasattr(self, "_sub_sets"):
                def go():
                    P0, W0 = eval_mesh(self.ob, groups=self.GROUPS)
                    return self.classify(P0, W0)
                self._sub_sets = with_rest_pose(self.arm, go)
            pad_idx, nail_idx = self._sub_sets
            P, polys, W_ = eval_mesh(self.ob, with_polys=True, groups=self.GROUPS)
            T = self.build_targets(P, polys, W_, pad_idx, nail_idx, cage=False)
            return self.measure(P, T=T, detail=detail)
        finally:
            subsurf(False)

# ───────────────────────────── search ──────────────────────────────────────
# Round 2 HARD bounds: MCP side/twist +-0.15, IP 0..15 deg, MCP flex <= 55 deg
# (round 1 allowed +-0.35 / 0.20..1.45 / 1.10 -- that is the hook the client
# rejected). thumb.03 Y and Z are never searched: they stay 0.
LO = np.array([-LIM["cmc_ext"], -1.1, -1.1, 0.0, -LIM["mcp_side"], -LIM["mcp_side"], LIM["ip_lo"]])
HI = np.array([1.15, 1.1, 1.1, LIM["mcp_flex"], LIM["mcp_side"], LIM["mcp_side"], LIM["ip_hi"]])

def coord_descent(f, x0, steps=(0.28, 0.14, 0.07, 0.035, 0.016, 0.007), sweeps=5):
    x = np.clip(np.array(x0, float), LO, HI); fx = f(x); n = 0
    for st in steps:
        for _ in range(sweeps):
            improved = False
            for i in range(len(x)):
                for sgn in (1, -1):
                    y = x.copy(); y[i] = float(np.clip(y[i] + sgn * st, LO[i], HI[i]))
                    if y[i] == x[i]: continue
                    fy = f(y); n += 1
                    if fy < fx:
                        x, fx, improved = y, fy, True; break
            if not improved: break
    return x, fx, n

def nelder_mead(f, x0, step=0.05, iters=250, tol=1e-9):
    n = len(x0); pts = [np.clip(np.array(x0, float), LO, HI)]
    for i in range(n):
        y = pts[0].copy(); y[i] = float(np.clip(y[i] + step, LO[i], HI[i])); pts.append(y)
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = np.argsort(vals); pts = [pts[i] for i in order]; vals = [vals[i] for i in order]
        if abs(vals[-1] - vals[0]) < tol: break
        c = np.mean(pts[:-1], axis=0)
        xr = np.clip(c + (c - pts[-1]), LO, HI); fr = f(xr)
        if fr < vals[0]:
            xe = np.clip(c + 2 * (c - pts[-1]), LO, HI); fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = np.clip(c + 0.5 * (pts[-1] - c), LO, HI); fc = f(xc)
            if fc < vals[-1]: pts[-1], vals[-1] = xc, fc
            else:
                for i in range(1, len(pts)):
                    pts[i] = pts[0] + 0.5 * (pts[i] - pts[0]); vals[i] = f(pts[i])
    i = int(np.argmin(vals)); return pts[i], vals[i]

def solve(rigs, primary, extra_starts=()):
    """rigs: list of Rig objects scored together; `primary` is the one whose
    parameters are searched (others get the production transplant of it)."""
    rng = random.Random(SEED)
    cache = {}
    def objective(x):
        key = tuple(np.round(x, 5))
        if key in cache: return cache[key]
        primary.set_params(x)
        total = 0.0
        for r in rigs:
            if r is not primary: transplant(r.arm, primary.arm, THUMB)
            total += (WOWN if r is primary else WJOINT) * r.score(r.measure(), x)
        cache[key] = total
        return total
    starts = [primary.get_params()] + [np.clip(np.array(e, float), LO, HI) for e in extra_starts]
    for _ in range(RESTARTS - 1):
        starts.append(np.array([rng.uniform(LO[i], HI[i]) for i in range(7)]))
    best = None; t0 = time.time(); evals = 0
    for k, s in enumerate(starts):
        x, fx, n = coord_descent(objective, s); evals += n
        log("restart %2d  score %10.4f  evals %4d  x %s" % (k, fx, n, np.round(x, 3).tolist()))
        if best is None or fx < best[1]: best = (x, fx)
    for k in range(6):
        s = np.clip(best[0] + np.array([rng.uniform(-0.2, 0.2) for _ in range(7)]), LO, HI)
        x, fx, n = coord_descent(objective, s, steps=(0.1, 0.05, 0.02, 0.008)); evals += n
        if fx < best[1]: best = (x, fx); log("hop %d improved -> %.4f" % (k, fx))
    x, fx = nelder_mead(objective, best[0])
    if fx < best[1]: best = (x, fx)
    log("SOLVED score %.4f  evals ~%d  %.1fs" % (best[1], len(cache), time.time() - t0))
    objective(best[0])   # leave the rigs in the solved state
    return best[0], best[1]

# ───────────────────────────── renders ─────────────────────────────────────
def setup_render():
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else engines[0]
    scene.render.resolution_x = 900; scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    mat_g = bpy.data.materials.new("G"); mat_g.use_nodes = True
    mat_g.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.62, 0.30, 1)
    mat_h = bpy.data.materials.new("H"); mat_h.use_nodes = True
    mat_h.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.88, 0.66, 0.52, 1)
    for mat in (mat_g, mat_h): mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.45
    bpy.data.objects["GreenHand"].data.materials.clear(); bpy.data.objects["GreenHand"].data.materials.append(mat_g)
    bpy.data.objects["HumanHand"].data.materials.clear(); bpy.data.objects["HumanHand"].data.materials.append(mat_h)
    cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd); cd.lens = 60
    scene.collection.objects.link(cam); scene.camera = cam
    for rot, e in (((0.8, 0.2, -0.35), 3.0), ((1.9, -0.4, 2.6), 1.6), ((-1.2, 0.9, 1.0), 1.2)):
        ld = bpy.data.lights.new("L", "SUN"); ld.energy = e
        lo = bpy.data.objects.new("L", ld); lo.rotation_euler = rot
        scene.collection.objects.link(lo)
    w = bpy.data.worlds.new("W"); w.color = (0.70, 0.78, 0.83); scene.world = w
    return cam

def aim(cam, at, up):
    """Point the camera at `at` with image-up along `up` (not world Z: the
    hands are rotated onto the site diagonal, so world-up renders read wrong)."""
    f = (at - cam.location).normalized()
    u = (up - f * up.dot(f)).normalized(); r_ = f.cross(u).normalized()
    cam.matrix_world = Matrix((( r_.x, u.x, -f.x, cam.location.x),
                               ( r_.y, u.y, -f.y, cam.location.y),
                               ( r_.z, u.z, -f.z, cam.location.z),
                               (0, 0, 0, 1)))

def site_camera(rig):
    """The production camera for this hand after the client's 45-deg roll,
    derived from rotateFistFrame() / prepareSourceFistBump() in
    src/gl/zeroMirrorStage.js (read 9 Sep 2026), in the hand's BONE frame the
    stage builds: x = index.01 - pinky.01 (orthogonalised), y = middle.01 -
    wrist, z = x cross y. With diagonal D = (cos35, -sin35) and diagonalUp
    dU = (sin35, cos35) in camera (right, up) coordinates and T = toward the
    camera, the rolled frame is x' = cos45 dU + sin45 T for BOTH hands,
    y' = +D (green) / -D (human), z' = x' cross y' = -cos45 T + sin45 dU
    (green) / +cos45 T - sin45 dU (human). Hence, in hand-frame components:
      toward camera = 0.7071 x - 0.7071 z (green), 0.7071 x + 0.7071 z (human)
      image up      = 0.5792 x - 0.5736 y + 0.5792 z (green),
                      0.5792 x + 0.5736 y - 0.5792 z (human)
    Returns (toward, up) as world-space mathutils Vectors."""
    arm = rig.arm
    def head(bn): return Vector(arm.matrix_world @ arm.pose.bones[bn].head)
    y = (head(fb("f_middle", 0)) - head(HAND)).normalized()
    x = head(fb("f_index", 0)) - head(fb("f_pinky", 0)); x = (x - y * x.dot(y)).normalized()
    z = x.cross(y)
    s = -1.0 if rig.key == "green" else 1.0
    toward = (x * 0.70711 + z * (0.70711 * s)).normalized()
    up = x * 0.57922 + y * (0.57358 * s) + z * (-0.57922 * s)
    return toward, (up - toward * up.dot(toward)).normalized()

def shoot(cam, rig, tag, views=None, solo=True, r=0.40):
    """7 large clay views of one hand, framed from the SKIN (thumbside, front =
    fist face, dorsal, palm, thumb45, thumbdorsal45, and SITECAM = the
    production camera direction after the 45-deg roll, see site_camera) with
    the hand's DORSUM as image-up (sitecam: the site's image-up), plus 'pair'
    (both fists from the thumb side of this one)."""
    arm = rig.arm
    others = [bpy.data.objects[mn] for an, mn in RIGS.values() if an != arm.name]
    for o in others: o.hide_render = solo
    P = eval_mesh(rig.ob)
    H = Vector(P[rig.palm_idx].mean(axis=0))
    K = Vector((P[rig.grp[fb("f_middle", 0)]].mean(axis=0) + P[rig.grp[fb("f_index", 0)]].mean(axis=0)) / 2)
    F = (K - H).normalized()
    N = Vector(rig.N); N = (N - F * N.dot(F)).normalized()      # dorsal (measured from the phalanges)
    Td = Vector(rig.radial); Td = (Td - F * Td.dot(F) - N * Td.dot(N)).normalized()   # radial = thumb side
    ctr = (H + K) / 2 + F * 0.02
    st, su = site_camera(rig)
    all_views = {"thumbside": (Td, N), "front": (F, N), "dorsal": (N, -F), "palm": (-N, F),
                 "thumb45": ((Td + F).normalized(), N), "thumbdorsal45": ((Td + N).normalized(), N),
                 "sitecam": (st, su)}
    out = []
    for name in (views or list(all_views)):
        d, up = all_views[name]
        cam.location = ctr + d * r
        aim(cam, ctr, up)
        scene.render.filepath = os.path.join(OUTDIR, "%s-%s.png" % (tag, name))
        bpy.ops.render.render(write_still=True)
        out.append(scene.render.filepath); log("shot", scene.render.filepath)
    for o in others: o.hide_render = False
    if views is None or "pair" in views:
        # both fists, from this hand's thumb side, a little in front (site-like)
        cam.location = K + (Td * 0.8 + F * 0.35 + N * 0.15).normalized() * 0.55
        aim(cam, K + F * 0.01, N)
        scene.render.filepath = os.path.join(OUTDIR, "%s-pair.png" % tag)
        bpy.ops.render.render(write_still=True)
        out.append(scene.render.filepath); log("shot", scene.render.filepath)
    return out

def dump_json(name, data):
    p = os.path.join(OUTDIR, name)
    with open(p, "w") as fh: json.dump(data, fh, indent=1)
    log("wrote", p)

# ───────────────────────────── modes ───────────────────────────────────────
def full_report(frame, tag, do_render=True):
    """Measure both hands' own thumbs + the production transplant at `frame`."""
    set_frame(frame); freeze(); subsurf(False)
    res = {"frame": frame}
    cam = setup_render() if (do_render and not NORENDER) else None
    green = Rig("green"); human = Rig("human")
    for r in (green, human):
        x = r.get_params()
        m = r.measure(detail=True); r.report(m, x, "%s cage" % r.key)
        mt = r.measure_true(); r.report(mt, x, "%s SUBSURF" % r.key)
        cmc, mcp, ip = r.joints_deg(x)
        res[r.key] = {"eulers": r.triples(), "cage": m, "true": mt, "rest_bend_deg": r.rest_bend,
                      "cmc_total_deg": cmc, "mcp_deg": mcp, "ip_deg": ip}
        if cam: res[r.key]["renders"] = shoot(cam, r, "%s-%s" % (tag, r.key))
    if TRANSPLANT:
        transplant(human.arm, green.arm, CLOSING)
        ht = Rig("human", tag="human-transplanted")
        m = ht.measure(detail=True); ht.report(m, green.get_params(), "transplant cage")
        mt = ht.measure_true(); ht.report(mt, green.get_params(), "transplant SUBSURF")
        res["transplanted"] = {"human_eulers_after": ht.triples(), "cage": m, "true": mt}
        if cam: res["transplanted"]["renders"] = shoot(cam, ht, "%s-transplant" % tag)
    return res

if MODE == "probe":
    set_frame(FRAME); freeze(); subsurf(False)
    for key in ("green", "human"):
        an, mn = RIGS[key]; arm = bpy.data.objects[an]; ob = bpy.data.objects[mn]
        log("== %s: bones %d, verts %d, groups %d, mods %s" % (key, len(arm.pose.bones), len(ob.data.vertices),
            len(ob.vertex_groups), [(m.name, m.type) for m in ob.modifiers]))
        for bn in [HAND] + THUMB + [fb("f_index", j) for j in range(3)]:
            pb = arm.pose.bones[bn]
            log("   %-18s parent %-18s len %.4f euler %s" % (bn, pb.parent.name if pb.parent else "-", pb.length, euler_of(arm, bn)))
        r = Rig(key)
        log("   thumb test verts %d (segs %s) pad %d nail %d | idx3 radius %.1f mm | flex_sign %+d"
            % (len(r.test_idx), [len(s) for s in r.seg_idx], len(r.pad_idx), len(r.nail_idx), r.i3_radius * MM, r.flex_sign))
        m = r.measure(detail=True); r.report(m, r.get_params(), key + " current")
        base = r.get_params(); tip0 = eval_mesh(r.ob)[r.seg_idx[2]].mean(axis=0)
        for i, nm in enumerate(("cmc.x(flex)", "cmc.y", "cmc.z", "mcp.x(flex)")):
            x = base.copy(); x[i] += 0.3; r.set_params(x)
            d = eval_mesh(r.ob)[r.seg_idx[2]].mean(axis=0) - tip0
            log("   +0.3 on %-11s moves thumb.03 %5.1f mm: dorsal %+.2f ulnar %+.2f fingeraxis %+.2f"
                % (nm, np.linalg.norm(d) * MM, np.dot(unit(d), r.i3_dorsal), np.dot(unit(d), r.ulnar), np.dot(unit(d), r.i3_axis)))
        r.set_params(base)
    dump_json("probe.json", {"ok": True})

elif MODE == "geom":
    # Round 3: where every segment sits in the hand frame (F palm->knuckles,
    # PALMAR, ULNAR), so the thumb targets are read off the fist, not assumed.
    set_frame(FRAME); freeze(); subsurf(False)
    out = {}
    for key in ("green", "human"):
        r = Rig(key); P = eval_mesh(r.ob); arm = r.arm
        fr = (r.F, r.palmar, r.ulnar)
        def co(v): return tuple(round(float(np.dot(v, a)) * MM, 1) for a in fr)
        def ax(v): return tuple(round(float(np.dot(v, a)), 2) for a in fr)
        log("== %s  knuckle_front %.1f mm (along F from knuckle_c)" % (key, r.knuckle_front * MM))
        rows = {}
        for d in DIGITS + ["thumb"]:
            prev = None
            for j in range(3):
                bn = tb(j) if d == "thumb" else fb(d, j)
                Q = P[r.grp[bn]]; c = Q.mean(axis=0)
                a = pca_axis(Q, c - prev if prev is not None else c - r.palm_c)
                al = (Q - c) @ a
                ext = (float(al.min()) * MM, float(al.max()) * MM)
                ff = ((Q - r.knuckle_c) @ r.F)
                rows[bn] = dict(c=co(c - r.knuckle_c), axis=ax(a), f_range=(round(float(ff.min()) * MM, 1), round(float(ff.max()) * MM, 1)))
                log("   %-18s c(F,palmar,ulnar) %s mm | axis %s | F-range %s mm | len %.0f mm"
                    % (bn, rows[bn]["c"], rows[bn]["axis"], rows[bn]["f_range"], ext[1] - ext[0]))
                prev = c
        # fingertip tuck: distal segment -> palm/hand skin (vertex-vertex min)
        palmP = P[r.palm_idx]
        kd = kdtree.KDTree(len(palmP))
        for i, q in enumerate(palmP): kd.insert(Vector(q), i)
        kd.balance()
        tuck = {}
        for d in DIGITS:
            vi = r.grp[fb(d, 2)]
            tuck[d] = min(kd.find(Vector(q))[2] for q in P[vi]) * MM
        log("   tuck (distal -> palm) mm: %s" % {k: round(v, 1) for k, v in tuck.items()})
        # bone frame as the stage builds it: x = index01 - pinky01, y = middle01 - hand, z = x cross y
        def head(bn): return np.array(arm.matrix_world @ arm.pose.bones[bn].head, dtype=np.float64)
        y = unit(head(fb("f_middle", 0)) - head(HAND)); x = head(fb("f_index", 0)) - head(fb("f_pinky", 0))
        x = unit(x - y * np.dot(x, y)); z = np.cross(x, y)
        log("   bone frame vs skin frame: x.radial %+.2f x.F %+.2f x.dorsal %+.2f | y.F %+.2f | z.dorsal %+.2f z.radial %+.2f z.F %+.2f"
            % (np.dot(x, -r.ulnar), np.dot(x, r.F), np.dot(x, r.N), np.dot(y, r.F), np.dot(z, r.N), np.dot(z, -r.ulnar), np.dot(z, r.F)))
        m = r.measure(detail=True); r.report(m, r.get_params(), key + " current")
        out[key] = dict(rows=rows, tuck=tuck, knuckle_front_mm=r.knuckle_front * MM,
                        bone_frame=dict(x_radial=float(np.dot(x, -r.ulnar)), z_dorsal=float(np.dot(z, r.N))))
    dump_json("geom-f%d.json" % FRAME, out)

elif MODE == "tuck":
    # Round 3 finger-tuck probe (the reference's stated exception to the
    # frozen D-048 finger tables: "unless a judge finds the fingertips visibly
    # not tucked" -- three judges did, 9 Sep 2026). Adds a curl DELTA (rad, in
    # each joint's own curl direction) to every PIP and DIP at this frame and
    # reports, per finger: distal-segment -> palm distance (tuck), the min
    # signed distance of all that finger's verts to the rest of the static
    # skin (penetration if negative), and the thumb's clearance, so the
    # tightening that closes the hollow without crossing anything is measured.
    set_frame(FRAME); freeze(); subsurf(False)
    cands = [tuple(float(v) for v in c.split("/")) for c in str(arg("--cands", "0/0,0.05/0.05,0.10/0.10,0.10/0.15,0.15/0.15,0.15/0.20,0.20/0.20")).split(",")]
    res = {}
    for key in RIGS:
        an, mn = RIGS[key]; arm = bpy.data.objects[an]; ob = bpy.data.objects[mn]
        base = {bn: arm.pose.bones[bn].rotation_euler.copy() for bn in FINGERS}
        polys = [tuple(p.vertices) for p in ob.data.polygons]
        w_th = weights(ob, ["DEF-thumb"])
        w_f = {d: weights(ob, [fb(d, j) for j in range(3)]) for d in DIGITS}
        grp = {bn: np.where(weights(ob, [bn]) > 0.5)[0] for bn in FINGERS + THUMB}
        palm_idx = np.where(weights(ob, ["DEF-palm", HAND]) > 0.5)[0]
        w_t23 = np.where((weights(ob, [tb(1)]) > 0.5) | (weights(ob, [tb(2)]) > 0.5))[0]
        static_nt = [p for p in polys if all(w_th[i] <= 0.5 for i in p)]
        res[key] = []
        for dp, dd in cands:
            for d in DIGITS:
                for j, delta in ((1, dp), (2, dd)):
                    pb = arm.pose.bones[fb(d, j)]; e = list(base[fb(d, j)])
                    k = int(np.argmax(np.abs(e))); e[k] += delta * (1.0 if e[k] >= 0 else -1.0)
                    pb.rotation_euler = tuple(e)
            bpy.context.view_layer.update()
            P = eval_mesh(ob); V = [Vector(p) for p in P]
            kd = kdtree.KDTree(len(palm_idx))
            for i, q in enumerate(P[palm_idx]): kd.insert(Vector(q), i)
            kd.balance()
            row = {"pip": dp, "dip": dd}
            for d in DIGITS:
                own = w_f[d]
                others = [p for p in static_nt if all(own[i] <= 0.5 for i in p)]
                bvh = BVHTree.FromPolygons(V, others, all_triangles=False)
                fidx = np.concatenate([grp[fb(d, j)] for j in range(3)])
                mn_ = 1e9; n_in = 0
                for v in P[fidx]:
                    vv = Vector(v); loc, nrm, fi, dist = bvh.find_nearest(vv)
                    if loc is None: continue
                    s = dist if (vv - loc).dot(nrm) >= 0 else -dist
                    if s < -0.012: continue
                    mn_ = min(mn_, s)
                    if s < -0.0005: n_in += 1
                tuck = min(kd.find(Vector(q))[2] for q in P[grp[fb(d, 2)]])
                row[d] = {"tuck_mm": tuck * MM, "min_mm": mn_ * MM, "n_in": n_in}
            # thumb (as currently posed) vs the tightened fingers
            bvh_all = BVHTree.FromPolygons(V, static_nt, all_triangles=False)
            rim = np.array([any(w_th[i] > 0.05 for i in p) for p in static_nt])
            tmn = 1e9
            for v in P[w_t23]:
                vv = Vector(v); loc, nrm, fi, dist = bvh_all.find_nearest(vv)
                if loc is None or rim[fi]: continue
                s = dist if (vv - loc).dot(nrm) >= 0 else -dist
                if s < -0.012: continue
                tmn = min(tmn, s)
            row["thumb_min_mm"] = tmn * MM
            res[key].append(row)
            log("%s pip+%.2f dip+%.2f | tuck mm idx %5.1f mid %5.1f ring %5.1f pinky %5.1f | finger min mm idx %+5.2f (%d) mid %+5.2f (%d) ring %+5.2f (%d) pinky %+5.2f (%d) | thumb min %+5.2f"
                % (key, dp, dd, row["f_index"]["tuck_mm"], row["f_middle"]["tuck_mm"], row["f_ring"]["tuck_mm"], row["f_pinky"]["tuck_mm"],
                   row["f_index"]["min_mm"], row["f_index"]["n_in"], row["f_middle"]["min_mm"], row["f_middle"]["n_in"],
                   row["f_ring"]["min_mm"], row["f_ring"]["n_in"], row["f_pinky"]["min_mm"], row["f_pinky"]["n_in"], row["thumb_min_mm"]))
        for bn, e in base.items(): arm.pose.bones[bn].rotation_euler = e
        bpy.context.view_layer.update()
    dump_json("tuck-f%d.json" % FRAME, res)

elif MODE == "solve":
    set_frame(FRAME); freeze(); subsurf(False)
    random.seed(SEED)
    primary = Rig(RIG)
    rigs = [primary]
    extra = []
    cam = None if NORENDER else setup_render()
    if JOINT and RIG == "green":
        human = bpy.data.objects[RIGS["human"][0]]
        transplant(human, primary.arm, CLOSING)
        ht = Rig("human", tag="human-transplanted")
        # what the human would want on the production fingers, and the green
        # pose that reproduces it through the quaternion transplant (inverse)
        xh, fh = solve([ht], ht)
        log("human-on-production-fingers own ideal: %s score %.3f" % (ht.triples(), fh))
        x0 = primary.get_params()
        transplant(primary.arm, ht.arm, THUMB)
        x_inv = primary.get_params(); primary.set_params(x_inv)
        primary.report(primary.measure(), x_inv, "green@inverse cage")
        if cam: shoot(cam, primary, "inverse-green", views=["thumbside", "front", "thumb45"])
        primary.set_params(x0); transplant(ht.arm, primary.arm, THUMB)
        rigs.append(ht); extra = [x_inv]
    log("solving %s (joint=%s wown=%.2f wjoint=%.2f) from %s" % (RIG, JOINT, WOWN, WJOINT, np.round(primary.get_params(), 3).tolist()))
    x, fx = solve(rigs, primary, extra_starts=extra)
    cmc, mcp, ip = primary.joints_deg(x)
    res = {"rig": RIG, "joint": JOINT, "score": fx, "params": x.tolist(), "eulers": primary.triples(),
           "cmc_total_deg": cmc, "mcp_deg": mcp, "ip_deg": ip, "rest_bend_deg": primary.rest_bend,
           "weights": W, "lim": LIM, "fwd_target": FWD_TARGET, "ulnar_target": ULNAR_TARGET}
    log("EULERS %s: %s  (CMC %.1f MCP %.1f IP %.1f deg)" % (RIG, res["eulers"], cmc, mcp, ip))
    for r in rigs:
        m = r.measure(detail=True); r.report(m, x, r.tag + " cage")
        mt = r.measure_true(); r.report(mt, x, r.tag + " SUBSURF")
        res[r.tag] = {"cage": m, "true": mt, "eulers": r.triples()}
        if cam: res[r.tag]["renders"] = shoot(cam, r, arg("--tag", "solve-" + r.tag) if r is primary else "solve-" + r.tag)
    dump_json("solve-%s%s.json" % (RIG, "-joint" if JOINT else ""), res)

elif MODE == "check":
    set_frame(FRAME); freeze(); subsurf(False)
    g = arg("--green"); h = arg("--human")
    if g:
        arm = bpy.data.objects[RIGS["green"][0]]
        for j, e in enumerate(parse_triples(g)): arm.pose.bones[tb(j)].rotation_euler = e
    if h:
        arm = bpy.data.objects[RIGS["human"][0]]
        for j, e in enumerate(parse_triples(h)): arm.pose.bones[tb(j)].rotation_euler = e
    bpy.context.view_layer.update()
    res = full_report(FRAME, "check")
    dump_json("check.json", res)

elif MODE == "final":
    res = full_report(FRAME, "final-f%d" % FRAME)
    dump_json("final-f%d.json" % FRAME, res)

elif MODE == "sweep":
    f0 = int(arg("--f0", 56)); f1 = int(arg("--f1", 80))
    subsurf(False)
    rows = []
    wts = {key: weights(bpy.data.objects[RIGS[key][1]], ["DEF-thumb"]) for key in RIGS}
    tst = {}; segp = {}; statp = {}
    for key in RIGS:
        ob = bpy.data.objects[RIGS[key][1]]
        w1, w2, w3 = (weights(ob, [tb(j)]) for j in range(3))
        tst[key] = np.where((w2 > 0.5) | (w3 > 0.5))[0]
        polys = [tuple(p.vertices) for p in ob.data.polygons]
        segp[key] = [group_polys(polys, wj) for wj in (w1, w2, w3)]
        statp[key] = [p for p in polys if all(wts[key][i] <= 0.5 for i in p)]
    for f in range(f0, f1 + 1):
        set_frame(f)
        row = {"frame": f}
        for key in RIGS:
            ob = bpy.data.objects[RIGS[key][1]]
            w = wts[key]; P = eval_mesh(ob)
            static = statp[key]
            rim = np.array([any(w[i] > 0.05 for i in p) for p in static])
            V = [Vector(p) for p in P]
            bvh = BVHTree.FromPolygons(V, static, all_triangles=False)
            mn = 1e9; n_in = 0; deepest = 0.0
            for v in P[tst[key]]:
                vv = Vector(v); loc, nrm, fi, d = bvh.find_nearest(vv)
                if loc is None or rim[fi]: continue
                s = d if (vv - loc).dot(nrm) >= 0 else -d
                if s < -0.012: continue
                mn = min(mn, s)
                if s < 0: n_in += 1; deepest = max(deepest, -s)
            sp = segp[key]
            row[key] = {"min_mm": mn * MM, "n_in": n_in, "deepest_mm": deepest * MM,
                        "x23": census(V, sp[1], sp[2]), "x12": census(V, sp[0], sp[1]),
                        "xst": census(V, sp[1] + sp[2], static)}
        rows.append(row)
        log("f%3d  green min %+6.2f mm (in %3d, deep %4.2f) x %d/%d/%d   human min %+6.2f mm (in %3d, deep %4.2f) x %d/%d/%d"
            % (f, row["green"]["min_mm"], row["green"]["n_in"], row["green"]["deepest_mm"],
               row["green"]["x23"], row["green"]["x12"], row["green"]["xst"],
               row["human"]["min_mm"], row["human"]["n_in"], row["human"]["deepest_mm"],
               row["human"]["x23"], row["human"]["x12"], row["human"]["xst"]))
    dump_json("sweep-%d-%d.json" % (f0, f1), rows)
    for key in RIGS:
        worst = min(rows, key=lambda r: r[key]["min_mm"])
        log("SWEEP %s: min %.2f mm at f%d, max inside verts %d, deepest %.2f mm, max face xsect 02x03 %d 01x02 %d thumb-x-static %d"
            % (key, worst[key]["min_mm"], worst["frame"], max(r[key]["n_in"] for r in rows), max(r[key]["deepest_mm"] for r in rows),
               max(r[key]["x23"] for r in rows), max(r[key]["x12"] for r in rows), max(r[key]["xst"] for r in rows)))
