"""Export the mesh objects in the open Blender file as a game-ready GLB."""
from pathlib import Path
import bpy


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/models/rust-eater-v01.glb"

bpy.ops.object.select_all(action="DESELECT")
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
)
