// Phaser演出レイヤー(Phase 3)。ゲーム進行には一切関与しない「演出専用の透明canvas」。
// storeのphaserFx.seqの増分だけを監視して単発の演出を再生する。
// このコンポーネントを外しても(またはengine側のUSE_PHASER_FXをfalseにしても)プレイは壊れない。
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { subscribe, getSnapshot } from "./engine/store.js";

export default function PhaserFx() {
  const ref = useRef(null);
  useEffect(() => {
    let scene = null;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      transparent: true,
      parent: ref.current,
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      scene: { create() { scene = this; } }
    });
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
    return () => { unsub(); game.destroy(true); };
  }, []);
  return <div id="phaserFx" ref={ref}></div>;
}
