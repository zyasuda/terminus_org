"""Create the first shared low-poly character models for Gareth and Lydia."""
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


def build(name, coat_color, hair_color, accent_color):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    coat = material(f"{name} coat", coat_color)
    hair = material(f"{name} hair", hair_color)
    skin = material(f"{name} skin", (0.72, 0.48, 0.34))
    accent = material(f"{name} accent", accent_color)

    mesh(bpy.ops.mesh.primitive_cone_add, "torso", (0, 0, 0.72), (0.34, 0.34, 0.62), coat, vertices=4, radius1=1, radius2=0.72, depth=1)
    for x in (-0.14, 0.14):
        mesh(bpy.ops.mesh.primitive_cube_add, "leg", (x, 0, 0.25), (0.1, 0.1, 0.27), coat)
    # 首と襟を胴体・頭部へ重ね、低ポリでも頭が浮かない人型にする。
    mesh(bpy.ops.mesh.primitive_cylinder_add, "neck", (0, 0, 1.30), (0.11, 0.11, 0.18), skin, vertices=6, radius=1, depth=1)
    mesh(bpy.ops.mesh.primitive_cone_add, "collar", (0, 0, 1.25), (0.25, 0.23, 0.16), coat, vertices=4, radius1=1, radius2=0.68, depth=1)
    mesh(bpy.ops.mesh.primitive_ico_sphere_add, "head", (0, 0, 1.40), (0.24, 0.22, 0.25), skin, subdivisions=1, radius=1)
    mesh(bpy.ops.mesh.primitive_ico_sphere_add, "hair", (0, 0.02, 1.56), (0.25, 0.23, 0.14), hair, subdivisions=1, radius=1)
    for x in (-0.4, 0.4):
        arm = mesh(bpy.ops.mesh.primitive_cone_add, "arm", (x, 0, 0.85), (0.09, 0.09, 0.34), coat, vertices=4, radius1=1, radius2=0.8, depth=1)
        arm.rotation_euler[1] = -x * 0.7
    mesh(bpy.ops.mesh.primitive_cube_add, "charm", (0, -0.32, 0.9), (0.1, 0.04, 0.12), accent)

    blend = ROOT / "assets/blender" / f"{name}-v01.blend"
    glb = ROOT / "public/models" / f"{name}-v01.glb"
    blend.parent.mkdir(parents=True, exist_ok=True)
    glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_apply=True, export_yup=True)


build("gareth", (0.10, 0.24, 0.42), (0.07, 0.08, 0.12), (0.78, 0.56, 0.16))
build("lydia", (0.28, 0.16, 0.38), (0.22, 0.10, 0.12), (0.26, 0.72, 0.75))
