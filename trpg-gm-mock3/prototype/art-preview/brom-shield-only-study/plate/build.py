import bpy, bmesh, json, math, os, numpy as np
FRONT_IMAGE='/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/prototype/art-preview/brom-shield-only-study/plate/front.png'
BACK_IMAGE='/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/prototype/art-preview/brom-shield-only-study/plate/back.png'
MASK_IMAGE='/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/prototype/art-preview/brom-shield-only-study/plate/plate-mask.png'
LAYOUT_PATH='/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/prototype/art-preview/brom-shield-only-study/plate/layout.json'
HEIGHT_U=0.9  # ブロム135cm / METRES_PER_TILE
METRES_PER_TILE=1.5
GLB_PATH='/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/prototype/art-preview/brom-shield-only-study/plate/brom-shield-only.glb'
LAYOUT=json.load(open(LAYOUT_PATH))
# 実験的ノーマルマップ(未採用機能): process-image.mjsが同じディレクトリに
# front-normal.png/back-normal.pngを置いていれば使う。無ければ通常通り。
FRONT_NORMAL = os.path.join(os.path.dirname(FRONT_IMAGE), "front-normal.png")
BACK_NORMAL = os.path.join(os.path.dirname(BACK_IMAGE), "back-normal.png")
FRONT_NORMAL = None
BACK_NORMAL = None

PLATE_THICKNESS_M = 0.06
BEVEL_WIDTH_M = 0.006
PLATE_THICKNESS_U = PLATE_THICKNESS_M / METRES_PER_TILE
BEVEL_WIDTH_U = BEVEL_WIDTH_M / METRES_PER_TILE
CONTOUR_STEP_PX = 5
CHAIKIN_ITERS = 1
MORPH_OPEN_RADIUS_PX = 5


def load_mask(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    return (px[:, :, 0] > 0.5), w, h


def chamfer(mask):
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
    outside = ~mask
    eroded = chamfer(outside) >= radius
    dilated = chamfer(eroded) <= radius
    return dilated


def trace_boundary_loops(mask):
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

    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))

    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            x, y = loop.vert.co.x, loop.vert.co.y
            loop[uv_layer].uv = (x / w, y / h)

    mesh = bpy.data.meshes.new("PreviewFlatMesh")
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def image_material(name, path, uv_name, flip_u=False, single_sided=True, normal_path=None):
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
        uv_vector = combine.outputs["Vector"]
    else:
        uv_vector = uvmap.outputs["UV"]
    links.new(uv_vector, tex.inputs["Vector"])
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.35

    # 実験的ノーマルマップ(未採用機能)。Blender側では強度1.0で焼き込み、実際の
    # 効き具合はエクスポート後にthree.js側のnormalScaleで調整する前提。
    # ノーマルマップは色ではなくベクトルデータなのでNon-Colorで読む(sRGBのまま
    # だとガンマ補正がかかり、法線の向きが歪む)。
    if normal_path:
        normal_image = bpy.data.images.load(normal_path, check_existing=True)
        normal_image.colorspace_settings.name = "Non-Color"
        normal_tex = nodes.new("ShaderNodeTexImage")
        normal_tex.image = normal_image
        links.new(uv_vector, normal_tex.inputs["Vector"])
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.uv_map = uv_name
        links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

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


scene=bpy.data.scenes.get("Brom_Shield_Only") or bpy.data.scenes.new("Brom_Shield_Only")
if bpy.context.window: bpy.context.window.scene=scene
mask, mw, mh = load_mask(MASK_IMAGE)
opened = morphological_open(mask, MORPH_OPEN_RADIUS_PX)
loops = trace_boundary_loops(opened)
loops.sort(key=len, reverse=True)
if not loops:
    raise RuntimeError("境界ループが取れなかった")
print("輪郭ループ", [len(l) for l in loops])

smoothed_loops = [thin_and_smooth(loop, CONTOUR_STEP_PX, CHAIKIN_ITERS) for loop in loops]
print("平滑化後の頂点数", [len(l) for l in smoothed_loops])

flat_mesh = build_flat_mesh(smoothed_loops, mw, mh)



obj = bpy.data.objects.new("preview_standee", flat_mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

fx0, fy0, fx1, fy1 = LAYOUT["figure"]
pixel_m = HEIGHT_U / (fy1 - fy0)
obj.scale = (pixel_m, pixel_m, pixel_m)
obj.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
obj.location.z -= (mh - fy1) * pixel_m
obj.location.x -= (fx0 + fx1) / 2 * pixel_m
bpy.context.view_layer.update()

front_mat = image_material("Preview_Front", FRONT_IMAGE, "UVMap", flip_u=False, normal_path=FRONT_NORMAL)
rim_mat = rim_material("Preview_Rim")
back_mat = image_material("Preview_Back", BACK_IMAGE, "UVMap", flip_u=False, normal_path=BACK_NORMAL)
obj.data.materials.append(front_mat)
obj.data.materials.append(rim_mat)
obj.data.materials.append(back_mat)
for poly in obj.data.polygons:
    poly.material_index = 0

solidify = obj.modifiers.new("Thickness", "SOLIDIFY")
solidify.thickness = PLATE_THICKNESS_U
solidify.offset = 0
solidify.material_offset = 2
solidify.material_offset_rim = 1

bevel = obj.modifiers.new("Round", "BEVEL")
bevel.width = BEVEL_WIDTH_U
bevel.segments = 4
bevel.limit_method = "ANGLE"
bevel.angle_limit = math.radians(51)

bpy.context.view_layer.objects.active = obj
for mod_name in ("Thickness", "Round"):
    bpy.ops.object.modifier_apply(modifier=mod_name)

obj["asset_type"] = "acrylic_plate_standee_preview"
obj["height_units"] = HEIGHT_U
obj["metres_per_tile"] = METRES_PER_TILE

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=True, use_active_scene=True, export_materials="EXPORT", export_image_format="AUTO")
print("PREVIEW_STANDEE_CREATED", GLB_PATH)

result={"scene":scene.name,"path":GLB_PATH,"dimensions":list(obj.dimensions)}
