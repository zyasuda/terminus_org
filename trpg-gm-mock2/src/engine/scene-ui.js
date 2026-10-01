import { SCENARIO } from "../scenario.js";
import { setStore } from "./store.js";

export function setSceneInfo(state) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  setStore({ sceneInfo: {
    num: state.sceneIndex + 1, total: SCENARIO.scenes.length, brief: sc.brief, report: !!sc.report,
    title: SCENARIO.title, name: sc.name || ""
  } });
}

// イントロ/エンディングのノードは、同じ文面をGMが吹き出しで語り、左パネルの「GMの語り」に
// 積まれる(index.jsのshowDialogueNodeが node.brief || node.text を addGm する)。
// ここでもbriefを出すと左パネル内で同じ文が二重に並ぶため、シーン説明欄は空にする
export function setDialogueNodeInfo(node, state) {
  setStore({ sceneInfo: {
    num: state.sceneIndex + 1, total: SCENARIO.scenes.length, brief: "", report: false,
    title: SCENARIO.title, name: node.name || ""
  } });
}

/* 下パネルを開けるのは「語りが終わってから」。時間で開ける経路(1秒後に開く
   openUnderPanelAfterOverlay / showSceneOverlay と、そのタイマー)は 2026-08-21 に削除した。
   あれが残っていると、場面遷移でもイントロでも、依頼人や同行者の吹き出しを読んでいる
   途中でパネルが上がって主画面が狭くなる。作者の要望で、場面遷移(advanceScene)・
   イントロ・アウトロ・開幕の4経路すべてを runSpeechSequence の onDone に揃えた。
   GM・NPC・同行者の吹き出しは主画面に出るので、閉じている間の方がよく読める。
   タイマーを持たないので「前の遷移の予約が割り込む」ことも起きない。 */
export function closeUnderPanelForScene() {
  setStore({ underPanelOpen: false });
}

export function openUnderPanel() {
  setStore({ underPanelOpen: true });
}
