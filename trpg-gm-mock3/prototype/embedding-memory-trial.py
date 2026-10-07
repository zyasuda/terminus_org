"""EmbeddingGemma 2の独立比較試験。本編・外部会話APIには未接続です。"""
import argparse
import json
import math
import statistics
import time
import urllib.request

MODEL = "embeddinggemma-2:270m"
ACTORS = {"ines", "brom", "gareth", "lydia"}
# 合成会話です。検索対象に入れる前に閲覧権限を判定します。
HISTORY = [
    {"id": "lock", "text": "ガレス：広間の古い錠前は俺が外す。水の圧力がなくなったら声をかけてくれ。", "readers": sorted(ACTORS)},
    {"id": "loan", "text": "ブロム：金槌はイネスに貸した。返してもらったら自分で装備し直す。", "readers": sorted(ACTORS)},
    {"id": "secret", "text": "リディアの未共有の調査結果：青い粉は消灯すると見える。", "readers": ["lydia"]},
    {"id": "map", "text": "リディア：地図は渡さず、ここで広げてみんなに見せる。", "readers": sorted(ACTORS)},
] + [
    {"id": f"recent-{i}", "text": text, "readers": sorted(ACTORS)}
    for i, text in enumerate([
        "イネス：通路の石が冷たい。", "ブロム：重い荷物なら任せろ。",
        "ガレス：足元には気をつけよう。", "リディア：ランタンは灯っている。",
        "イネス：ここで一息つこう。", "ブロム：次の行き先を相談しよう。",
    ])
]
CASES = [
    ("gareth", "さっきの鍵を開ける役、誰だった？", "lock"),
    ("brom", "貸した道具を返してもらった後はどうする？", "loan"),
    ("ines", "地図を見せてもらうと持ち主が変わるの？", "map"),
    ("lydia", "青い粉の見つけ方を覚えている？", "secret"),
    ("gareth", "青い粉の見つけ方を覚えている？", None),
]


def visible(history, actor):
    if actor not in ACTORS:
        raise ValueError("不明な人物です")
    return [row for row in history if actor in row.get("readers", [])]


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b)) / (
        math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    )


def self_check():
    assert "secret" not in {x["id"] for x in visible(HISTORY, "gareth")}
    assert "secret" in {x["id"] for x in visible(HISTORY, "lydia")}
    assert not visible([{"id": "no-acl", "text": "秘密"}], "ines")
    try:
        visible(HISTORY, "unknown")
    except ValueError:
        pass
    else:
        raise AssertionError("不明な人物を拒否しませんでした")
    assert abs(cosine([1, 0], [1, 0]) - 1) < 1e-9
    print("PASS: 5 checks — 検索前の閲覧制限 / 本人の秘密 / 権限欠落の拒否 / 不明な人物の拒否 / 類似度")


def benchmark():
    cache = {}
    def embed(text):
        request = urllib.request.Request(
            "http://127.0.0.1:11434/api/embed",
            json.dumps({"model": MODEL, "input": text, "truncate": False}).encode(),
            {"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
        vector = result["embeddings"][0]
        if len(vector) != 768 or not all(math.isfinite(x) for x in vector) or not any(vector):
            raise ValueError("不正な埋め込みです")
        return vector, result.get("prompt_eval_count"), result.get("load_duration", 0)

    times, results = [], []
    initial_load_ms = 0
    for actor, query, expected in CASES:
        rows = visible(HISTORY, actor)  # 権限判定後にだけモデルへ渡します。
        started = time.perf_counter()
        for row in rows:
            if row["id"] not in cache:
                vector, tokens, load_ns = embed("title: none | text: " + row["text"])
                cache[row["id"]] = (vector, tokens)
                initial_load_ms = max(initial_load_ms, load_ns / 1e6)
        index_ms = round((time.perf_counter() - started) * 1000, 1)
        started = time.perf_counter()
        q, query_tokens, _ = embed("task: search result | query: " + query)
        ranked = sorted(rows, key=lambda row: cosine(q, cache[row["id"]][0]), reverse=True)
        selected, recent = ranked[:3], rows[-6:]
        elapsed = round((time.perf_counter() - started) * 1000, 1)
        times.append(elapsed)
        def tokens(items):
            values = [cache[r["id"]][1] for r in items]
            return sum(values) if all(v is not None for v in values) else None
        results.append({
            "actor": actor, "query": query, "expected": expected,
            "recentIds": [r["id"] for r in recent], "retrievedIds": [r["id"] for r in selected],
            "recentHit": expected in [r["id"] for r in recent] if expected else None,
            "retrievedHit": expected in [r["id"] for r in selected] if expected else None,
            "secretLeak": actor != "lydia" and any(r["id"] == "secret" for r in selected),
            "embeddingPromptTokens": {"full": tokens(rows), "recent6": tokens(recent), "retrieved3": tokens(selected)},
            "historyChars": {"full": sum(len(r["text"]) for r in rows), "recent6": sum(len(r["text"]) for r in recent), "retrieved3": sum(len(r["text"]) for r in selected)},
            "newDocumentsEncodingMs": index_ms, "queryAndRankingMs": elapsed,
        })
    assert not any(row["secretLeak"] for row in results)
    eligible = [r for r in results if r["expected"]]
    print(json.dumps({"model": MODEL, "syntheticFixture": True,
                      "backend": "local Ollama", "initialLoadMs": round(initial_load_ms, 1),
                      "dimensions": len(q), "medianQueryMs": statistics.median(times),
                      "hitAt3": sum(r["retrievedHit"] for r in eligible) / len(eligible),
                      "recent6HitRate": sum(r["recentHit"] for r in eligible) / len(eligible),
                      "tokenCountNote": "Embeddingモデルのprefix込み入力トークン合計。Claudeの課金トークンではありません。",
                      "cases": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
    else:
        benchmark()
