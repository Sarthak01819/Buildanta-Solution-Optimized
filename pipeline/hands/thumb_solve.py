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
# <= 0.15 rad, CMC total <= 60 deg. These are also HARD search bounds (LO/HI).
LIM = dict(cmc_total=math.radians(60), mcp_flex=math.radians(55),
           mcp_side=0.15, ip_lo=0.0, ip_hi=math.radians(15))

# ── score weights (tuned by LOOKING at the renders; see the report in git log)
# Round 2 adds: straight (bend angle .02 vs .03, rad^2), skin (same on the
# skin PCA axes), across (rod . index/middle middle-phalanx axes, should be 0),
# fwd (rod should point toward the knuckles, not dangle down beside the index),
# xsect (per intersecting face pair, from the BVH census). The nail term is
# capped at 20 mm so a far thumb does not out-vote the orientation terms.
# Round-2 weights, settled by looking at solve2/vA..vE (9 Sep 2026): the
# round-1 nail term (2.5e6) dragged the tip to the bottom of the fist and made
# the thumb DANGLE (rod 0.63 palmar); at 2.5e5 it still lands 1.7 mm off the
# nail but the orientation terms decide the pose. ori_perp / ori_ulnar are 0:
# they measured thumb.03 against the index DISTAL phalanx, which is tucked
# into the palm in this fist -- unsatisfiable with a straight thumb, and they
# only distorted the search (reported, not scored). lim=3000 makes the CMC
# 60 deg limit firm (at 60 it drifted to 64-68 deg).
W = dict(pen=4.0e6, cap=6.0e6, nail=2.5e5, lat=1.0e5, out=1.0e7,
         ori_perp=0.0, ori_ulnar=0.0, lim=3000.0,
         straight=150.0, skin=0.0, across=10.0, fwd=40.0, rodulnar=300.0, down=800.0,
         behind=2.0e6, xsect=25.0)
