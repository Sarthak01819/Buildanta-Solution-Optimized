import bpy, math
from mathutils import Vector
import os
_BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_BASE, "out")
bpy.ops.wm.open_mainfile(filepath=OUT + "/newhands_site.blend")
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 40, 100
for n, rgb in (("GreenHand", (0.10, 0.66, 0.30, 1)), ("HumanHand", (0.90, 0.68, 0.55, 1))):
    ob = bpy.data.objects[n]
    m = bpy.data.materials.new(n + "M"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgb
    b.inputs["Roughness"].default_value = 0.40
    ob.data.materials.clear(); ob.data.materials.append(m)
cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam); scene.camera = cam
for rot, e in (((0.8, 0.2, -0.35), 3.2), ((1.9, -0.4, 2.6), 1.5)):
    ld = bpy.data.lights.new("L", "SUN"); ld.energy = e
    lo = bpy.data.objects.new("L", ld); lo.rotation_euler = rot
    scene.collection.objects.link(lo)
w = bpy.data.worlds.new("W"); w.color = (0.66, 0.76, 0.82); scene.world = w
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1100; scene.render.resolution_y = 640
cam.location = Vector((0.05, -1.55, 0.30))
dv = Vector((0, 0, 0.02)) - cam.location
cam.rotation_euler = dv.to_track_quat("-Z", "Z").to_euler()
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT + "/mov/f_"
bpy.ops.render.render(animation=True)
print("[v] done", flush=True)
