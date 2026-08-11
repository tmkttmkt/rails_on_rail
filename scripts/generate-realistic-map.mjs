import http from 'http';

// 追い越し線、渡り線、車庫を備えた超リアルな実用マップ
const commands = [
  { type: "map.clear" },

  // 1. 本線（複線） (track-1: 上り/北側, track-2: 下り/南側)
  {
    type: "track.create",
    geometry: "straight",
    points: [{ x: 100, y: 300 }, { x: 1100, y: 300 }],
    trackCount: 2,
    trackSpacing: 12
  },

  // 2. 追い越し線 (北側 - 上り待避線) (track-3)
  {
    type: "track.create",
    geometry: "curve",
    points: [
      { x: 350, y: 294 }, // 分岐
      { x: 450, y: 270 }, // 膨らみ
      { x: 750, y: 270 },
      { x: 850, y: 294 }  // 合流
    ],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent: { x: 1, y: 0 },
    startConnectionTrackId: "track-1",
    endConnectionTrackId: "track-1"
  },

  // 3. 追い越し線 (南側 - 下り待避線) (track-4)
  {
    type: "track.create",
    geometry: "curve",
    points: [
      { x: 350, y: 306 }, 
      { x: 450, y: 330 }, 
      { x: 750, y: 330 },
      { x: 850, y: 306 }
    ],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent: { x: 1, y: 0 },
    startConnectionTrackId: "track-2",
    endConnectionTrackId: "track-2"
  },

  // 4. 渡り線 (西側: 上り→下り) (track-5)
  {
    type: "track.create",
    geometry: "curve",
    points: [{ x: 200, y: 294 }, { x: 300, y: 306 }],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent: { x: 1, y: 0 },
    startConnectionTrackId: "track-1",
    endConnectionTrackId: "track-2"
  },

  // 5. 渡り線 (東側: 下り→上り) (track-6)
  {
    type: "track.create",
    geometry: "curve",
    points: [{ x: 900, y: 306 }, { x: 1000, y: 294 }],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent: { x: 1, y: 0 },
    startConnectionTrackId: "track-2",
    endConnectionTrackId: "track-1"
  },

  // 6. 車庫への引き込み線と車庫 (南側に4線のヤード) (track-7, 8, 9, 10)
  {
    type: "track.create",
    geometry: "curve",
    points: [
      { x: 800, y: 306 }, // 本線下りから分岐
      { x: 900, y: 450 },
      { x: 1100, y: 450 } // 車庫
    ],
    trackCount: 4,
    trackSpacing: 12,
    startTangent: { x: 1, y: 0 },
    endTangent: { x: 1, y: 0 },
    startConnectionTrackId: "track-2"
  },

  // --- 駅の設置 ---

  // 中央待避駅（本線上り）
  {
    type: "station.createRange",
    name: "AI総合車両センター前",
    trackId: "track-1",
    startPosition: { x: 500, y: 294 },
    endPosition: { x: 700, y: 294 },
    includeTrackGroup: false
  },
  // 中央待避駅（本線下り）
  {
    type: "station.createRange",
    name: "AI総合車両センター前_下り",
    trackId: "track-2",
    startPosition: { x: 500, y: 306 },
    endPosition: { x: 700, y: 306 },
    includeTrackGroup: false
  },
  // 中央待避駅（待避線上り）
  {
    type: "station.createRange",
    name: "AI総合車両センター前_待避上",
    trackId: "track-3",
    startPosition: { x: 500, y: 270 },
    endPosition: { x: 700, y: 270 },
    includeTrackGroup: false
  },
  // 中央待避駅（待避線下り）
  {
    type: "station.createRange",
    name: "AI総合車両センター前_待避下",
    trackId: "track-4",
    startPosition: { x: 500, y: 330 },
    endPosition: { x: 700, y: 330 },
    includeTrackGroup: false
  },
  
  // 4つのプラットフォームを1つの巨大駅に統合する
  {
    type: "station.merge",
    stationIds: ["station-1", "station-2", "station-3", "station-4"]
  },

  // 統合した駅をリネーム
  {
    type: "station.rename",
    stationId: "station-1",
    name: "AI総合車両センター前 (2面4線)"
  },

  // 西のターミナル駅 (本線上り・下り)
  {
    type: "station.createRange",
    name: "AI西口ターミナル",
    trackId: "track-1",
    startPosition: { x: 100, y: 294 },
    endPosition: { x: 180, y: 294 },
    includeTrackGroup: true
  },

  // 東のターミナル駅 (本線上り・下り)
  {
    type: "station.createRange",
    name: "AI東口ターミナル",
    trackId: "track-1",
    startPosition: { x: 1100, y: 294 },
    endPosition: { x: 950, y: 294 },
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
      console.log("✅ 追い越し線・渡り線・車庫を含むリアルマップの送信に成功しました！");
      console.log("⏳ ブラウザがマップを構築するのを待機しています...");
      
      // ブラウザがコマンドを処理して新しい状態をサーバーに同期するのを待機
      setTimeout(() => {
        http.get('http://localhost:5173/api/state', (stateRes) => {
          let stateBody = '';
          stateRes.on('data', c => stateBody += c);
          stateRes.on('end', () => {
            const saveFile = {
              formatVersion: 1,
              metadata: { name: "Realistic Map (AI Generated)", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              state: JSON.parse(stateBody)
            };
            
            const saveReq = http.request('http://localhost:5173/api/server-saves', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            }, (saveRes) => {
              let saveResBody = '';
              saveRes.on('data', c => saveResBody += c);
              saveRes.on('end', () => {
                console.log(`💾 サーバーのセーブデータ (saves/ フォルダ) として保存完了しました！: ${JSON.parse(saveResBody).filename}`);
              });
            });
            saveReq.write(JSON.stringify(saveFile));
            saveReq.end();
          });
        });
      }, 3000); // 3秒待機
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
