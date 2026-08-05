"""Create the low-poly mine bat used by scene 2's collapse encounter."""
from pathlib import Path
import bpy


ROOT = Path(__file__).resolve().parents[2]


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.8
    return mat


def wing(name, points, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], [[0, 1, 2, 3]])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
fur = material("mine bat fur", (0.15, 0.10, 0.20))
membrane = material("mine bat wing", (0.30, 0.16, 0.33))

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(0, 0, 0.52))
body = bpy.context.object
body.name = "body"
body.scale = (0.27, 0.22, 0.38)
body.data.materials.append(fur)

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(0, -0.18, 0.72))
head = bpy.context.object
head.name = "head"
head.scale = (0.19, 0.18, 0.18)
head.data.materials.append(fur)

for x in (-0.10, 0.10):
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.10, depth=0.22, location=(x, -0.17, 0.90))
    ear = bpy.context.object
    ear.name = "ear"
    ear.data.materials.append(fur)

wing("left wing", [(0, 0, 0.68), (-0.95, 0.03, 0.98), (-0.78, 0.02, 0.28), (-0.22, 0, 0.45)], membrane)
wing("right wing", [(0, 0, 0.68), (0.95, 0.03, 0.98), (0.78, 0.02, 0.28), (0.22, 0, 0.45)], membrane)

blend = ROOT / "assets/blender/mine-bat-v01.blend"
glb = ROOT / "public/models/mine-bat-v01.glb"
blend.parent.mkdir(parents=True, exist_ok=True)
glb.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_apply=True, export_yup=True)
