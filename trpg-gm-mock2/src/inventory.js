/* 所持品をキャラクター別に持つ。正本は state.inventory = { 所有者ID: [品名, …] }。
   品名は campaign.items[].ja の正式名で、条件判定もLLMへの受け渡しも正式名で行う。

   同じ品を2人が同時に持つことは無い。move で所有者を移す。
   出口の条件（requires.itemsAll / itemsAny）は「パーティの誰かが持っているか」で判定する。
   そのため、条件判定に使う一覧は held() で平坦化する。

   ponytail: 所有者の解決は先頭一致の線形走査。品数は数十なので十分。 */

export const PLAYER = "player";

/* 保存データの移行。旧形式（items が文字列配列で inventory が無い）は
   すべてプレイヤーの持ち物として読む。所有者の情報は旧セーブに存在しないため復元できない。 */
export function normalizeInventory(source) {
  const raw = source?.inventory;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out = {};
    for (const [owner, list] of Object.entries(raw)) {
      if (!owner) continue;
      out[owner] = (Array.isArray(list) ? list : []).filter(n => typeof n === "string" && n);
    }
    if (!out[PLAYER]) out[PLAYER] = [];
    return dedupe(out);
  }
  const legacy = Array.isArray(source?.items) ? source.items.filter(n => typeof n === "string" && n) : [];
  return dedupe({ [PLAYER]: legacy });
}

/* 同じ品を複数の所有者が持つ状態は不正。先に現れた所有者を残す。 */
function dedupe(inventory) {
  const seen = new Set();
  const out = {};
  for (const [owner, list] of Object.entries(inventory)) {
    out[owner] = [];
    for (const name of list) {
      if (seen.has(name)) continue;
      seen.add(name);
      out[owner].push(name);
    }
  }
  return out;
}

/* 所有者の登録。持ち物が空でも欄を作る。画面に「何も持っていない」を出すため。 */
export function ensureOwner(inventory, owner) {
  if (owner && !inventory[owner]) inventory[owner] = [];
  return inventory;
}

/* 条件判定・LLMへの受け渡し・年代記が使う平坦な一覧。所有者の順、その中は追加順。 */
export function held(inventory) {
  return Object.values(inventory || {}).flat();
}

export function has(inventory, name) {
  return held(inventory).includes(name);
}

export function ownerOf(inventory, name) {
  for (const [owner, list] of Object.entries(inventory || {})) {
    if (list.includes(name)) return owner;
  }
  return null;
}

/* 追加。既に誰かが持っているなら何もしない（重複所持を作らない）。
   戻り値は実際に追加したかどうか。呼び出し側が進行判定に使う。 */
export function give(inventory, name, owner = PLAYER) {
  if (typeof name !== "string" || !name) return false;
  if (has(inventory, name)) return false;
  ensureOwner(inventory, owner);
  inventory[owner].push(name);
  return true;
}

/* 取り除く。誰が持っていても取れる。戻り値は実際に取り除いたかどうか。 */
export function take(inventory, name) {
  const owner = ownerOf(inventory, name);
  if (!owner) return false;
  const at = inventory[owner].indexOf(name);
  inventory[owner].splice(at, 1);
  return true;
}

/* 譲渡。持っていない品は渡せない。 */
export function move(inventory, name, toOwner) {
  if (!toOwner || !has(inventory, name)) return false;
  take(inventory, name);
  ensureOwner(inventory, toOwner);
  inventory[toOwner].push(name);
  return true;
}

/* 章開始時の割り当て。
   chapter.startingInventory = { 所有者ID: [品名, …] } を正とし、
   無ければ campaign.initialInventory（平坦な配列）をプレイヤーの持ち物として読む。
   どちらも無ければ既定値を使う。 */
export function startingInventory({ chapterStarting, campaignInitial, fallback = [] }) {
  if (chapterStarting && typeof chapterStarting === "object" && !Array.isArray(chapterStarting)) {
    return normalizeInventory({ inventory: chapterStarting });
  }
  const flat = Array.isArray(campaignInitial) && campaignInitial.length ? campaignInitial : fallback;
  return normalizeInventory({ items: flat });
}

/* 画面表示用。所有者ごとにまとめた配列を、表示名の解決関数つきで返す。 */
export function byOwner(inventory, displayName = id => id) {
  return Object.entries(inventory || {}).map(([owner, list]) => ({
    owner, name: displayName(owner), items: [...list]
  }));
}
