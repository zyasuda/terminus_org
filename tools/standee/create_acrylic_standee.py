# 透明アクリル板の駒を、厚みのある1つのソリッドとして組み立ててGLBへ出す。
#
# 前回の版(v25初期案)は前後2枚の薄い印刷面で、板の外形と縁はテクスチャに
# 焼き込んでいた。今回は板を実体として持たせる。手順は次の4段。
#   1. scripts/build-lydia-acrylic.mjs が作った共通外形マスク(前後の和、
#      前後どちらの絵もこの中に収まっていることを検算済み)を読む。
#   2. マスク画素1個につき1クアッドのメッシュを作り(この時点では階段状)、
#      bmeshの境界エッジ(2連結)を辿って輪郭を取り出す。画素単位の輪郭を
#      そのまま押し出すと側面が黒いギザギザの帯になる(v12で失敗した形)ので、
#      必ず後段の平滑化を経由する。
#   3. 輪郭を間引いてChaikinで平滑化し、穴(脚の間など)を保ったまま
#      三角形化して面を作り直す。
#   4. Solidify(厚み)+Bevel(側面の丸み)を適用し、前面・背面それぞれの
#      UVで人物絵を貼る。背面はUV側で左右反転する(GLB実測: 背面は
#      u=1がworld x=-0.679に対応するため)。
#
# 使い方:
#   Blender --background --python tools/standee/create_acrylic_standee.py -- <name> <version> <height_units> <metres_per_tile>
#
# height_units はワールド単位での高さ。盤面のセル間隔が1ワールド単位なので、
# 「1マス何メートルか」(metres_per_tile)で割った値が渡ってくる。
# 実寸を直接渡していた頃は、1マス=150cmの盤面で人物が1.5倍に膨らんでいた
# (2026-08-25、リディアが258cmになっていた)。実寸はここでは使わず、記録だけする。
import bpy
import bmesh
import json
import math
import os
import sys

import numpy as np
from mathutils import Vector

PROJECT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
NAME, VERSION = argv[0], argv[1]
HEIGHT_U = float(argv[2])                                    # ワールド単位(=マス)での高さ
METRES_PER_TILE = float(argv[3]) if len(argv) > 3 else 1.0    # 1マスの実寸(m)
HEIGHT_M = HEIGHT_U * METRES_PER_TILE                        # 記録用の実寸

STANDEE = os.path.join(PROJECT, "assets", "standee")
FRONT_IMAGE = os.path.join(STANDEE, f"{NAME}-standee-{VERSION}-front.png")
BACK_IMAGE = os.path.join(STANDEE, f"{NAME}-standee-{VERSION}-back.png")
MASK_IMAGE = os.path.join(STANDEE, f"{NAME}-standee-{VERSION}-plate-mask.png")
LAYOUT = json.load(open(os.path.join(STANDEE, f"{NAME}-standee-{VERSION}.json")))
BLEND_PATH = os.path.join(PROJECT, "assets", "blender", f"{NAME}-standee-{VERSION}.blend")
GLB_PATH = os.path.join(PROJECT, "public", "models", f"{NAME}-standee-{VERSION}.glb")
FRONT_PREVIEW = os.path.join(PROJECT, "output", f"{NAME}-standee-{VERSION}-front.png")
BACK_PREVIEW = os.path.join(PROJECT, "output", f"{NAME}-standee-{VERSION}-back.png")

PLATE_THICKNESS_M = 0.06   # 実物のアクリル板の厚み相当
BEVEL_WIDTH_M = 0.006      # 側面の丸みの半径
CONTOUR_STEP_PX = 5        # 輪郭を間引く弧長間隔
CHAIKIN_ITERS = 1          # 平滑化の反復回数(多いと頂点が倍々に増える)
MORPH_OPEN_RADIUS_PX = 5   # 境界追跡が細い突起で詰まるのを防ぐオープニング半径


