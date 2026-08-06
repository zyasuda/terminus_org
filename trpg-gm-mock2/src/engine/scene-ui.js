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

export function showSceneOverlay(state) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  setStore(s => ({
    overlay: { text: sc.brief, seq: s.overlay.seq + 1 },
    underPanelOpen: false
  }));
  openUnderPanelAfterOverlay();
}
