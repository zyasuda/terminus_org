"""Create the first low-poly replacement candidate for mock2's Rust Eater."""
from math import radians
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "assets/blender/rust-eater-v01.blend"
RENDER_PATH = ROOT / "assets/_staging/low-poly-rust-eater/low-poly-rust-eater-v01.png"


def material(name, color, metallic=0.0, roughness=0.6):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


RUST = material("Rust iron", (0.22, 0.055, 0.018), metallic=0.75, roughness=0.45)
STEEL = material("Dark iron", (0.045, 0.055, 0.065), metallic=0.9, roughness=0.35)
GLOW = material("Amber eye", (1.0, 0.15, 0.005), metallic=0.0, roughness=0.25)
GLOW.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1.0, 0.025, 0.0, 1)
GLOW.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 5.0


def add_ico(name, loc, scale, mat, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    return obj


def add_cube(name, loc, scale, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Small bevel", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 1
    return obj


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_leg(side, index):
    y = 0.32 - index * 0.34
    root = Vector((side * 0.95, y, 0.25))
    knee = Vector((side * (1.65 + index * 0.12), y - 0.16, -0.55))
    foot = Vector((side * (2.15 + index * 0.16), y - 0.62, -1.0))
    for segment, start, end in (("upper", root, knee), ("lower", knee, foot)):
        mid = (start + end) / 2
        length = (end - start).length
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.16, radius2=0.10, depth=length, location=mid)
        obj = bpy.context.object
        obj.name = f"leg_{side}_{index}_{segment}"
        obj.data.materials.append(STEEL)
        obj.rotation_euler = (end - start).to_track_quat("Z", "Y").to_euler()


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # Low-poly silhouette: body, shell plates, eight segmented legs and two eyes.
    add_ico("abdomen", (0, 0.35, 0), (1.65, 1.1, 0.75), RUST, 2)
    add_ico("head", (0, -1.0, -0.05), (0.9, 0.7, 0.6), STEEL, 1)
    for i, x in enumerate((-0.75, 0, 0.75)):
        add_cube(f"shell_plate_{i}", (x, 0.38, 0.72), (0.54, 0.75, 0.10), RUST, (radians(16), radians(-x * 9), radians(x * 10)))
    for side in (-1, 1):
        for i in range(4):
            add_leg(side, i)
        add_ico(f"eye_{side}", (side * 0.36, -1.58, 0.04), (0.13, 0.09, 0.13), GLOW, 1)

    bpy.ops.object.light_add(type="AREA", location=(-4, -4, 7))
    key = bpy.context.object
    key.data.energy = 1000
    key.data.shape = "DISK"
    key.data.size = 5
    key.data.color = (1.0, 0.34, 0.08)
    aim(key, (0, 0, 0))
    bpy.ops.object.light_add(type="AREA", location=(4, 1, 4))
    fill = bpy.context.object
    fill.data.energy = 700
    fill.data.size = 4
    fill.data.color = (0.15, 0.35, 1.0)
    aim(fill, (0, 0, 0))

    bpy.ops.object.camera_add(location=(6.8, -10.5, 4.8))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 7.0
    aim(camera, (0, -0.1, -0.05))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1536
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.world.color = (0.01, 0.01, 0.01)
    scene.render.filepath = str(RENDER_PATH)

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    RENDER_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.render.render(write_still=True)


main()
