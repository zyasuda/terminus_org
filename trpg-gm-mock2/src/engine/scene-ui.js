import { SCENARIO } from "../scenario.js";
import { setStore } from "./store.js";

export function setSceneInfo(state) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  setStore({ sceneInfo: {
    num: state.sceneIndex + 1, total: SCENARIO.scenes.length, brief: sc.brief, report: !!sc.report,
    title: SCENARIO.title, name: sc.name || ""
  } });
}

export function setDialogueNodeInfo(node, state) {
  setStore({ sceneInfo: {
    num: state.sceneIndex + 1, total: SCENARIO.scenes.length, brief: node.brief || node.text || "", report: false,
    title: SCENARIO.title, name: node.name || ""
  } });
}

let overlayTimer = null;

export function clearSceneOverlayTimer() {
  clearTimeout(overlayTimer);
}

export function openUnderPanelAfterOverlay() {
  clearSceneOverlayTimer();
  overlayTimer = setTimeout(() => setStore({ underPanelOpen: true }), 1000);
}

// シーン説明はGMペットの吹き出しで語る(呼び出し側のaddGm)。ここは下パネルを閉じて
// 1秒後に開き直すだけ(演出の間合い)。以前はここで主画面にもフェード表示していたが、
// GMペットの吹き出しと文面が重複していたため削除した
export function showSceneOverlay() {
  setStore({ underPanelOpen: false });
  openUnderPanelAfterOverlay();
}
