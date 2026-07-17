import { useEffect, useRef, useState } from "react";
import { useEngine } from "./hooks/useEngine.js";
import { setStore } from "./engine/store.js";
import PhaserFx from "./PhaserFx.jsx";

function ChatEntry({ entry }) {
  if (entry.kind === "msg") return <div className={"msg " + entry.cls}>{entry.text}</div>;
  if (entry.kind === "reveal") return <div className="msg reveal">🔓 情報開示:システムがこの秘密をLLMに注入した</div>;
  return null;
}

// パーティ立ち絵スロット(Figma node 10:30)は campaign.json の companions[].sprite から
// エンジンが組み立てて store.partySlots に入れる(コード直書き禁止の契約)。

export default function App() {
  const eng = useEngine();
  const chatRef = useRef(null);
  const gmLogRef = useRef(null);
  const [input, setInput] = useState("");
  const touchStartRef = useRef({ x: 0, y: 0, panel: null });
  // GMの語りの表示分担: 最新1件=主画面のペットの吹き出し、履歴=左パネル、下パネルは会話(プレイヤー・仲間)専用
  const gmLog = eng.chat.filter(e => e.kind === "msg" && e.cls === "gm");

  // GMペットの位置(ステージに対する%座標、ペット中心基準)。ドラッグで4隅など自由に配置でき、端末に保存される
  const [petPos, setPetPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gmPetPos_v1")) || { x: 92, y: 38 }; }
    catch (e) { return { x: 92, y: 38 }; }
  });
  const petDragRef = useRef(null);

  function petPointerDown(e) {
    e.stopPropagation(); // パネルのスワイプ判定に食われないようにする
    e.currentTarget.setPointerCapture(e.pointerId);
    petDragRef.current = { sx: e.clientX, sy: e.clientY, ox: petPos.x, oy: petPos.y, moved: false };
  }
  function petPointerMove(e) {
    const d = petDragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 8) d.moved = true;
    if (d.moved) setPetPos(petPosFrom(d, e));
  }
  function petPointerUp(e) {
    e.stopPropagation();
    const d = petDragRef.current;
    petDragRef.current = null;
    if (!d) return;
    if (d.moved) {
      const pos = petPosFrom(d, e);
      setPetPos(pos);
      try { localStorage.setItem("gmPetPos_v1", JSON.stringify(pos)); } catch (err) { /* no-op */ }
    } else {
      eng.replayGmBubble(); // タップ: 最後の発言の吹き出しを出し直す
    }
  }
  function petPosFrom(d, e) {
    return {
      x: Math.min(96, Math.max(4, d.ox + (e.clientX - d.sx) / window.innerWidth * 100)),
      y: Math.min(92, Math.max(8, d.oy + (e.clientY - d.sy) / window.innerHeight * 100))
    };
  }
  // 吹き出しはペットのいる側と逆へ伸ばす(右半分にいれば左へ、左半分にいれば右へ)
  const bubbleOnLeft = petPos.x > 50;

  // スワイプ検出: 画面端または開いているパネル内からのスワイプでパネル開閉
  // Pointer Eventsを使うことで、実機のタッチだけでなくMacのマウス/トラックパッドでも
  // 同じロジックで動作確認できる(touch専用イベントだとMacブラウザでは反応しない)。
  useEffect(() => {
    const handlePointerDown = (e) => {
      const x = e.clientX, y = e.clientY;
      const w = window.innerWidth, h = window.innerHeight;
      let panel = null;

      // 画面の端判定(50px以内) または 開いているパネル内
      if (x < 50 || (eng.leftPanelOpen && x < w * 0.30)) panel = "left";
      else if (x > w - 50 || (eng.rightPanelOpen && x > w * 0.70)) panel = "right";
      else if (y > h - 50 || (eng.underPanelOpen && y > h * 0.75)) panel = "under";

      touchStartRef.current = { x, y, panel };
    };

    const handlePointerUp = (e) => {
      if (!touchStartRef.current.panel) return;

      const dx = e.clientX - touchStartRef.current.x;
      const dy = e.clientY - touchStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 30) return; // スワイプの距離が短すぎたら無視

      const panel = touchStartRef.current.panel;

      // 方向判定: 開いている時は出た方向と逆へスワイプで閉じる、閉じている時は元の方向でスワイプで開く
      if (panel === "left") {
        // 左パネル: 開いていて左スワイプで閉じる、閉じていて右スワイプで開く
        if ((eng.leftPanelOpen && dx < 0) || (!eng.leftPanelOpen && dx > 0)) {
          eng.toggleLeftPanel();
        }
      } else if (panel === "right") {
        // 右パネル: 開いていて右スワイプで閉じる、閉じていて左スワイプで開く
        if ((eng.rightPanelOpen && dx > 0) || (!eng.rightPanelOpen && dx < 0)) {
          eng.toggleRightPanel();
        }
      } else if (panel === "under") {
        // 下パネル: 開いていて下スワイプで閉じる、閉じていて上スワイプで開く
        if ((eng.underPanelOpen && dy > 0) || (!eng.underPanelOpen && dy < 0)) {
          eng.toggleUnderPanel();
        }
      }

      touchStartRef.current = { x: 0, y: 0, panel: null };
    };

    document.addEventListener("pointerdown", handlePointerDown, false);
    document.addEventListener("pointerup", handlePointerUp, false);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [eng]);

  // 会話ログは常に最新(最下部)へ。underPanelOpenも依存に入れる: シーン遷移で下パネルが
  // 閉じるとログがアンマウントされ、再表示時にスクロール位置が先頭へ戻ってしまうため
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    if (gmLogRef.current) gmLogRef.current.scrollTop = gmLogRef.current.scrollHeight;
  }, [eng.chat, eng.underPanelOpen]);

  // クリティカル/ファンブル時の画面シェイクはdocument.bodyへの副作用(旧app.jsのscreenFxと同じ手法)
  useEffect(() => {
    if (!eng.shakeSeq) return;
    document.body.classList.remove("shake");
    void document.body.offsetWidth;
    document.body.classList.add("shake");
    const t = setTimeout(() => document.body.classList.remove("shake"), 700);
    return () => clearTimeout(t);
  }, [eng.shakeSeq]);

  function handleSend() {
    const text = input;
    if (!text.trim() || eng.busy) return;
    setInput("");
    eng.sendAction(text);
  }

  return (
    <>
      <div id="rotateNotice">端末を横向きにしてください</div>
      <div id="stage">
        <div id="bgPics" style={{ background: eng.sceneBg }}>
          {/* パララックス(D-027): 空レイヤーがゆっくり横スクロールし、透過前景が手前に重なる。
              素材が404の間はレイヤーが透明のままなので、親のsceneBg(単層img)が見える */}
          {eng.parallax && (
            <>
              <div id="bgSky" style={{ backgroundImage: `url("/images/${eng.parallax.sky}")` }}></div>
              <div id="bgFg" style={{ backgroundImage: `url("/images/${eng.parallax.fg}")` }}></div>
            </>
          )}
        </div>

        {/* 交戦中の敵スプライト。未識別はCSSで黒シルエット、正体判明でtransitionにより実体化。
            素材が404の間は透明のまま(進行はポップアップ表示で担保) */}
        {eng.enemySprite && (
          <div
            id="enemySprite"
            className={eng.enemySprite.identified ? "identified" : ""}
            style={{ backgroundImage: `url("/images/${eng.enemySprite.src}")` }}
          ></div>
        )}

        {/* パーティ立ち絵(4枠)。テーブルを囲む配置で、下部の左右に外側+内側の2枠ずつ。
            発言中のキャラは.activeで明るくなる。素材未提供の枠は描画しない。
            タップで入力欄に「ガレス、」を差し込む(名詞チップと同じ2タップ指示の起点) */}
        {eng.partySlots.map(s => s.img && (
          <div
            key={s.slot}
            className={"partySlot " + s.slot + (eng.activePortrait === s.who ? " active" : "")}
            onClick={() => {
              if (!s.name) return;
              setInput(prev => prev + s.name + "、");
              // 下パネルを開き、左右パネルは閉じる(指示を書く画面状態に揃える)
              setStore({ underPanelOpen: true, leftPanelOpen: false, rightPanelOpen: false });
            }}
          >
            <img src={"/images/" + s.img} alt={s.who} className={s.flip ? "flip" : ""} />
          </div>
        ))}
        {/* 下部の枠はプレイヤーのパーティ専用。依頼人マイラ(報告シーン)は将来、主画面の中央に出す予定 */}

        {/* シーン説明(Figma 11:61の位置)。シーン開始時にフェードインし、約10秒表示してフェードアウト。
            全文は左パネルでいつでも読み返せる */}
        {eng.overlay.text && (
          <div id="sceneDesc" key={eng.overlay.seq}>{eng.overlay.text}</div>
        )}

        {/* 会話ログ(Figma 11:60)。パネルを持たず、シーンの上に透過表示する(GMの地の文は吹き出し側) */}
        {eng.underPanelOpen && (
          <div id="chat" ref={chatRef}>
            {eng.chat.filter(e => !(e.kind === "msg" && e.cls === "gm")).map(entry => <ChatEntry key={entry.id} entry={entry} />)}
          </div>
        )}

        {/* GMペット(主画面常駐・ドラッグで自由配置)+吹き出し(最新のGM発言、約10秒で消える)。
            タップで最後の発言を再表示。履歴は左パネル「GMの語り」で読み返せる */}
        <div
          id="gmPet"
          key={"pet" + eng.gmBubble.seq}
          className={"emotion-" + (eng.gmBubble.emotion || "Neutral").toLowerCase()} /* 表情差分フレームが来たらこのクラスで切替(ASSET_LIST #15b) */
          style={{ left: petPos.x + "%", top: petPos.y + "%", backgroundImage: `url("/images/${eng.gmSprite}")` }}
          onPointerDown={petPointerDown}
          onPointerMove={petPointerMove}
          onPointerUp={petPointerUp}
        ></div>
        {eng.gmBubble.text && (
          <div
            id="gmBubble"
            key={"bub" + eng.gmBubble.seq}
            className={bubbleOnLeft ? "tailRight" : "tailLeft"}
            style={bubbleOnLeft
              ? { right: (100 - petPos.x + 5.5) + "%", top: petPos.y + "%" }
              : { left: (petPos.x + 5.5) + "%", top: petPos.y + "%" }}
          >{eng.gmBubble.text}</div>
        )}

        {/* 左パネル(Figma 15:80): シナリオ名・話数/シーン名・シーン説明・手がかり */}
        {/* パネル開閉タブ: 閉時は画面端に「>>」「<<」、開時はパネルの内側の縁に逆向き矢印。タップで開閉(スワイプと併用可) */}
        <div id="leftPanelTab" className={"panelTab" + (eng.leftPanelOpen ? " open" : "")} onClick={eng.toggleLeftPanel}>
          {eng.leftPanelOpen ? "<<" : ">>"}
        </div>
        <div id="rightPanelTab" className={"panelTab" + (eng.rightPanelOpen ? " open" : "")} onClick={eng.toggleRightPanel}>
          {eng.rightPanelOpen ? ">>" : "<<"}
        </div>

        <div id="leftPanel" className={eng.leftPanelOpen ? "open" : ""}>
          <div className="panelHeader">
            <span>{eng.sceneInfo.title}</span>
            <span>第{eng.sceneInfo.num}話:{eng.sceneInfo.name}</span>
          </div>
          <div className="sceneBrief">{eng.sceneInfo.brief}</div>
          {eng.clues.length > 0 && (
            <>
              <div className="panelTitle">手がかり</div>
              <div className="cluesView">
                {eng.clues.map((c, idx) => <div key={idx} className="clue">・{c}</div>)}
              </div>
            </>
          )}
          {gmLog.length > 0 && (
            <>
              <div className="panelTitle">GMの語り</div>
              <div className="gmLogView" ref={gmLogRef}>
                {gmLog.map(e => <div key={e.id} className="gmLine">{e.text}</div>)}
              </div>
            </>
          )}
        </div>

        {/* 右パネル(Figma 15:105): 状態・持ち物・メニュー・デバッグ情報 */}
        <div id="rightPanel" className={eng.rightPanelOpen ? "open" : ""}>
          <div className="panelTitle">状態</div>
          <div className="hpbar">
            HP
            <div className="track">
              <div
                className="fill"
                style={{ width: (eng.hp / eng.maxHp * 100) + "%", background: eng.hp <= 3 ? "var(--danger)" : "var(--success)" }}
              ></div>
            </div>
            <span>{eng.hp}/{eng.maxHp}</span>
          </div>
          <div className="panelTitle">持ち物</div>
          <div className="itemsView">
            {eng.items.map((i, idx) => <div key={idx} className="item">・{i}</div>)}
          </div>
          <div className="panelMenu">
            <button onClick={eng.exportChronicle}>Chronicle書き出し</button>
            <button onClick={eng.resetGame}>最初から</button>
            {/* scripted検証(D-035候補): hybrid→scripted→llmの順に切替 */}
            <button onClick={eng.toggleGmMode}>GMモード: {eng.gmMode}</button>
          </div>
          <div className="panelTitle">デバッグ情報</div>
          <section>
            <h2>キャラクター状態 <span className="tag">← JSが管理、LLMは書き換え不可</span></h2>
            <pre>{eng.stateJsonText}</pre>
          </section>
          <section>
            <h2>トークン消費(通算) <span className="tag">← このプレイの運用コスト実測</span></h2>
            <pre>{eng.tokenText}</pre>
          </section>
          <section>
            <h2>使用モデル <span className="tag">← サーバー実行時のLLM設定</span></h2>
            <pre>{eng.modelText}</pre>
          </section>
          <section>
            <h2>演出指示(②層) <span className="tag">← 事実ではなく「効果」だけをLLMに渡す</span></h2>
            <pre>{eng.directionText}</pre>
          </section>
          <section>
            <h2>シナリオの秘密(③層) <span className="tag">← プロンプトには開放済み(①層)のみ注入</span></h2>
            <div>
              {eng.secrets.map((s, idx) => (
                <div key={idx} className={"secretRow " + (s.open ? "open" : "locked")}>
                  <span className="lock">{s.open ? "🔓" : "🔒"}</span>
                  <span className="body">{s.text}</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2>ダイスログ <span className="tag">← 乱数はJS、LLMは要求と語りのみ</span></h2>
            <div>{eng.diceLog.map((line, idx) => <div key={idx}>{line}</div>)}</div>
          </section>
          <section>
            <h2>直近のAPIリクエスト概要</h2>
            <pre>{eng.apiViewText}</pre>
          </section>
        </div>

        <div id="underPanel" className={eng.underPanelOpen ? "open" : ""}>
          {(eng.revealedEntities.length > 0 || eng.verbChips.length > 0) && (
            <div id="entityChips">
              {/* 名詞(開示済みオブジェクト)→「〜を」、動詞(使用頻度順)→述語。2タップで指示が完成する */}
              {eng.revealedEntities.map(name => (
                <button key={"n" + name} className="entityChip" onClick={() => setInput(prev => prev + name + "を")}>
                  {name}
                </button>
              ))}
              {eng.verbChips.map(v => (
                <button key={"v" + v} className="entityChip verbChip" onClick={() => setInput(prev => prev + v)}>
                  {v}
                </button>
              ))}
            </div>
          )}

          <div id="inputRow">
            <input
              id="playerInput"
              placeholder="行動を宣言(例:灯りに近づいて様子を見る)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) handleSend();
              }}
            />
            {/* 入力があるときだけ✕(クリア)を出す */}
            {input && (
              <button id="clearBtn" aria-label="入力をクリア" onClick={() => setInput("")}>✕</button>
            )}
            <button id="sendBtn" disabled={eng.busy} onClick={handleSend}>行動</button>
          </div>
        </div>

        <div id="fx" className={eng.fx}></div>
        <PhaserFx />

        {/* 新規開始の幕: 依頼ポップアップの間は背景を隠し、「はじめる」でフェードアウトして開ける */}
        <div id="curtain" className={eng.curtain ? "" : "lifted"}></div>

        {/* ダイスロール待ち: 判定はプレイヤー自身が「ダイスを振る!」で確定する。同行者の判定も名義を出して本人が振る */}
        {eng.pendingRoll && (
          <div id="popupOverlay">
            <div id="popupBox" className="glassPanel">
              <div className="popupTitle">{eng.pendingRoll.actorName}の判定</div>
              <div className="popupBody">🎲 {eng.pendingRoll.reason}(難易度 {eng.pendingRoll.diff})</div>
              <button className="popupBtn rollBtn" onClick={eng.performRoll}>ダイスを振る!</button>
            </div>
          </div>
        )}

        {/* 通知型ポップアップ(EVENT_MAP.md)。依頼提示・ダイス結果・開示画像をキューで順に表示する */}
        {eng.popups.length > 0 && (
          <div id="popupOverlay">
            <div id="popupBox" className={"glassPanel popup-" + (eng.popups[0].kind || "info")}>
              {eng.popups[0].title && <div className="popupTitle">{eng.popups[0].title}</div>}
              {eng.popups[0].body && <div className="popupBody">{eng.popups[0].body}</div>}
              {eng.popups[0].img && (
                <img
                  className={"popupImg" + (eng.popups[0].silhouette ? " silhouette" : "") + (eng.popups[0].sprite ? " sprite" : "")}
                  src={"/images/" + eng.popups[0].img}
                  alt=""
                />
              )}
              <button className="popupBtn" onClick={eng.dismissPopup}>
                {eng.popups[0].kind === "intro" ? "はじめる" : "閉じる"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
