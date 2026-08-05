"""Create the low-poly lantern keeper for the light chamber."""
from pathlib import Path
import bpy


ROOT = Path(__file__).resolve().parents[2]


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    return mat


def mesh(op, name, location, scale, mat, **kwargs):
    op(location=location, **kwargs)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    return obj


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
cloak = material("guardian cloak", (0.13, 0.22, 0.26))
skin = material("guardian face", (0.42, 0.36, 0.29))
light = material("guardian heart", (0.18, 0.68, 0.78))

mesh(bpy.ops.mesh.primitive_cone_add, "cloak", (0, 0, 0.82), (0.42, 0.36, 0.78), cloak, vertices=5, radius1=1, radius2=0.58, depth=1)
# 首と襟をローブの頂点に重ね、頭が浮いて見えない人型シルエットにする。
mesh(bpy.ops.mesh.primitive_cylinder_add, "neck", (0, 0, 1.42), (0.12, 0.12, 0.24), skin, vertices=6, radius=1, depth=1)
mesh(bpy.ops.mesh.primitive_cone_add, "high collar", (0, 0, 1.40), (0.30, 0.27, 0.20), cloak, vertices=5, radius1=1, radius2=0.72, depth=1)
mesh(bpy.ops.mesh.primitive_ico_sphere_add, "head", (0, 0, 1.54), (0.25, 0.22, 0.27), skin, subdivisions=1, radius=1)
mesh(bpy.ops.mesh.primitive_ico_sphere_add, "hood", (0, 0.03, 1.68), (0.31, 0.27, 0.20), cloak, subdivisions=1, radius=1)
mesh(bpy.ops.mesh.primitive_ico_sphere_add, "heart light", (0, -0.33, 1.03), (0.13, 0.06, 0.13), light, subdivisions=1, radius=1)
for x in (-0.12, 0.12):
    mesh(bpy.ops.mesh.primitive_cube_add, "leg", (x, 0, 0.28), (0.11, 0.11, 0.28), cloak)

blend = ROOT / "assets/blender/guardian-v01.blend"
glb = ROOT / "public/models/guardian-v01.glb"
blend.parent.mkdir(parents=True, exist_ok=True)
glb.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_apply=True, export_yup=True)