# skin=0: the .03 skin PCA axis is too noisy on a short bulbous segment (reported only)
NAIL_CAP = 0.020
FWD_TARGET = float(arg("--fwd", 0.35))          # rod . F(palm->knuckles) at least this (tip toward the other fist)
ULNAR_TARGET = float(arg("--ulnar", 0.55))      # thumb.03 axis . ulnar at least this (reported only, weight 0)
RODULNAR_TARGET = float(arg("--rodulnar", 0.6)) # whole rod . ulnar at least this (across index AND middle)
DOWN_LO, DOWN_HI = float(arg("--downlo", 0.05)), float(arg("--downhi", 0.25))  # rod . palmar: slightly down, never dorsal
BEHIND_MM = float(arg("--behind", 4.0))         # thumb tip at least this far behind the knuckle contact plane
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
        # rim = static faces in the thumb blend zone (the edge of the hole the
        # thumb leaves in the palm). Never a real collision target for the
        # distal thumb, but their normals face away from thumb.02 verts 12 mm
        # off and read as phantom "inside" -- so they are skipped
        self.static_rim = np.array([any(self.w_thumb[i] > 0.05 for i in p) for p in self.static_polys])
        self.idx3_polys = [p for p in self.polys if all(self.w_idx[2][i] > 0.5 for i in p)]
        # per-segment thumb faces for the face-intersection census
        self.seg_polys = [group_polys(self.polys, self.w_t[j]) for j in range(3)]
        self.flex_sign = self.measure_flex_sign()
        self.rest_bend = with_rest_pose(self.arm, lambda: angle_deg(bone_axis(self.arm, tb(1)), bone_axis(self.arm, tb(2))))
        self.classify_rest()
        self.refresh()

    GROUPS = ("DEF-thumb", tb(0), tb(1), tb(2), fb("f_index", 1), fb("f_index", 2), "DEF-palm", HAND)

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
    def refresh(self):
        P = eval_mesh(self.ob)
        self.P_static = P
        V = [Vector(p) for p in P]
        self.bvh = BVHTree.FromPolygons(V, self.static_polys, all_triangles=False)
        i3 = self.grp[fb("f_index", 2)]; i2 = self.grp[fb("f_index", 1)]
        self.i3_c = P[i3].mean(axis=0)
        self.i3_axis = pca_axis(P[i3], self.i3_c - P[i2].mean(axis=0))
        self.nail_pt = P[self.nail_idx].mean(axis=0)
        self.i3_dorsal = unit(perp(self.nail_pt - self.i3_c, self.i3_axis))
        rel = P[i3] - self.i3_c
        self.i3_radius = float(np.median(np.linalg.norm(rel - np.outer(rel @ self.i3_axis, self.i3_axis), axis=1)))
        nail_set = set(self.nail_idx.tolist())
        npolys = [p for p in self.idx3_polys if sum(1 for i in p if i in nail_set) >= len(p) - 1]
        self.bvh_nail = BVHTree.FromPolygons(V, npolys, all_triangles=False)
        # across-the-fingers (ulnar) direction at the middle phalanges
        self.ulnar = unit(P[self.grp[fb("f_pinky", 1)]].mean(axis=0) - P[self.grp[fb("f_index", 1)]].mean(axis=0))
        # middle-phalanx axes of index and middle (the rod must cross these)
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
    def measure(self, P=None, bvh=None, bvh_nail=None, test_idx=None, pad_idx=None, seg3=None, seg2=None, allow=ALLOW, rim=None,
                seg_polys=None, static_polys=None, V=None):
        if P is None: P = eval_mesh(self.ob)
        bvh = bvh or self.bvh; bvh_nail = bvh_nail or self.bvh_nail
        rim = self.static_rim if rim is None else rim
        test_idx = self.test_idx if test_idx is None else test_idx
        pad_idx = self.pad_idx if pad_idx is None else pad_idx
        seg3 = self.seg_idx[2] if seg3 is None else seg3
        seg2 = self.seg_idx[1] if seg2 is None else seg2
        seg_polys = self.seg_polys if seg_polys is None else seg_polys
        static_polys = self.static_polys if static_polys is None else static_polys
        T = P[test_idx]
        pen = 0.0; minclear = 1e9; n_in = 0; deepest = 0.0; dbg = []
        for v in T:
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
            inside = r - seg_dist(T, A, B); m = inside[inside > 0]
            if len(m): cap += float(np.sum(m ** 2)); capdeep = max(capdeep, float(m.max()))
        dn = 1e9
        for v in P[pad_idx]:
            loc, nrm, _, d = bvh_nail.find_nearest(Vector(v))
            if loc is not None and d < dn: dn = d
        c3 = P[seg3].mean(axis=0); c2 = P[seg2].mean(axis=0)
        o = c3 - self.nail_pt
        along = float(np.dot(o, self.i3_dorsal))
        lateral = float(np.linalg.norm(o - self.i3_dorsal * along))
        t3_axis = pca_axis(P[seg3], c3 - c2)
        t2_axis = unit(c3 - P[self.seg_idx[0]].mean(axis=0)) if seg2 is self.seg_idx[1] else unit(c3 - c2)
        # ── round 2: straightness + rod orientation + face census ──────────
        b2 = bone_axis(self.arm, tb(1)); b3 = bone_axis(self.arm, tb(2))
        bend = angle_deg(b2, b3)                          # world angle .02 vs .03 bone axes
        s2_axis = pca_axis(P[seg2], c3 - c2)              # .02 skin axis, proximal -> distal
        skin_bend = angle_deg(s2_axis, t3_axis)           # same on the skin PCA axes
        rod = pca_axis(P[np.concatenate([seg2, seg3])], c3 - c2)   # the .02-.03 rod, proximal -> tip
        across = float(math.hypot(np.dot(rod, self.i2_axis), np.dot(rod, self.m2_axis)))  # 0 = perpendicular to both
        fwd = float(np.dot(rod, self.F)); down = float(np.dot(rod, self.palmar)); rod_ulnar = float(np.dot(rod, self.ulnar))
        # thumb tip vs the knuckle plane: the tip must stay BEHIND the fist's
        # contact face (the reference leaves a V notch; the thumbs never touch)
        tip_f = float(((P[seg3] - self.knuckle_c) @ self.F).max())
        tip_behind = self.knuckle_front - tip_f
        if V is None: V = [Vector(p) for p in P]
        x23 = census(V, seg_polys[1], seg_polys[2]); x12 = census(V, seg_polys[0], seg_polys[1])
        xst = census(V, seg_polys[1] + seg_polys[2], static_polys)
        return dict(pen=pen, minclear=minclear, n_in=n_in, deepest=deepest, cap=cap, capdeep=capdeep,
                    d_nail=dn, along=along, lateral=lateral,
                    perp=float(np.dot(t3_axis, self.i3_axis)), ulnar=float(np.dot(t3_axis, self.ulnar)),
                    ulnar2=float(np.dot(t2_axis, self.ulnar)),
                    bend=bend, skin_bend=skin_bend, across=across, fwd=fwd, down=down, rod_ulnar=rod_ulnar,
                    tip_behind=tip_behind, nail_palmar=float(np.dot(self.i3_dorsal, self.palmar)),
                    x23=x23, x12=x12, xst=xst)

    def score(self, m, x):
        s = W["pen"] * m["pen"] + W["cap"] * m["cap"]
        s += W["nail"] * (min(m["d_nail"], NAIL_CAP) - NAIL_TARGET) ** 2
        s += W["lat"] * max(0.0, m["lateral"] - 0.006) ** 2
        s += W["out"] * max(0.0, -m["along"]) ** 2
        s += W["ori_perp"] * m["perp"] ** 2
        s += W["ori_ulnar"] * max(0.0, ULNAR_TARGET - m["ulnar"]) ** 2
        # round 2: straight rod, across the fingers, pointing at the knuckles
        s += W["straight"] * math.radians(m["bend"]) ** 2
        s += W["skin"] * math.radians(m["skin_bend"]) ** 2
        s += W["across"] * m["across"] ** 2
        s += W["fwd"] * max(0.0, FWD_TARGET - m["fwd"]) ** 2
        s += W["rodulnar"] * max(0.0, RODULNAR_TARGET - m["rod_ulnar"]) ** 2
        s += W["down"] * (max(0.0, DOWN_LO - m["down"]) ** 2 + max(0.0, m["down"] - DOWN_HI) ** 2)
        s += W["behind"] * max(0.0, BEHIND_MM / MM - m["tip_behind"]) ** 2
        s += W["xsect"] * (m["x23"] + m["x12"] + m["xst"])
        cmc = Euler((x[0], x[1], x[2]), "XYZ").to_quaternion().angle
        lim = max(0.0, cmc - LIM["cmc_total"]) ** 2 + max(0.0, -x[0]) ** 2
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
        log("%-24s d_nail %5.2f mm | clear %+5.2f mm (in %3d, deepest %4.2f) | cap %4.2f | "
            "along %+5.1f lat %4.1f | perp %+.2f ulnar %+.2f/%+.2f | CMC %4.1f MCP %4.1f IP %4.1f deg"
            % (label, m["d_nail"] * MM, m["minclear"] * MM, m["n_in"], m["deepest"] * MM, m["capdeep"] * MM,
               m["along"] * MM, m["lateral"] * MM, m["perp"], m["ulnar"], m["ulnar2"], cmc, mcp, ip))
        log("%-24s bend %4.1f deg (skin %4.1f, rest %4.1f) | rod: fwd %+.2f down %+.2f ulnar %+.2f across %.2f | "
            "tip behind knuckles %+.1f mm | xsect 02x03 %d 01x02 %d thumb-x-static %d | nail.palmar %+.2f"
            % ("", m["bend"], m["skin_bend"], self.rest_bend, m["fwd"], m["down"], m["rod_ulnar"], m["across"],
               m["tip_behind"] * MM, m["x23"], m["x12"], m["xst"], m["nail_palmar"]))

    # true (subsurf ON) measurement on the subdivided skin, using its own
    # interpolated deform weights (no nearest-vertex transfer: that misfiles
    # nail verts as pad verts once the two skins are 2 mm apart)
    def measure_true(self):
        subsurf(True)
        try:
            if not hasattr(self, "_sub_sets"):
                def go():
                    P0, W0 = eval_mesh(self.ob, groups=self.GROUPS)
                    return self.classify(P0, W0)
                self._sub_sets = with_rest_pose(self.arm, go)
            pad_idx, nail_idx = self._sub_sets
            P, polys, W_ = eval_mesh(self.ob, with_polys=True, groups=self.GROUPS)
            w_th = W_["DEF-thumb"]
            test_idx = np.where((W_[tb(1)] > 0.5) | (W_[tb(2)] > 0.5))[0]
            seg3 = np.where(W_[tb(2)] > 0.5)[0]; seg2 = np.where(W_[tb(1)] > 0.5)[0]
            V = [Vector(p) for p in P]
            static = [p for p in polys if all(w_th[i] <= 0.5 for i in p)]
            rim = np.array([any(w_th[i] > 0.05 for i in p) for p in static])
            bvh = BVHTree.FromPolygons(V, static, all_triangles=False)
            nail = np.zeros(len(P), dtype=bool); nail[nail_idx] = True
            npolys = [p for p in polys if sum(1 for i in p if nail[i]) >= len(p) - 1]
            bvh_nail = BVHTree.FromPolygons(V, npolys, all_triangles=False)
            seg_polys = [group_polys(polys, W_[tb(j)]) for j in range(3)]
            return self.measure(P, bvh=bvh, bvh_nail=bvh_nail, test_idx=test_idx, pad_idx=pad_idx,
                                seg3=seg3, seg2=seg2, allow=0.0, rim=rim,
                                seg_polys=seg_polys, static_polys=static, V=V)
        finally:
            subsurf(False)

