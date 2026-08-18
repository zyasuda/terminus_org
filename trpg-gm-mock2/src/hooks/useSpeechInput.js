import { useCallback, useEffect, useRef, useState } from "react";

/* 音声で行動を宣言するためのフック。
   スマホの横持ちでは、ソフトキーボードを出すと立ち絵・背景・チップが隠れてしまい、
   一番見せたい画面が入力のたびに消える。画面内のマイクから話せればキーボードを出さずに済む。

   Web Speech API(webkitSpeechRecognition)を使う。実装はブラウザ側にあるので依存は増えない。
   Chrome / Edge / Safari 14.1+ は対応、Firefoxは未対応。HTTPSが必須(basicSslで満たしている)。

   未対応・マイク拒否のときは supported=false のままにして、呼び出し側がボタンを出さない。
   従来の文字入力はそのまま残るので、音声が使えなくても操作は詰まらない。 */

// 実装の在り処。webkit接頭辞つきしか無いブラウザがあるため両方見る
const Recognition = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export function useSpeechInput({ onResult, lang = "ja-JP" } = {}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef(null);
  /* onResultは呼び出し側で毎回作り直される可能性がある。認識インスタンスは作り直したくないので、
     最新の関数をrefで持ち、ハンドラからはrefを読む */
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = false;   // 一度の宣言ごとに切る(会話の区切りが行動の区切り)
    rec.interimResults = false; // 確定だけを入力欄へ入れる。途中経過を入れると文字が踊って読めない
    rec.maxAlternatives = 1;
    rec.onresult = e => {
      const text = Array.from(e.results).map(r => r[0].transcript).join("").trim();
      if (text) onResultRef.current?.(text);
    };
    /* not-allowed(拒否)とservice-not-allowedは、以降も使えないので理由を出す。
       no-speech(無音)とaborted(こちらから停止)は正常な終わり方なので黙って戻す */
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("マイクが許可されていません");
      else if (e.error === "network") setError("音声認識はネット接続が必要です");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.abort(); } catch (e) { /* 既に止まっていれば無視 */ } };
  }, [lang]);

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) { try { rec.stop(); } catch (e) { /* no-op */ } return; }
    setError("");
    try { rec.start(); setListening(true); }
    catch (e) { /* 連打で「already started」になることがある。状態だけ合わせる */ setListening(true); }
  }, [listening]);

  return { supported: Boolean(Recognition), listening, error, toggle };
}
