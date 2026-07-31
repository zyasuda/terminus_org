/* チャプター画面。左ツリーでチャプターを選んだときに開く。構成管理はここへ集約する。
   ponytail: チャプター名の入力欄は renderStructureManager が既に持っているので、ここでは作らない */
function renderChapterOverview(){return `<h2>チャプター設定</h2><p class="hint">この章のシーンの並びを編集します。名称変更・追加・削除・並べ替えは自動保存されます。</p>${renderStructureManager(activeChapter)}`}
function bindChapterOverview(){bindStructureManager()}
