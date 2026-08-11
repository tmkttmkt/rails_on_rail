import http from 'http';

// 大規模な環状線＋支線マップを構築するコマンド群
const commands = [
  { type: "map.clear" },

  // 1. 上部直線 (track-1, track-2)
  {
    type: "track.create",
    geometry: "straight",
    points: [{ x: 300, y: 200 }, { x: 700, y: 200 }],
    trackCount: 2,
    trackSpacing: 12
  },

  // 2. 右側半円カーブ (track-3, track-4)
  {
    type: "track.create",
    geometry: "curve",
    points: [{ x: 700, y: 200 }, { x: 700, y: 800 }],
    trackCount: 2,
    trackSpacing: 12,
    startTangent: { x: 1, y: 0 },
    endTangent: { x: -1, y: 0 }
  },

  // 3. 下部直線 (track-5, track-6)
  {
    type: "track.create",
    geometry: "straight",
    points: [{ x: 700, y: 800 }, { x: 300, y: 800 }],
    trackCount: 2,
    trackSpacing: 12
  },

  // 4. 左側半円カーブ (track-7, track-8)
  {
    type: "track.create",
    geometry: "curve",
    points: [{ x: 300, y: 800 }, { x: 300, y: 200 }],
    trackCount: 2,
    trackSpacing: 12,
    startTangent: { x: -1, y: 0 },
    endTangent: { x: 1, y: 0 }
  },

  // 5. 支線 (track-9, track-10) 上部直線の中央から北へ
  {
    type: "track.create",
    geometry: "straight",
    points: [{ x: 500, y: 200 }, { x: 500, y: -400 }],
    trackCount: 2,
    trackSpacing: 12
  },

  // --- 駅の設置 ---
  
  // 北駅 (上部直線)
  {
    type: "station.createRange",
    name: "環状北駅",
    trackId: "track-1",
    startPosition: { x: 400, y: 200 },
    endPosition: { x: 600, y: 200 },
    includeTrackGroup: true
  },

  // 南駅 (下部直線)
  {
    type: "station.createRange",
    name: "環状南駅",
    trackId: "track-5",
    startPosition: { x: 600, y: 800 },
    endPosition: { x: 400, y: 800 },
    includeTrackGroup: true
  },

  // 東駅 (右側半円)
  {
    type: "station.createRange",
    name: "環状東駅",
    trackId: "track-3",
    startPosition: { x: 950, y: 400 }, // カーブの頂点付近を狙ってスナップさせる
    endPosition: { x: 950, y: 600 },
    includeTrackGroup: true
  },

  // 西駅 (左側半円)
  {
    type: "station.createRange",
    name: "環状西駅",
    trackId: "track-7",
    startPosition: { x: 50, y: 600 },
    endPosition: { x: 50, y: 400 },
    includeTrackGroup: true
  },

  // 支線駅 (北の果て)
  {
    type: "station.createRange",
    name: "新都心ターミナル",
    trackId: "track-9",
    startPosition: { x: 500, y: -100 },
    endPosition: { x: 500, y: -300 },
    includeTrackGroup: true
  }
];

const req = http.request('http://localhost:5173/api/commands', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 200 && body === 'OK') {
      console.log("✅ 大規模テストマップのコマンド送信に成功しました！");
    } else {
      console.log(`⚠️ サーバーからエラー応答: ${res.statusCode} ${body}`);
    }
  });
});

req.on('error', (e) => {
  console.log("❌ サーバーに接続できませんでした。");
});

req.write(JSON.stringify(commands));
req.end();
