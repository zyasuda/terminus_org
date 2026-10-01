import { useEffect, useRef, useState } from "react";
import "./d20.css";
import frame00 from "../assets/d20-red-00.png";
import frame01 from "../assets/d20-red-01.png";
import frame02 from "../assets/d20-red-02.png";
import frame03 from "../assets/d20-red-03.png";
import frame04 from "../assets/d20-red-04.png";
import frame05 from "../assets/d20-red-05.png";
import frame06 from "../assets/d20-red-06.png";
import frame07 from "../assets/d20-red-07.png";
import frame08 from "../assets/d20-red-08.png";
import frame09 from "../assets/d20-red-09.png";
import frame10 from "../assets/d20-red-10.png";
import frame11 from "../assets/d20-red-11.png";
import frame12 from "../assets/d20-red-12.png";
import frame13 from "../assets/d20-red-13.png";
import frame14 from "../assets/d20-red-14.png";
import frame15 from "../assets/d20-red-15.png";
import stop01 from "../assets/d20-stop-01.png";
import stop02 from "../assets/d20-stop-02.png";
import stop03 from "../assets/d20-stop-03.png";
import stop04 from "../assets/d20-stop-04.png";
import stop05 from "../assets/d20-stop-05.png";
import stop06 from "../assets/d20-stop-06.png";
import stop07 from "../assets/d20-stop-07.png";
import stop08 from "../assets/d20-stop-08.png";
import stop09 from "../assets/d20-stop-09.png";
import stop10 from "../assets/d20-stop-10.png";
import stop11 from "../assets/d20-stop-11.png";
import stop12 from "../assets/d20-stop-12.png";
import stop13 from "../assets/d20-stop-13.png";
import stop14 from "../assets/d20-stop-14.png";
import stop15 from "../assets/d20-stop-15.png";
import stop16 from "../assets/d20-stop-16.png";
import stop17 from "../assets/d20-stop-17.png";
import stop18 from "../assets/d20-stop-18.png";
import stop19 from "../assets/d20-stop-19.png";
import stop20 from "../assets/d20-stop-20.png";

const frames = [frame00, frame01, frame02, frame03, frame04, frame05, frame06, frame07, frame08, frame09, frame10, frame11, frame12, frame13, frame14, frame15];
const stopFrames = [null, stop01, stop02, stop03, stop04, stop05, stop06, stop07, stop08, stop09, stop10, stop11, stop12, stop13, stop14, stop15, stop16, stop17, stop18, stop19, stop20];

export function D20Overlay({ open, result, onComplete, title = "判定", rollLabel = "ダイスを振る" }) {
  const [phase, setPhase] = useState("ready");
  const [frame, setFrame] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!open) return;
    done.current = false;
    setPhase("ready");
    setFrame(0);
  }, [open, result]);

  useEffect(() => {
    if (phase !== "rolling") return;
    const timer = window.setInterval(() => setFrame(n => (n + 1) % frames.length), 55);
    const stop = window.setTimeout(() => setPhase("landed"), 1250);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); };
  }, [phase]);

  /* onCompleteはrefで持つ。呼び出し側は onComplete={() => ...} と書くのが自然で、
     その場合レンダーごとに関数の同一性が変わる。これを依存配列へ入れていると、
     着地中(1050msの待ち)に親が再描画されるたびにcleanupがタイマーを消し、
     done.currentが既にtrueなので再登録もされず、ダイスが「停止」のまま永久に止まる。
     mock2では開示後の同行者の一言(revealFlavor)が数秒遅れて届くため、この窓に高確率で当たる。
     2026-08-19の実プレイで、場面2の判定がここで固まったのを確認した。
     「1回の判定でonCompleteは1回だけ」は、タイマーの中でdoneを見て担保する */
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (phase !== "landed") return;
    const timer = window.setTimeout(() => {
      if (done.current) return;
      done.current = true;
      completeRef.current?.(result);
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [phase, result]);

  if (!open) return null;
  const critical = result === 20;
  const fumble = result === 1;
  return <div className="d20Overlay" role="dialog" aria-modal="true" aria-label={title}>
    <section className={`d20Card d20-${phase} ${critical ? "d20-critical" : ""} ${fumble ? "d20-fumble" : ""}`}>
      <p className="d20Title">{title}</p>
      <div className="d20Stage">
        <span className="d20Shadow" />
        <img className="d20Sprite" src={phase === "landed" ? stopFrames[result] : frames[frame]} alt={`赤い20面ダイス：${result}`} />
      </div>
      {phase === "ready" ? <button className="d20RollButton" onClick={() => setPhase("rolling")}>{rollLabel}</button> : <p className="d20Hint">{phase === "rolling" ? "転がっている…" : "停止"}</p>}
    </section>
  </div>;
}
