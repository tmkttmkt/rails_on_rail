import http from 'http';

// テスト用のクールなマップを構築するためのコマンド配列
const commands = [
  // 1. まず画面を真っさらにする
  { type: "map.clear" },
  
  // 2. 中央に長い直線の複線（2本）を敷設
  {
    type: "track.create",
    geometry: "straight",
    points: [{ x: 100, y: 300 }, { x: 700, y: 300 }],
    trackCount: 2,
    trackSpacing: 12
  },

  // 3. その終端から右上にカーブする複線を敷設
  {
    type: "track.create",
    geometry: "curve",
    points: [{ x: 700, y: 300 }, { x: 900, y: 100 }],
    trackCount: 2,
    trackSpacing: 12,
    startTangent: { x: 1, y: 0 } // 直線から滑らかに繋ぐ
  },

  // 4. 左側の直線の中央あたりに大きな駅（2番線まで）を設置
  {
    type: "station.createRange",
    name: "AI中央駅",
    trackId: "track-1",
    startPosition: { x: 200, y: 300 },
    endPosition: { x: 400, y: 300 },
    includeTrackGroup: true
  },
  
  // 5. カーブの先の終端に小さな駅を設置
  {
    type: "station.createRange",
    name: "AI山手駅",
    trackId: "track-3",
    startPosition: { x: 750, y: 250 },
    endPosition: { x: 850, y: 150 },
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
      console.log("✅ テストマップのコマンド送信に成功しました！ブラウザの画面を確認してください。");
    } else {
      console.log("⚠️ サーバーから予期しない応答が返りました。");
      console.log("HTMLが返ってきている場合、新しく作成した vite.config.ts がまだ読み込まれていません。");
      console.log("お手数ですが、現在起動中の `npm run dev` を一度Ctrl+Cで停止し、再起動してからもう一度お試しください。");
    }
  });
});

req.on('error', (e) => {
  console.log("❌ サーバーに接続できませんでした。`npm run dev` が起動しているか確認してください。");
});

req.write(JSON.stringify(commands));
req.end();
