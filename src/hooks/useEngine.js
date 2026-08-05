import { useSyncExternalStore, useEffect, useRef } from "react";
import { subscribe, getSnapshot } from "../engine/store.js";
import * as engine from "../engine/index.js";

// storeのsnapshotをReactに購読させつつ、初回マウント時だけengine.boot()を呼ぶ。
export function useEngine() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const booted = useRef(false);
  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      engine.boot();
    }
  }, []);
  return {
    ...snapshot,
    sendAction: engine.sendAction,
    exportChronicle: engine.exportChronicle,
    resetGame: engine.resetGame,
    dismissPopup: engine.dismissPopup,
    replayGmBubble: engine.replayGmBubble,
    replayCompanionBubble: engine.replayCompanionBubble,
    replayNpcBubble: engine.replayNpcBubble,
    performRoll: engine.performRoll,
    toggleGmMode: engine.toggleGmMode,
    toggleLeftPanel: engine.toggleLeftPanel,
    toggleRightPanel: engine.toggleRightPanel,
    toggleUnderPanel: engine.toggleUnderPanel,
    switchContent: engine.switchContent
  };
}
