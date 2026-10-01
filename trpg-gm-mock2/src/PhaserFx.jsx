// Phaser演出レイヤー(Phase 3)。ゲーム進行には一切関与しない「演出専用の透明canvas」。
// storeのphaserFx.seqの増分だけを監視して単発の演出を再生する。
// このコンポーネントを外しても(またはengine側のUSE_PHASER_FXをfalseにしても)プレイは壊れない。
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { subscribe, getSnapshot } from "./engine/store.js";

export default function PhaserFx() {
  const ref = useRef(null);
  useEffect(() => {
    const parent = ref.current;
    let scene = null;
    let game = null;

    /* Phaserはマウント時点の親要素のサイズでcanvasを作る。Reactのマウント直後は
       レイアウトが未確定で親が0×0のため、そのまま作るとcanvas.width/heightが0のまま
       残り、cameras.main.flash()が毎フレーム
       「Framebuffer status: Incomplete Attachment」で例外を投げる
       (2026-08-19実測: 親は1280×720なのにcanvasバッファは0×0)。
       この例外がstoreの購読経路を遡って戦闘の手番を中断させ、ゲームが固まっていた。
       そのため「親に実サイズが付くまで作らない」+「以後はResizeObserverで追随」にする */
    const start = (w, h) => {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        transparent: true,
        parent,
        width: w,
        height: h,
        scale: { mode: Phaser.Scale.RESIZE },
        scene: { create() { scene = this; } }
      });
    };

    const observer = new ResizeObserver(() => {
      const w = parent.clientWidth, h = parent.clientHeight;
      if (!w || !h) return; // 非表示中(display:none等)は作らない・触らない
      if (!game) start(w, h);
      else game.scale.resize(w, h);
    });
    observer.observe(parent);

    let lastSeq = getSnapshot().phaserFx.seq;
    const unsub = subscribe(() => {
      const fx = getSnapshot().phaserFx;
      if (!scene || fx.seq === lastSeq) return;
      lastSeq = fx.seq;
      if (fx.type === "crit") {
        scene.cameras.main.flash(500, 255, 153, 0);
        scene.cameras.main.shake(400, 0.012);
      } else if (fx.type === "fumble") {
        scene.cameras.main.flash(500, 248, 113, 113);
        scene.cameras.main.shake(400, 0.008);
      } else if (fx.type === "damage") {
        // 被ダメージ: 赤いフラッシュ+強めのシェイク(body.shakeの揺れも並行して走る)
        scene.cameras.main.flash(600, 255, 60, 60);
        scene.cameras.main.shake(500, 0.015);
      }
    });
    return () => {
      observer.disconnect();
      unsub();
      if (game) game.destroy(true);
    };
  }, []);
  return <div id="phaserFx" ref={ref}></div>;
}
