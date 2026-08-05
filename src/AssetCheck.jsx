import { useEffect, useState } from "react";

function AssetCard({ id, asset }) {
  const [loaded, setLoaded] = useState(null);
  const src = `/images/${asset.file}`;

  return (
    <article className="assetCard">
      <div className="assetPreview">
        {loaded !== false && <img src={src} alt="" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />}
        {loaded === false && <span className="assetMissing">未配置</span>}
      </div>
      <div className="assetMeta">
        <div className="assetHeading">
          <h2>{id}</h2>
          <span className={`assetStatus status-${asset.status}`}>{asset.status}</span>
        </div>
        <dl>
          <dt>ファイル</dt><dd>{asset.file}</dd>
          <dt>種別</dt><dd>{asset.kind}</dd>
          {asset.target && <><dt>目標</dt><dd>{asset.target}</dd></>}
          <dt>状態</dt><dd>{loaded === null ? "確認中" : loaded ? "読み込み成功" : "ファイルなし"}</dd>
        </dl>
        {asset.usedBy?.length > 0 && <p className="assetUsage">使用先: {asset.usedBy.join(", ")}</p>}
        {asset.notes && <p className="assetNotes">{asset.notes}</p>}
      </div>
    </article>
  );
}

export default function AssetCheck() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/data/assets.json")
      .then(res => {
        if (!res.ok) throw new Error(`assets.json の取得に失敗しました (${res.status})`);
        return res.json();
      })
      .then(setManifest)
      .catch(err => setError(err.message));
  }, []);

  if (error) return <main className="assetCheck"><h1>アセット確認</h1><p className="assetError">{error}</p></main>;
  if (!manifest) return <main className="assetCheck"><h1>アセット確認</h1><p>台帳を読み込んでいます…</p></main>;

  const entries = Object.entries(manifest.assets).filter(([, asset]) => filter === "all" || asset.status === filter);
  const statuses = ["all", "pending", "approved", "hold", "rejected"];

  return (
    <main className="assetCheck">
      <header className="assetHeader">
        <div>
          <p className="assetKicker">mock2 / development</p>
          <h1>アセット確認</h1>
          <p>生成候補と承認済み素材の配置・用途を確認します。</p>
        </div>
        <a href="/">ゲーム画面へ戻る</a>
      </header>
      <nav className="assetFilters" aria-label="ステータスフィルター">
        {statuses.map(status => (
          <button key={status} className={filter === status ? "selected" : ""} onClick={() => setFilter(status)}>
            {status === "all" ? "すべて" : status}
          </button>
        ))}
      </nav>
      <section className="assetGrid">
        {entries.map(([id, asset]) => <AssetCard key={id} id={id} asset={asset} />)}
      </section>
    </main>
  );
}