# ───────────────────────────── search ──────────────────────────────────────
# Round 2 HARD bounds: MCP side/twist +-0.15, IP 0..15 deg, MCP flex <= 55 deg
# (round 1 allowed +-0.35 / 0.20..1.45 / 1.10 -- that is the hook the client
# rejected). thumb.03 Y and Z are never searched: they stay 0.
LO = np.array([0.0, -1.1, -1.1, 0.0, -LIM["mcp_side"], -LIM["mcp_side"], LIM["ip_lo"]])
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

def shoot(cam, rig, tag, views=None, solo=True, r=0.40):
    """6 large clay views of one hand, framed from the SKIN (thumbside, front =
    fist face, dorsal, palm, thumb45, thumbdorsal45) with the hand's DORSUM as
    image-up, plus 'pair' (both fists from the thumb side of this one)."""
    arm = rig.arm
    others = [bpy.data.objects[mn] for an, mn in RIGS.values() if an != arm.name]
    for o in others: o.hide_render = solo
    P = eval_mesh(rig.ob)
    H = Vector(P[rig.palm_idx].mean(axis=0))
    K = Vector((P[rig.grp[fb("f_middle", 0)]].mean(axis=0) + P[rig.grp[fb("f_index", 0)]].mean(axis=0)) / 2)
    F = (K - H).normalized()
    N = Vector(rig.N); N = (N - F * N.dot(F)).normalized()      # dorsal (measured from the phalanges)
    Td = Vector(-rig.ulnar); Td = (Td - F * Td.dot(F) - N * Td.dot(N)).normalized()   # radial = thumb side
    ctr = (H + K) / 2 + F * 0.02
    all_views = {"thumbside": (Td, N), "front": (F, N), "dorsal": (N, -F), "palm": (-N, F),
                 "thumb45": ((Td + F).normalized(), N), "thumbdorsal45": ((Td + N).normalized(), N)}
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
        m = r.measure(); r.report(m, x, "%s cage" % r.key)
        mt = r.measure_true(); r.report(mt, x, "%s SUBSURF" % r.key)
        cmc, mcp, ip = r.joints_deg(x)
        res[r.key] = {"eulers": r.triples(), "cage": m, "true": mt, "rest_bend_deg": r.rest_bend,
                      "cmc_total_deg": cmc, "mcp_deg": mcp, "ip_deg": ip}
        if cam: res[r.key]["renders"] = shoot(cam, r, "%s-%s" % (tag, r.key))
    if TRANSPLANT:
        transplant(human.arm, green.arm, CLOSING)
        ht = Rig("human", tag="human-transplanted")
        m = ht.measure(); ht.report(m, green.get_params(), "transplant cage")
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
        m = r.measure(); r.report(m, r.get_params(), key + " current")
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
        m = r.measure(); r.report(m, r.get_params(), key + " current")
        out[key] = dict(rows=rows, tuck=tuck, knuckle_front_mm=r.knuckle_front * MM,
                        bone_frame=dict(x_radial=float(np.dot(x, -r.ulnar)), z_dorsal=float(np.dot(z, r.N))))
    dump_json("geom-f%d.json" % FRAME, out)

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
        m = r.measure(); r.report(m, x, r.tag + " cage")
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
