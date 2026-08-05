// Phaser演出レイヤー(Phase 3)。ゲーム進行には一切関与しない「演出専用の透明canvas」。
// storeのphaserFx.seqの増分だけを監視して単発の演出を再生する。
// このコンポーネントを外しても(またはengine側のUSE_PHASER_FXをfalseにしても)プレイは壊れない。
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { subscribe, getSnapshot } from "./engine/store.js";

function playDice(scene, { roll, ok, crit, fumble }) {
  const cx = scene.scale.width / 2, cy = scene.scale.height / 2;
  const style = {
    fontFamily: '"Kosugi Maru", sans-serif',
    fontSize: Math.round(scene.scale.height * 0.22) + "px",
    fontStyle: "bold",
    color: "#f90",
    stroke: "#000",
    strokeThickness: 8
  };
  const txt = scene.add.text(cx, cy, "?", style).setOrigin(0.5);
  // 出目がぱらぱら回ってから確定する(旧チャット内アニメのPhaser移植)
  scene.time.addEvent({
    delay: 60, repeat: 11,
    callback: () => txt.setText(String(1 + Math.floor(Math.random() * 20)))
  });
  scene.time.delayedCall(760, () => {
    txt.setText(String(roll));
    txt.setColor(crit ? "#f90" : fumble ? "#f87171" : ok ? "#7dd3fc" : "#f87171");
    scene.tweens.add({ targets: txt, scale: 1.4, duration: 150, yoyo: true });
    scene.tweens.add({ targets: txt, alpha: 0, delay: 700, duration: 300, onComplete: () => txt.destroy() });
  });
}

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
      if (fx.type === "dice") {
        playDice(scene, fx);
      } else if (fx.type === "crit") {
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