def load_mask(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    # Blenderの画像はy=0が下端。以後はこのままの座標系で扱い、UV化のときにだけ反転する。
    return (px[:, :, 0] > 0.5), w, h


def chamfer(mask):
    """各画素の最近傍の1画素までのチャンファー距離(4/8近傍)。マスクは2D bool配列。"""
    h, w = mask.shape
    dist = np.where(mask, 0.0, 1e9).astype(np.float32)
    for y in range(h):
        row, prow = dist[y], dist[y - 1] if y > 0 else None
        for x in range(w):
            if x > 0 and row[x - 1] + 1 < row[x]: row[x] = row[x - 1] + 1
            if prow is not None:
                if prow[x] + 1 < row[x]: row[x] = prow[x] + 1
                if x > 0 and prow[x - 1] + 1.5 < row[x]: row[x] = prow[x - 1] + 1.5
                if x < w - 1 and prow[x + 1] + 1.5 < row[x]: row[x] = prow[x + 1] + 1.5
    for y in range(h - 1, -1, -1):
        row, nrow = dist[y], dist[y + 1] if y < h - 1 else None
        for x in range(w - 1, -1, -1):
            if x < w - 1 and row[x + 1] + 1 < row[x]: row[x] = row[x + 1] + 1
            if nrow is not None:
                if nrow[x] + 1 < row[x]: row[x] = nrow[x] + 1
                if x < w - 1 and nrow[x + 1] + 1.5 < row[x]: row[x] = nrow[x + 1] + 1.5
                if x > 0 and nrow[x - 1] + 1.5 < row[x]: row[x] = nrow[x - 1] + 1.5
    return dist


def morphological_open(mask, radius):
    """幅が2*radius未満の細い突起を消す。境界追跡が1px幅の先端で
    小さな輪に嵌る事故(頭頂などで実測済み)を防ぐための前処理。"""
    outside = ~mask
    eroded = chamfer(outside) >= radius
    dilated = chamfer(eroded) <= radius
    return dilated


def trace_boundary_loops(mask):
    """マスク画素1個につき1クアッドのメッシュを作り、bmeshの境界エッジを
    2連結の単純ループとして辿る。Moore-Neighborの自前実装は停止条件を
    誤ると小さな輪に嵌るので、境界エッジという確定した位相情報を使う。"""
    bm = bmesh.new()
    vert_at = {}

    def vkey(x, y):
        v = vert_at.get((x, y))
        if v is None:
            v = bm.verts.new((x, y, 0.0))
            vert_at[(x, y)] = v
        return v

    ys, xs = np.nonzero(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        v0, v1, v2, v3 = vkey(x, y), vkey(x + 1, y), vkey(x + 1, y + 1), vkey(x, y + 1)
        try:
            bm.faces.new((v0, v1, v2, v3))
        except ValueError:
            pass

    bm.verts.index_update()
    bm.edges.ensure_lookup_table()
    boundary_edges = [e for e in bm.edges if e.is_boundary]
    coord = {v.index: (v.co.x, v.co.y) for v in bm.verts}

    adj = {}
    for e in boundary_edges:
        a, b = e.verts[0].index, e.verts[1].index
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)

    visited = set()
    loops = []
    for e in boundary_edges:
        a, b = e.verts[0].index, e.verts[1].index
        key = frozenset((a, b))
        if key in visited:
            continue
        loop = [a, b]
        visited.add(key)
        cur = b
        guard = 0
        while guard < 2_000_000:
            guard += 1
            nxt = None
            for n in adj.get(cur, []):
                k = frozenset((cur, n))
                if k in visited:
                    continue
                nxt = n
                visited.add(k)
                break
            if nxt is None:
                break
            if nxt == loop[0]:
                break
            loop.append(nxt)
            cur = nxt
        loops.append([coord[i] for i in loop])
    bm.free()
    return loops


def thin_and_smooth(points, step, iters):
    thinned = [points[0]]
    acc = 0.0
    for i in range(1, len(points)):
        px, py = points[i - 1]
        x, y = points[i]
        acc += math.hypot(x - px, y - py)
        if acc >= step:
            thinned.append(points[i])
            acc = 0.0
    p = thinned
    for _ in range(iters):
        out = []
        n = len(p)
        for i in range(n):
            ax, ay = p[i]
            bx, by = p[(i + 1) % n]
            out.append((ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25))
            out.append((ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75))
        p = out
    return p


def build_flat_mesh(loops_xy, w, h):
    """平滑化済みの外形+穴ループから、UV付きの平らなメッシュを作る。"""
    bm = bmesh.new()
    all_edges = []
    for loop in loops_xy:
        verts = [bm.verts.new((x, y, 0.0)) for x, y in loop]
        for i in range(len(verts)):
            e = bm.edges.new((verts[i], verts[(i + 1) % len(verts)]))
            all_edges.append(e)
    bm.verts.index_update()
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=all_edges)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(2.0), verts=bm.verts, edges=bm.edges)

    # 境界ループの巻き順次第で面の法線がZ+/Z-のどちらにもなり得る。
    # 90度回転後にfront面(Z+側)がY-(手前)へ来るよう、ここでZ+に統一する。
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))

    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            x, y = loop.vert.co.x, loop.vert.co.y
            loop[uv_layer].uv = (x / w, y / h)  # 画像はy=0が下端なのでそのままVに使える

    mesh = bpy.data.meshes.new(f"{NAME}_{VERSION}_FlatMesh")
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def image_material(name, path, uv_name, flip_u=False, single_sided=True):
    image = bpy.data.images.load(path, check_existing=True)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = single_sided
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    uvmap = nodes.new("ShaderNodeUVMap")
    uvmap.uv_map = uv_name
    if flip_u:
        combine = nodes.new("ShaderNodeCombineXYZ")
        separate = nodes.new("ShaderNodeSeparateXYZ")
        one_minus = nodes.new("ShaderNodeMath")
        one_minus.operation = "SUBTRACT"
        one_minus.inputs[0].default_value = 1.0
        links.new(uvmap.outputs["UV"], separate.inputs["Vector"])
        links.new(separate.outputs["X"], one_minus.inputs[1])
        links.new(one_minus.outputs["Value"], combine.inputs["X"])
        links.new(separate.outputs["Y"], combine.inputs["Y"])
        links.new(combine.outputs["Vector"], tex.inputs["Vector"])
    else:
        links.new(uvmap.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.35
    try:
        material.surface_render_method = "BLENDED"
    except AttributeError:
        material.blend_method = "BLEND"
    return material


def rim_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.87, 0.93, 0.96, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.15
    bsdf.inputs["Alpha"].default_value = 0.35
    try:
        material.surface_render_method = "BLENDED"
    except AttributeError:
        material.blend_method = "BLEND"
    return material


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


# --- 1. マスクを読み、突起を消してから境界を辿る ---
mask, mw, mh = load_mask(MASK_IMAGE)
opened = morphological_open(mask, MORPH_OPEN_RADIUS_PX)
loops = trace_boundary_loops(opened)
loops.sort(key=len, reverse=True)
if not loops:
    raise RuntimeError("境界ループが取れなかった")
print("輪郭ループ", [len(l) for l in loops])

# --- 2. 間引き+平滑化 ---
smoothed_loops = [thin_and_smooth(loop, CONTOUR_STEP_PX, CHAIKIN_ITERS) for loop in loops]
print("平滑化後の頂点数", [len(l) for l in smoothed_loops])

# --- 3. 平らなメッシュを作る ---
flat_mesh = build_flat_mesh(smoothed_loops, mw, mh)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

obj = bpy.data.objects.new(f"{NAME}_standee_{VERSION}", flat_mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# --- 4. スケール。人物の枠(figure)の高さをHEIGHT_U(ワールド単位)に合わせ、足元をZ=0にする ---
fx0, fy0, fx1, fy1 = LAYOUT["figure"]
pixel_m = HEIGHT_U / (fy1 - fy0)
obj.scale = (pixel_m, pixel_m, pixel_m)
obj.rotation_euler = (math.radians(90), 0, 0)  # ピクセル平面(XY)をXZ平面(Blenderの高さ)へ
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# 足元(画像のfy1、下端がy軸正方向であることに注意: 画像は上が高いy値ではなく
# bpy.data.imagesのpixelsはy=0が画像の下端なので、fy1(figureの下端=足元)は
# 元画像の行番号。ロード時の反転有無を実測して補正する。
# LAYOUT["figure"]はNode.js側の通常ラスタ座標(y=0が画像の上端=頭頂側)。
# 一方bpy.data.images.pixelsはy=0が画像の下端(v軸)なので、境界追跡で得た
# メッシュのy座標はラスタ座標を上下反転したものになっている。回転後は
# そのままメッシュのz座標(高さ)になるため、足元のz座標は (mh - fy1) であり、
# fy0(頭頂のラスタ座標)をそのまま引くと足元が浮く(実測で約6cmのズレ)。
obj.location.z -= (mh - fy1) * pixel_m
obj.location.x -= (fx0 + fx1) / 2 * pixel_m
bpy.context.view_layer.update()

# --- マテリアル: [0]front [1]rim [2]back ---
front_mat = image_material(f"{NAME}_{VERSION}_Front", FRONT_IMAGE, "UVMap", flip_u=False)
rim_mat = rim_material(f"{NAME}_{VERSION}_Rim")
back_mat = image_material(f"{NAME}_{VERSION}_Back", BACK_IMAGE, "UVMap", flip_u=True)
obj.data.materials.append(front_mat)
obj.data.materials.append(rim_mat)
obj.data.materials.append(back_mat)
for poly in obj.data.polygons:
    poly.material_index = 0

solidify = obj.modifiers.new("Thickness", "SOLIDIFY")
solidify.thickness = PLATE_THICKNESS_M
solidify.offset = 0
# Solidifyの命名はやや紛らわしい: material_offsetは「生成される反対側の面」
# (=裏面)、material_offset_rimは「側面(rim)」に適用される。実測でpoly数の
# 内訳(front=輪郭内部の三角形数、側面=輪郭長に比例した細長い面の数)を見て
# 確認済み。逆にすると裏面と側面のマテリアルが入れ替わる。
solidify.material_offset = 2       # 生成される裏面 → back_mat
solidify.material_offset_rim = 1   # 側面(rim) → rim_mat

bevel = obj.modifiers.new("Round", "BEVEL")
bevel.width = BEVEL_WIDTH_M
bevel.segments = 4
bevel.limit_method = "ANGLE"
bevel.angle_limit = math.radians(51)

bpy.context.view_layer.objects.active = obj
for mod_name in ("Thickness", "Round"):
    bpy.ops.object.modifier_apply(modifier=mod_name)

obj["asset_type"] = "acrylic_plate_standee_solid"
obj["height_units"] = HEIGHT_U
obj["metres_per_tile"] = METRES_PER_TILE
obj["height_m"] = HEIGHT_M
obj["plate_thickness_m"] = PLATE_THICKNESS_M

# --- プレビュー撮影 ---
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = scene.render.resolution_y = 700
scene.render.image_settings.file_format = "PNG"
scene.world.color = (0.012, 0.018, 0.032)
for light_name, loc, energy in (("Key", (-2.4, -3.4, 4.0), 520), ("Fill", (2.4, -2.0, 2.2), 220), ("Rim", (1.2, 3.5, 3.5), 340)):
    data = bpy.data.lights.new(light_name, "AREA")
    data.energy, data.shape, data.size = energy, "DISK", 3.2
    light_obj = bpy.data.objects.new(light_name, data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.location = loc
    look_at(light_obj, (0, 0, HEIGHT_U / 2))

for cam_name, location, path in (
    ("Preview_Front", (0.0, -2.6, HEIGHT_U * 0.55), FRONT_PREVIEW),
    ("Preview_Back", (0.0, 2.6, HEIGHT_U * 0.55), BACK_PREVIEW),
):
    camera_data = bpy.data.cameras.new(cam_name)
    camera_data.lens = 58
    camera = bpy.data.objects.new(cam_name, camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = location
    look_at(camera, (0, 0, HEIGHT_U * 0.55))
    scene.camera = camera
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=True, export_materials="EXPORT", export_image_format="AUTO")
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
print("ACRYLIC_STANDEE_SOLID_CREATED", GLB_PATH)
