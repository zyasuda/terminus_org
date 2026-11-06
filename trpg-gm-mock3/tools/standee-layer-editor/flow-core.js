// 制作フロー（①納刀→②抜刀→③素手）の、DOMに依存しない処理。ブラウザーとnodeの検査で共用します。
// 保存形式は詳細レイヤー編集のJSON（core.js）とは別。kind で見分けます。
(function (root) {
  'use strict';

  const KIND = 'standee-flow';
  const STAGES = [
    { id: 'sheathed', no: '①', name: '納刀', verb: '納刀を決める' },
    { id: 'drawn', no: '②', name: '抜刀', verb: '抜刀を作る' },
    { id: 'empty', no: '③', name: '素手', verb: '素手を作る' },
  ];
  const VIEWS = [{ id: 'front', name: '正面' }, { id: 'back', name: '背面' }];
  // 制作データ（画像込みJSON）の文字数上限。画像1枚の上限は core.js の LIMITS を使います。
  const LIMITS = { jsonChars: 80 * 1024 * 1024 };
  const IMAGE_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  const pair = () => ({ front: null, back: null });
  function newFlow() {
    return { kind: KIND, version: 1, source: 'none', base: pair(), states: { sheathed: pair(), drawn: pair(), empty: pair() } };
  }

  function fail(path, message) { throw new Error(`${path}: ${message}`); }
  function obj(v, path) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'オブジェクトではありません'); return v; }
  function image(v, path) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string' || !IMAGE_URL.test(v)) fail(path, 'PNG/JPEG/WebPのdata URLではありません');
    return v;
  }
  function readPair(v, path) {
    obj(v, path);
    return { front: image(v.front, path + '.front'), back: image(v.back, path + '.back') };
  }

  // 保存した制作データの文字列を検査し、新しいオブジェクトを返します。失敗時は例外（呼び出し側の状態は変えない）。
  function parseFlow(text) {
    if (typeof text !== 'string') throw new Error('制作データが文字列ではありません');
    if (text.length > LIMITS.jsonChars) throw new Error(`制作データが大きすぎます（${text.length}文字、上限${LIMITS.jsonChars}文字）`);
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error('JSONとして読めません: ' + e.message); }
    obj(raw, 'root');
    if (raw.kind !== KIND) {
      if (raw.views) throw new Error('これは詳細レイヤー編集の保存データです。詳細レイヤー編集の「JSONから復元」で開いてください');
      fail('kind', '制作データではありません');
    }
    if (raw.version !== 1) fail('version', '対応していない版です');
    const out = newFlow();
    out.source = typeof raw.source === 'string' ? raw.source.slice(0, 80) : 'none';
    out.base = readPair(raw.base, 'base');
    obj(raw.states, 'states');
    for (const s of STAGES) out.states[s.id] = readPair(raw.states[s.id], `states.${s.id}`);
    return out;
  }

  // 保存データに含まれる画像（重複なし）。復元前に全部読めるか確かめるのに使います。
  function imageUrls(flow) {
    const urls = new Set();
    for (const p of [flow.base, ...STAGES.map((s) => flow.states[s.id])]) for (const v of VIEWS) if (p[v.id]) urls.add(p[v.id]);
    return [...urls];
  }

  const hasBase = (flow) => Boolean(flow.base.front && flow.base.back);
  const baseMatches = (flow) => hasBase(flow) && flow.base.front === flow.states.sheathed.front && flow.base.back === flow.states.sheathed.back;

  // 「基準として保存」。①の正面・背面が両方そろっている時だけ。基準が変わるのはここだけです。
  function saveBase(flow) {
    const s = flow.states.sheathed;
    if (!s.front || !s.back) throw new Error('①納刀の正面と背面を両方読み込んでから基準として保存してください');
    flow.base = { front: s.front, back: s.back };
  }

  // ②③は納刀の基準が無いと始められません。
  function canWork(flow, stage) { return stage === 'sheathed' || hasBase(flow); }

  // 段階の作成状態（表示用の短い文）。
  function stageStatus(flow, stage) {
    const p = flow.states[stage], n = (p.front ? 1 : 0) + (p.back ? 1 : 0);
    if (stage === 'sheathed') {
      if (baseMatches(flow)) return '基準保存済み';
      if (hasBase(flow)) return n ? '基準と別の画像あり' : '基準保存済み（画像未表示）';
      return n === 2 ? '前後あり・基準未保存' : n ? (p.front ? '正面のみ' : '背面のみ') : '未読込';
    }
    if (!hasBase(flow)) return '納刀の基準待ち';
    return n === 2 ? '前後あり' : n ? (p.front ? '正面のみ' : '背面のみ') : '未読込';
  }

  // 人物の右手は、正面図では画面の左側、背面図では画面の右側に来ます。
  function rightHandSide(view) { return view === 'front' ? '画面の左側' : '画面の右側'; }

  // ②③の編集用プロンプト。必ず①の納刀画像（同じ向き）を添付して使います。
  function buildEditPrompt(stage, view) {
    if (stage !== 'drawn' && stage !== 'empty') throw new Error(`編集用プロンプトは抜刀・素手だけです: ${stage}`);
    const vn = VIEWS.find((v) => v.id === view)?.name;
    if (!vn) throw new Error(`未知の向き: ${view}`);
    const other = view === 'front' ? '背面' : '正面', side = rightHandSide(view);
    const head = [
      `【画像編集の依頼：${stage === 'drawn' ? '抜刀' : '素手'}（${vn}）】`,
      `添付画像は完成済みの「納刀」立ち絵（${vn}）です。この画像を元に編集してください。新しく描き直さないでください。`,
      `向き：${vn}。人物の右手（人物自身から見た右手）は、この${vn}図では${side}にあります。`,
    ];
    const body = stage === 'drawn' ? [
      '変えないもの：人物（顔・体型・服装・色・画風）、姿勢、画像の寸法と人物の位置。鞘の位置・長さ・角度。',
      '変えるもの：',
      '・鞘に収まっている剣の柄を消し、鞘を空にする（鞘そのものは残す）。この向きで柄が見えていなければ鞘はそのまま。',
      `・人物の右手（${side}）に、鞘から抜いた剣を握らせる。`,
      '編集してよいのは右手と剣だけです。左手・腕・脚・顔・背景は変えないでください。',
    ] : [
      '変えないもの：人物（顔・体型・服装・色・画風）、姿勢、画像の寸法と人物の位置。',
      '変えるもの：',
      '・剣と鞘を取り除く。隠れていた体や服は、周りに合わせて自然に補う。',
      `・人物の右手（${side}）は何も持たない手にする。手の位置と姿勢は変えない。`,
      '剣と鞘以外は変えないでください。',
    ];
    return [
      ...head, ...body,
      `${other}用は別の依頼で作ります。左右反転した画像で代用しないでください。`,
      '背景は透明のまま。文字・枠・影・ガイド線を加えないでください。',
    ].join('\n');
  }

  const api = { KIND, STAGES, VIEWS, LIMITS, newFlow, parseFlow, imageUrls, hasBase, baseMatches, saveBase, canWork, stageStatus, rightHandSide, buildEditPrompt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StandeeFlow = api;
})(this);
