// 衣装部屋の状態と合成順。DOMに依存しないので、ブラウザーとnodeの検査で共用します。
// 配置の基準値は旧試作 standee-layer-editor/studies/gareth-sword-v1/state-{sheathed,drawn,empty}.json の写しです。
(function (root) {
  'use strict';

  const WIDTH = 656, HEIGHT = 1199;           // ガレス素体の寸法
  const SCABBARD_RANGE = 24;                   // 鞘を基準からずらせる上限（px、各方向）。作者が触って決める調整値
  const DIR = 'assets/gareth/';

  // 交換手のときに素体から元の手を消す矩形（旧試作の masks の写し）
  const HAND_MASK = { front: { x: 110, y: 599, w: 85, h: 80 }, back: { x: 540, y: 615, w: 72, h: 57 } };
  // 握った手＋剣の配置（旧試作で作者が整えた値。プレイヤーは動かさない）
  const GRIP = {
    front: { src: 'hand-sword-front.png', x: -323, y: 106, rotation: 14, scale: 0.4 },
    back: {
      blade: { src: 'blade-back.png', x: -54.80023088712653, y: 128.69860062931605, rotation: 76, scale: 0.4 },
      grip: { src: 'grip-back.png', x: -62.586915957315455, y: 44.10444789353426, rotation: -30, scale: 0.13 },
    },
  };
  // 背面の空鞘と籠手の縁（袖口遮蔽）は1枚に焼き込まれているので、左右で切り分けて別の部品として描く
  const BACK_SPLIT_X = 400;
  // 当たり判定・吸着先（キャンバス座標）。手の位置は旧試作の anchor の写し
  const HAND_POINT = { front: { x: 153, y: 600 }, back: { x: 575, y: 603 } };
  const WAIST_POINT = { front: { x: 470, y: 560 }, back: { x: 195, y: 560 } };
  const SCABBARD_BOX = { front: { x: 410, y: 440, w: 170, h: 540 }, back: { x: 105, y: 440, w: 170, h: 540 } };
  const HAND_RADIUS = 70;                      // 剣を持つ手を押したとみなす半径（キャンバスpx）
  const DRAG_SLOP = 6;                         // これ未満の動きはクリック扱い（キャンバスpx）

  // sword: 'shelf' | 'hand' | 'scabbard'、scabbard: 'shelf' | 'waist'
  // offset は前後独立。自動で揃えない。unchecked は「もう片面でまだ見ていない変更がある」面
  function initialState() {
    return { sword: 'shelf', scabbard: 'shelf', offset: { front: { x: 0, y: 0 }, back: { x: 0, y: 0 } }, view: 'front', unchecked: null };
  }
  const other = (v) => (v === 'front' ? 'back' : 'front');
  const clamp = (n) => Math.max(-SCABBARD_RANGE, Math.min(SCABBARD_RANGE, n));

  // 剣を渡す。target は 'hand' か 'scabbard'。できないときは同じ state をそのまま返す
  function giveSword(s, target) {
    if (target === 'scabbard' && s.scabbard !== 'waist') return s;
    if (s.sword === target) return s;
    return { ...s, sword: target };
  }
  function returnSword(s) { return s.sword === 'shelf' ? s : { ...s, sword: 'shelf' }; }
  function wearScabbard(s) { return s.scabbard === 'waist' ? s : { ...s, scabbard: 'waist' }; }
  // 剣が入ったまま外したら、剣も一緒に棚へ戻る
  function removeScabbard(s) {
    if (s.scabbard !== 'waist') return s;
    return { ...s, scabbard: 'shelf', sword: s.sword === 'scabbard' ? 'shelf' : s.sword };
  }
  const sheathe = (s) => (s.sword === 'hand' ? giveSword(s, 'scabbard') : s);
  const draw = (s) => (s.sword === 'scabbard' ? giveSword(s, 'hand') : s);

  // 鞘をずらす。許容範囲で止め、もう片面を未確認にする
  function nudgeScabbard(s, view, dx, dy) {
    if (s.scabbard !== 'waist') return s;
    const o = s.offset[view], x = clamp(o.x + dx), y = clamp(o.y + dy);
    if (x === o.x && y === o.y) return s;
    return { ...s, offset: { ...s.offset, [view]: { x, y } }, unchecked: other(view) };
  }
  function setView(s, view) {
    return { ...s, view, unchecked: s.unchecked === view ? null : s.unchecked };
  }

  // 1面の部品を奥から順に返す。{ src, x, y, rotation, scale, clip?, mask? }
  function layers(s, view) {
    const out = [], hand = s.sword === 'hand', o = s.offset[view];
    const at = (src, extra = {}) => ({ src: DIR + src, x: o.x, y: o.y, rotation: 0, scale: 1, ...extra });
    const fixed = (p, extra = {}) => ({ ...p, src: DIR + p.src, ...extra });
    if (view === 'back' && hand) out.push(fixed(GRIP.back.blade));
    out.push(fixed({ src: `body-${view}.png`, x: 0, y: 0, rotation: 0, scale: 1 }, hand ? { mask: HAND_MASK[view] } : {}));
    if (view === 'front') {
      if (s.scabbard === 'waist') out.push(at(s.sword === 'scabbard' ? 'sheathed-front.png' : 'scabbard-empty-front.png'));
      if (hand) out.push(fixed(GRIP.front));
    } else {
      if (hand) out.push(fixed(GRIP.back.grip));
      if (s.scabbard === 'waist') {
        out.push(s.sword === 'scabbard'
          ? at('sheathed-back.png')
          : at('scabbard-empty-and-cuff-back.png', { clip: { x: 0, y: 0, w: BACK_SPLIT_X, h: HEIGHT } }));
      }
      if (hand) out.push(fixed({ src: 'scabbard-empty-and-cuff-back.png', x: 0, y: 0, rotation: 0, scale: 1 }, { clip: { x: BACK_SPLIT_X, y: 0, w: WIDTH - BACK_SPLIT_X, h: HEIGHT } }));
    }
    return out;
  }

  // 画面に出す身支度の名前（状態表示用）
  function outfitLabel(s) {
    if (s.sword === 'scabbard') return '納刀';
    if (s.sword === 'hand') return s.scabbard === 'waist' ? '抜刀' : '剣を手に（鞘なし）';
    return s.scabbard === 'waist' ? '鞘だけ（剣は棚）' : '素手';
  }

  // 剣を渡す先を、落とした位置から近い方に決める（鞘を着けていなければ手）
  function swordTarget(s, view, p) {
    if (s.scabbard !== 'waist') return 'hand';
    const d = (q) => Math.hypot(q.x - p.x, q.y - p.y);
    const waist = { x: WAIST_POINT[view].x + s.offset[view].x, y: WAIST_POINT[view].y + s.offset[view].y };
    return d(waist) < d(HAND_POINT[view]) ? 'scabbard' : 'hand';
  }
  function hitScabbard(s, view, p) {
    if (s.scabbard !== 'waist') return false;
    const b = SCABBARD_BOX[view], o = s.offset[view];
    return p.x >= b.x + o.x && p.x <= b.x + o.x + b.w && p.y >= b.y + o.y && p.y <= b.y + o.y + b.h;
  }
  // 人物の上で押した品。剣は手に持っているときだけ手で拾う（納刀中は鞘が拾う）
  function hitItem(s, view, p) {
    const h = HAND_POINT[view];
    if (s.sword === 'hand' && Math.hypot(p.x - h.x, p.y - h.y) <= HAND_RADIUS) return 'sword';
    return hitScabbard(s, view, p) ? 'scabbard' : null;
  }
  const isDrag = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) >= DRAG_SLOP;

  // 操作カードに並べる操作。着けていない品は null（カードを出さない）
  function cardActions(s, item) {
    if (item === 'sword') {
      if (s.sword === 'shelf') return null;
      if (s.sword === 'scabbard') return ['draw', 'return'];
      return s.scabbard === 'waist' ? ['sheathe', 'return'] : ['return'];
    }
    if (item === 'scabbard') return s.scabbard === 'waist' ? ['return'] : null;
    return null;
  }
  // カードを出す位置（品のいる場所）
  function itemPoint(s, view, item) {
    if (item === 'sword' && s.sword === 'hand') return HAND_POINT[view];
    return { x: WAIST_POINT[view].x + s.offset[view].x, y: WAIST_POINT[view].y + s.offset[view].y };
  }

  // ── マレン ──
  // 手持ち道具は1つ（杖・ランタン・なし）。既存の全身前後3姿をそのまま描き、手や道具を合成しない
  // 素材は元絵のまま。1枚に正面・背面が並ぶ元絵は crop で片方を切り出す（画像は加工しない）
  // headTop・headX・footY は measure-maren.cjs の実測（α128以上の画素。headX は頭頂から60pxの平均x）
  const MAREN_DIR = 'assets/maren/';
  const MAREN_TOP = 60, MAREN_FOOT = 1140, MAREN_X = 340;   // どの姿も頭頂・足裏・頭の中心をここへ合わせる（キャンバスpx）
  const MAREN_ITEM_RADIUS = 90;                              // 持ち物を押したとみなす半径（キャンバスpx）
  const NECKLACE_RADIUS = 45;                                // 首飾りを押したとみなす半径（キャンバスpx）
  const EMPTY = 'maren-empty-review.png', LANTERN = 'maren-lantern-review.png';
  // 首飾り：1402×1122の透過画像を縮小して正面の胸元にだけ描く。pendant は宝石の中心（measure-maren.cjs の実測）
  const NECKLACE = { src: 'assets/accessories/amber-necklace-v1.png', w: 1402, h: 1122, pendant: { x: 701, y: 914 } };
  // hand：持ち物のある位置。neck：首飾りの宝石を置く位置と描く幅（キャンバスpx）。どちらも元絵の座標
  // neck は作者が画面を見て詰める仮の調整値。背面は長い髪に隠れるので描かず、点はカードを出す場所（うなじ）にだけ使う
  const MAREN_SRC = {
    none: {
      front: { src: EMPTY, crop: { x: 73, y: 0, w: 557, h: 1199 }, headTop: 10, headX: 399, footY: 1176, neck: { x: 398, y: 300, w: 120 } },
      back: { src: EMPTY, crop: { x: 683, y: 0, w: 561, h: 1199 }, headTop: 8, headX: 922, footY: 1163, neck: { x: 918, y: 200 } },
    },
    lantern: {
      front: { src: LANTERN, crop: { x: 140, y: 0, w: 505, h: 1194 }, headTop: 11, headX: 433, footY: 1158, hand: { x: 195, y: 680 }, neck: { x: 425, y: 312, w: 120 } },
      back: { src: LANTERN, crop: { x: 682, y: 0, w: 500, h: 1194 }, headTop: 11, headX: 894, footY: 1148, hand: { x: 1125, y: 680 }, neck: { x: 895, y: 200 } },
    },
    // 杖姿は板の外枠が無い透過元絵。背面は元から杖が画面右（右手側）にある自然な背面なので反転しない
    staff: {
      front: { src: 'staff-front-source.png', crop: { x: 0, y: 0, w: 664, h: 1328 }, headTop: 73, headX: 408, footY: 1297, hand: { x: 115, y: 455 }, neck: { x: 398, y: 385, w: 120 } },
      back: { src: 'staff-back-source.png', crop: { x: 0, y: 0, w: 664, h: 1328 }, headTop: 75, headX: 297, footY: 1284, hand: { x: 555, y: 455 }, neck: { x: 300, y: 260 } },
    },
  };
  // 黒の旅装（作者承認済の替え衣装）。測り方・揃え方は MAREN_SRC と同じ。
  // headTop・headX・footY は measure-maren-dark.cjs の実測。未着の姿は null にし、3姿が揃うまで衣装掛けの「黒」は押せない（他の絵で代用しない）
  // hand・neck は元絵を拡大して見て置いた仮の調整値。neck は胸元の留め具の下（V字の開き）
  const MAREN_DARK_FILES = { none: 'dark-empty-v1.png', staff: 'dark-staff-v1.png', lantern: 'dark-lantern-v1.png' };
  const MAREN_DARK_SRC = {
    none: {
      front: { src: MAREN_DARK_FILES.none, crop: { x: 0, y: 0, w: 629, h: 1254 }, headTop: 14, headX: 357, footY: 1239, neck: { x: 340, y: 300, w: 120 } },
      back: { src: MAREN_DARK_FILES.none, crop: { x: 629, y: 0, w: 625, h: 1254 }, headTop: 15, headX: 903, footY: 1239, neck: { x: 903, y: 210 } },
    },
    staff: {
      front: { src: MAREN_DARK_FILES.staff, crop: { x: 0, y: 0, w: 628, h: 1254 }, headTop: 20, headX: 370, footY: 1235, hand: { x: 105, y: 405 }, neck: { x: 352, y: 302, w: 120 } },
      back: { src: MAREN_DARK_FILES.staff, crop: { x: 628, y: 0, w: 626, h: 1254 }, headTop: 23, headX: 881, footY: 1232, hand: { x: 1160, y: 395 }, neck: { x: 881, y: 215 } },
    },
    lantern: {
      front: { src: MAREN_DARK_FILES.lantern, crop: { x: 0, y: 0, w: 637, h: 1254 }, headTop: 35, headX: 379, footY: 1225, hand: { x: 100, y: 450 }, neck: { x: 362, y: 313, w: 120 } },
      back: { src: MAREN_DARK_FILES.lantern, crop: { x: 637, y: 0, w: 617, h: 1254 }, headTop: 36, headX: 898, footY: 1224, hand: { x: 1180, y: 445 }, neck: { x: 898, y: 230 } },
    },
  };
  const marenScale = (m) => (MAREN_FOOT - MAREN_TOP) / (m.footY - m.headTop);
  // 元絵の点 → キャンバスの点
  function marenPoint(m, p) {
    const k = marenScale(m);
    return { x: MAREN_X + (p.x - m.headX) * k, y: MAREN_TOP + (p.y - m.headTop) * k };
  }
  const pose = (s, view) => (s.outfit === 'dark' ? MAREN_DARK_SRC : MAREN_SRC)[s.hold || 'none'][view];
  function marenLayer(s, view) {
    const m = pose(s, view), c = m.crop, k = marenScale(m);
    // drawLayer は crop の中心で縮尺するので、頭の中心と頭頂が MAREN_X・MAREN_TOP に来る左上を逆算する
    return {
      src: MAREN_DIR + m.src, crop: c, rotation: 0, scale: k,
      x: MAREN_X - c.w / 2 + k * (c.x + c.w / 2 - m.headX),
      y: MAREN_TOP - c.h / 2 + k * (c.y + c.h / 2 - m.headTop),
    };
  }
  // 首飾りの層：宝石の中心が neck に来るよう、画像中心の位置を逆算する（drawLayer は画像中心で縮尺）
  function necklaceLayer(s) {
    const m = pose(s, 'front'), q = marenPoint(m, m.neck), k = m.neck.w / NECKLACE.w;
    return {
      src: NECKLACE.src, rotation: 0, scale: k,
      x: q.x - k * (NECKLACE.pendant.x - NECKLACE.w / 2) - NECKLACE.w / 2,
      y: q.y - k * (NECKLACE.pendant.y - NECKLACE.h / 2) - NECKLACE.h / 2,
    };
  }
  // 品のある位置（カードを出す場所と当たり判定）。首飾りは着けているときだけ、手持ちは持っているときだけ
  function marenItemPoint(s, view, item = s.hold) {
    if (item === 'necklace') return s.necklace ? marenPoint(pose(s, view), pose(s, view).neck) : null;
    return item && s.hold === item ? marenPoint(pose(s, view), pose(s, view).hand) : null;
  }
  const maren = {
    ITEMS: ['staff', 'lantern', 'necklace'], MAREN_SRC, MAREN_DARK_SRC, MAREN_DARK_FILES, MAREN_TOP, MAREN_FOOT, MAREN_X, NECKLACE, marenPoint,
    darkReady: Object.values(MAREN_DARK_SRC).every(Boolean),
    // outfit（'normal' | 'dark'）と necklace は手持ちと独立。持ち替えても着替えても互いにそのまま
    initialState: () => ({ outfit: 'normal', hold: null, necklace: false, view: 'front' }),
    dress: (s, outfit) => (s.outfit === outfit ? s : { ...s, outfit }),
    // item は 'staff' | 'lantern' | null。杖とランタンは同じ手なので、持たせると前の品は棚へ戻る
    hold: (s, item) => (s.hold === item ? s : { ...s, hold: item }),
    wear: (s, on) => (s.necklace === on ? s : { ...s, necklace: on }),
    setView: (s, view) => ({ ...s, view }),
    layers: (s, view) => (view === 'front' && s.necklace ? [marenLayer(s, view), necklaceLayer(s)] : [marenLayer(s, view)]),
    outfitLabel(s) {
      const hold = (s.outfit === 'dark' ? '黒の旅装・' : '') + ({ staff: '杖を手に', lantern: 'ランタンを手に' }[s.hold] || '何も持たない');
      if (!s.necklace) return hold;
      return `${hold}・琥珀の首飾り${s.view === 'back' ? '（背面では髪に隠れて見えません）' : ''}`;
    },
    isOut: (s, item) => (item === 'none' ? s.hold === null : item === 'necklace' ? s.necklace : s.hold === item),
    itemPoint: marenItemPoint,
    hitItem(s, view, p) {
      const n = view === 'front' && marenItemPoint(s, view, 'necklace');   // 背面の首飾りは見えないので押せない
      if (n && Math.hypot(p.x - n.x, p.y - n.y) <= NECKLACE_RADIUS) return 'necklace';
      const q = marenItemPoint(s, view);
      return q && Math.hypot(p.x - q.x, p.y - q.y) <= MAREN_ITEM_RADIUS ? s.hold : null;
    },
    cardActions(s, item) {
      if (item === 'necklace') return s.necklace ? ['remove'] : null;
      return s.hold && s.hold === item ? ['return'] : null;
    },
  };

  // ── ブロム ──
  // 右手（金槌・手斧・空）と盾（左腕）を別々に着け外す。6状態×前後の全身絵12姿をそのまま描き、道具を合成しない（マレンと同じ描き方）
  // 素材は板の外枠が無い透過元絵。headTop・headX・footY は measure-brom.cjs の実測
  const BROM_DIR = 'assets/brom/';
  // 頭頂・足裏・頭の中心を揃える先。新素材の金槌までキャンバス幅に収める背丈（全姿共通）
  const BROM_TOP = 520, BROM_FOOT = 1140, BROM_X = 328;
  const BROM_ITEM_RADIUS = 90;                               // 金槌・手斧・盾を押したとみなす半径（キャンバスpx）
  const BROM_FILTER = 'brightness(0.86) saturate(0.72)'; // 原画の落ち着いた暗さと色味へ寄せる共通値
  // hammer・axe：握りのあたり、shield：盾の中心（元絵の座標。カードを出す場所と当たり判定）
  // 正面は左＝金槌・手斧（右手）・右＝盾（左腕）、背面は元から左＝盾・右＝右手の自然な背面なので反転しない
  const BROM_SRC = {
  "empty": {
    "front": {
      "src": "muted-empty-v1.png",
      "crop": {
        "x": 0,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 43,
      "headX": 500,
      "footY": 921
    },
    "back": {
      "src": "muted-empty-v1.png",
      "crop": {
        "x": 837,
        "y": 0,
        "w": 838,
        "h": 939
      },
      "headTop": 46,
      "headX": 1198,
      "footY": 917
    }
  },
  "hammer": {
    "front": {
      "src": "muted-hammer-v1.png",
      "crop": {
        "x": 0,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 41,
      "headX": 501,
      "footY": 921,
      "hammer": {
        "x": 270,
        "y": 573
      }
    },
    "back": {
      "src": "muted-hammer-v1.png",
      "crop": {
        "x": 837,
        "y": 0,
        "w": 838,
        "h": 939
      },
      "headTop": 44,
      "headX": 1199,
      "footY": 918,
      "hammer": {
        "x": 1433,
        "y": 587
      }
    }
  },
  "shield": {
    "front": {
      "src": "muted-shield-v1.png",
      "crop": {
        "x": 0,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 43,
      "headX": 500,
      "footY": 922,
      "shield": {
        "x": 720,
        "y": 480
      }
    },
    "back": {
      "src": "muted-shield-v1.png",
      "crop": {
        "x": 837,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 45,
      "headX": 1198,
      "footY": 917,
      "shield": {
        "x": 979,
        "y": 478
      }
    }
  },
  "both": {
    "front": {
      "src": "muted-hammer-shield-v1.png",
      "crop": {
        "x": 0,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 43,
      "headX": 500,
      "footY": 921,
      "hammer": {
        "x": 270,
        "y": 573
      },
      "shield": {
        "x": 720,
        "y": 480
      }
    },
    "back": {
      "src": "muted-hammer-shield-v1.png",
      "crop": {
        "x": 837,
        "y": 0,
        "w": 838,
        "h": 939
      },
      "headTop": 45,
      "headX": 1198,
      "footY": 917,
      "hammer": {
        "x": 1433,
        "y": 587
      },
      "shield": {
        "x": 979,
        "y": 478
      }
    }
  },
  "axe": {
    "front": {
      "src": "muted-axe-v1.png",
      "crop": {
        "x": 0,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 43,
      "headX": 500,
      "footY": 921,
      "axe": {
        "x": 270,
        "y": 573
      }
    },
    "back": {
      "src": "muted-axe-v1.png",
      "crop": {
        "x": 837,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 46,
      "headX": 1198,
      "footY": 917,
      "axe": {
        "x": 1433,
        "y": 587
      }
    }
  },
  "axeShield": {
    "front": {
      "src": "muted-axe-shield-v1.png",
      "crop": {
        "x": 0,
        "y": 0,
        "w": 837,
        "h": 939
      },
      "headTop": 43,
      "headX": 499,
      "footY": 921,
      "axe": {
        "x": 270,
        "y": 573
      },
      "shield": {
        "x": 720,
        "y": 480
      }
    },
    "back": {
      "src": "muted-axe-shield-v1.png",
      "crop": {
        "x": 837,
        "y": 0,
        "w": 838,
        "h": 939
      },
      "headTop": 47,
      "headX": 1197,
      "footY": 916,
      "axe": {
        "x": 1433,
        "y": 587
      },
      "shield": {
        "x": 979,
        "y": 478
      }
    }
  }
};
  const bromKey = (s) => (s.axe ? (s.shield ? 'axeShield' : 'axe') : s.hammer ? (s.shield ? 'both' : 'hammer') : s.shield ? 'shield' : 'empty');
  const bromPose = (s, view) => BROM_SRC[bromKey(s)][view];
  const bromScale = (m) => (BROM_FOOT - BROM_TOP) / (m.footY - m.headTop);
  function bromPoint(m, p) {
    const k = bromScale(m);
    return { x: BROM_X + (p.x - m.headX) * k, y: BROM_TOP + (p.y - m.headTop) * k };
  }
  // 品のある位置。着けているときだけ
  function bromItemPoint(s, view, item) {
    if (!s[item]) return null;
    const m = bromPose(s, view);
    return bromPoint(m, m[item]);
  }
  const brom = {
    ITEMS: ['hammer', 'shield', 'axe'], BROM_FILTER, BROM_SRC, BROM_TOP, BROM_FOOT, BROM_X, bromPoint, bromKey,
    // 金槌と手斧は同じ右手なので排他。盾（左腕）はどちらとも独立
    initialState: () => ({ hammer: false, shield: false, axe: false, view: 'front' }),
    wear(s, item, on) {
      if (s[item] === on) return s;
      const next = { ...s, [item]: on };
      if (on && item === 'axe') next.hammer = false;      // 手斧を持つと金槌は棚へ
      if (on && item === 'hammer') next.axe = false;      // 金槌を持つと手斧は棚へ
      return next;
    },
    setView: (s, view) => ({ ...s, view }),
    layers(s, view) {
      const m = bromPose(s, view), c = m.crop, k = bromScale(m);
      // drawLayer は crop の中心で縮尺するので、頭の中心と頭頂が BROM_X・BROM_TOP に来る左上を逆算する（marenLayer と同じ式）
      return [{
        src: BROM_DIR + m.src, crop: c, rotation: 0, scale: k, filter: BROM_FILTER,
        x: BROM_X - c.w / 2 + k * (c.x + c.w / 2 - m.headX),
        y: BROM_TOP - c.h / 2 + k * (c.y + c.h / 2 - m.headTop),
      }];
    },
    outfitLabel: (s) => ({ empty: '素手', hammer: '金槌だけ', shield: '盾だけ', both: '金槌と盾', axe: '手斧だけ', axeShield: '手斧と盾' })[bromKey(s)],
    isOut: (s, item) => !!s[item],
    itemPoint: bromItemPoint,
    // 近い品。どれも半径の外なら null
    hitItem(s, view, p) {
      let best = null, bd = BROM_ITEM_RADIUS;
      for (const item of brom.ITEMS) {
        const q = bromItemPoint(s, view, item), d = q && Math.hypot(p.x - q.x, p.y - q.y);
        if (q && d <= bd) { best = item; bd = d; }
      }
      return best;
    },
    cardActions: (s, item) => (s[item] ? ['return'] : null),
  };

  // 旧試作 core.js の drawLayer と同じ変換：画像中心で回転・縮尺し、左上を(x,y)に置く
  // crop があれば元絵のその範囲だけを1枚の画像として扱う
  function drawLayer(ctx, layer, img) {
    const c = layer.crop, w = c ? c.w : img.width, h = c ? c.h : img.height;
    ctx.save();
    if (layer.filter) ctx.filter = layer.filter;
    if (layer.clip) { ctx.beginPath(); ctx.rect(layer.clip.x + layer.x, layer.clip.y + layer.y, layer.clip.w, layer.clip.h); ctx.clip(); }
    ctx.translate(layer.x + w / 2, layer.y + h / 2);
    ctx.rotate(layer.rotation * Math.PI / 180);
    ctx.scale(layer.scale, layer.scale);
    if (c) ctx.drawImage(img, c.x, c.y, w, h, -w / 2, -h / 2, w, h);
    else ctx.drawImage(img, -w / 2, -h / 2);
    ctx.restore();
  }
  // マスクは素体の作業用キャンバスにだけ掛ける（旧試作 drawView と同じ考え方）
  function drawView(ctx, list, images, makeCanvas) {
    for (const layer of list) {
      const img = images.get(layer.src);
      if (!img) continue;
      if (layer.mask) {
        const c = makeCanvas(WIDTH, HEIGHT), bctx = c.getContext('2d');
        drawLayer(bctx, layer, img);
        bctx.clearRect(layer.mask.x, layer.mask.y, layer.mask.w, layer.mask.h);
        ctx.drawImage(c, 0, 0);
      } else drawLayer(ctx, layer, img);
    }
  }

  const LYDIA_SRC = {"front":{"crop":{"x":0,"y":0,"w":627,"h":1254},"headTop":20,"footY":1230,"headX":346},"back":{"crop":{"x":627,"y":0,"w":627,"h":1254},"headTop":23,"footY":1224,"headX":909}};
  const lydia = {
    ITEMS: [], LYDIA_SRC, src: 'assets/lydia/empty-v1.png',
    initialState: () => ({ view: 'front' }), setView,
    layers: (s, view) => {
      const m = LYDIA_SRC[view], c = m.crop, k = (1140 - 390) / (m.footY - m.headTop);
      return [{ src: lydia.src, crop: c, rotation: 0, scale: k,
        x: 328 - c.w / 2 + k * (c.x + c.w / 2 - m.headX),
        y: 390 - c.h / 2 + k * (c.y + c.h / 2 - m.headTop) }];
    },
    outfitLabel: () => '素手', isOut: () => false,
    itemPoint: () => null, hitItem: () => null, cardActions: () => [],
  };

  // 衣装部屋の表示身長。素材座標と装備の当たり判定は保ち、描画時だけ揃える。
  // ガレス・マレン・リディアは素材登録値。ブロム145cmは作者指定（2026-10-09）。全員4.5px/cm。
  const HEIGHT_CM = { gareth: 184, maren: 173, lydia: 172, brom: 145 };
  const DISPLAY_HEIGHT = Object.fromEntries(Object.entries(HEIGHT_CM).map(([actor, cm]) => [actor, cm * 4.5]));
  function displayFrame(actor, view) {
    const height = { gareth: view === 'front' ? 1148 : 1147, maren: 1080, lydia: 750, brom: 620 }[actor];
    const foot = actor === 'gareth' ? (view === 'front' ? 1168 : 1170) : 1140;
    const scale = DISPLAY_HEIGHT[actor] / height;
    return { scale, x: 328 * (1 - scale), y: 1140 - foot * scale };
  }

  // ガレスの規則（maren と同じ名前で呼べるもの：ITEMS・initialState・setView・layers・outfitLabel・isOut・itemPoint・hitItem・cardActions）
  const api = {
    HEIGHT_CM, DISPLAY_HEIGHT, displayFrame, WIDTH, HEIGHT, SCABBARD_RANGE, DIR, HAND_POINT, WAIST_POINT, ITEMS: ['sword', 'scabbard'],
    initialState, giveSword, returnSword, wearScabbard, removeScabbard, sheathe, draw, nudgeScabbard, setView,
    layers, outfitLabel, swordTarget, hitScabbard, hitItem, isDrag, cardActions, itemPoint, drawView,
    isOut: (s, item) => s[item] !== 'shelf',
    maren, MAREN_DIR, brom, BROM_DIR, lydia,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Wardrobe = api;
})(this);
