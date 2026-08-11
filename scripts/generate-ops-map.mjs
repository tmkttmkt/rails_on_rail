import http from 'http';

/**
 * 西ノ宮線 (運行テスト用)
 *
 * Layout (center = origin):
 *   本線複線  x=-380〜+380, track-1(上り y=-6), track-2(下り y=+6)
 *   北待避線  track-3: x=-220〜+220, peak y=-40  (上り本線 分岐・合流)
 *   南待避線  track-4: x=-220〜+220, peak y=+40  (下り本線 分岐・合流)
 *   西渡線    track-5: x=-305〜-255  (上り→下り)
 *   東渡線    track-6: x=+255〜+305  (下り→上り)
 *   車庫4線   track-7〜10: x=+180〜+380, y=+90 周辺 (下り本線から分岐)
 *
 * Stations:
 *   西ノ宮   station-1  (西端ターミナル, 2線)
 *   北条     station-2  (中間, 2線)
 *   中央     station-3  (中央, 2面4線 = 本線+待避線統合)
 *   東条     station-7  (中間, 2線)
 *   東ノ宮   station-8  (東端ターミナル, 2線)
 */

const PORT = 5174;

const commands = [
  { type: 'map.clear' },

  // ── 線路 ──────────────────────────────────────────────

  // 1. 本線複線 (track-1: 上り y=-6, track-2: 下り y=+6)
  {
    type: 'track.create',
    geometry: 'straight',
    points: [{ x: -380, y: 0 }, { x: 380, y: 0 }],
    trackCount: 2,
    trackSpacing: 12,
  },

  // 2. 北待避線 (track-3) ── 上り本線から外れ上り本線へ戻る
  {
    type: 'track.create',
    geometry: 'curve',
    points: [
      { x: -220, y: -6  },
      { x: -130, y: -40 },
      { x:  130, y: -40 },
      { x:  220, y: -6  },
    ],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent:   { x: 1, y: 0 },
    startConnectionTrackId: 'track-1',
    endConnectionTrackId:   'track-1',
  },

  // 3. 南待避線 (track-4) ── 下り本線から外れ下り本線へ戻る
  {
    type: 'track.create',
    geometry: 'curve',
    points: [
      { x: -220, y:  6  },
      { x: -130, y:  40 },
      { x:  130, y:  40 },
      { x:  220, y:  6  },
    ],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent:   { x: 1, y: 0 },
    startConnectionTrackId: 'track-2',
    endConnectionTrackId:   'track-2',
  },

  // 4. 西渡線 (track-5) ── 上り→下り
  {
    type: 'track.create',
    geometry: 'curve',
    points: [{ x: -305, y: -6 }, { x: -255, y: 6 }],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent:   { x: 1, y: 0 },
    startConnectionTrackId: 'track-1',
    endConnectionTrackId:   'track-2',
  },

  // 5. 東渡線 (track-6) ── 下り→上り
  {
    type: 'track.create',
    geometry: 'curve',
    points: [{ x: 255, y: 6 }, { x: 305, y: -6 }],
    trackCount: 1,
    startTangent: { x: 1, y: 0 },
    endTangent:   { x: 1, y: 0 },
    startConnectionTrackId: 'track-2',
    endConnectionTrackId:   'track-1',
  },

  // 6. 車庫引込線+留置4線 (track-7〜10) ── 下り本線の東寄りから南へ分岐
  {
    type: 'track.create',
    geometry: 'curve',
    points: [
      { x: 180, y:  6  },
      { x: 270, y:  90 },
      { x: 380, y:  90 },
    ],
    trackCount: 4,
    trackSpacing: 12,
    startTangent: { x: 1, y: 0 },
    endTangent:   { x: 1, y: 0 },
    startConnectionTrackId: 'track-2',
  },

  // ── 駅 ───────────────────────────────────────────────

  // 西ノ宮 (station-1)
  {
    type: 'station.createRange',
    name: '西ノ宮',
    trackId: 'track-1',
    startPosition: { x: -365, y: -6 },
    endPosition:   { x: -310, y: -6 },
    includeTrackGroup: true,
  },

  // 北条 (station-2)
  {
    type: 'station.createRange',
    name: '北条',
    trackId: 'track-1',
    startPosition: { x: -185, y: -6 },
    endPosition:   { x: -130, y: -6 },
    includeTrackGroup: true,
  },

  // 中央 ── 上り本線 (station-3)
  {
    type: 'station.createRange',
    name: '中央_上り',
    trackId: 'track-1',
    startPosition: { x: -70, y: -6 },
    endPosition:   { x:  70, y: -6 },
    includeTrackGroup: false,
  },

  // 中央 ── 下り本線 (station-4)
  {
    type: 'station.createRange',
    name: '中央_下り',
    trackId: 'track-2',
    startPosition: { x: -70, y: 6 },
    endPosition:   { x:  70, y: 6 },
    includeTrackGroup: false,
  },

  // 中央 ── 北待避線 (station-5)
  {
    type: 'station.createRange',
    name: '中央_北待避',
    trackId: 'track-3',
    startPosition: { x: -100, y: -40 },
    endPosition:   { x:  100, y: -40 },
    includeTrackGroup: false,
  },

  // 中央 ── 南待避線 (station-6)
  {
    type: 'station.createRange',
    name: '中央_南待避',
    trackId: 'track-4',
    startPosition: { x: -100, y: 40 },
    endPosition:   { x:  100, y: 40 },
    includeTrackGroup: false,
  },

  // 中央 4プラットフォームを1駅に統合
  { type: 'station.merge', stationIds: ['station-3', 'station-4', 'station-5', 'station-6'] },
  { type: 'station.rename', stationId: 'station-3', name: '中央' },

  // 東条 (station-7)
  {
    type: 'station.createRange',
    name: '東条',
    trackId: 'track-1',
    startPosition: { x: 130, y: -6 },
    endPosition:   { x: 185, y: -6 },
    includeTrackGroup: true,
  },

  // 東ノ宮 (station-8)
  {
    type: 'station.createRange',
    name: '東ノ宮',
    trackId: 'track-1',
    startPosition: { x: 310, y: -6 },
    endPosition:   { x: 365, y: -6 },
    includeTrackGroup: true,
  },
];

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`http://localhost:${PORT}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${path}`, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('🚉 西ノ宮線マップ生成中...');

  const send = await post('/api/commands', commands);
  if (send.status !== 200 || send.body !== 'OK') {
    console.error(`❌ コマンド送信エラー: ${send.status} ${send.body}`);
    process.exit(1);
  }
  console.log('✅ コマンド送信完了。ブラウザの処理を3秒待機中...');

  await new Promise(r => setTimeout(r, 3000));

  const stateRes = await get('/api/state');
  if (stateRes.status !== 200) {
    console.error(`❌ 状態取得エラー: ${stateRes.status}`);
    process.exit(1);
  }

  const state = JSON.parse(stateRes.body);
  console.log(`📊 線路数: ${state.tracks?.length ?? '?'}, 駅数: ${state.stations?.length ?? '?'}`);

  const saveData = {
    formatVersion: 1,
    metadata: {
      name: '西ノ宮線（運行テスト）',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    state,
  };

  const saveRes = await post('/api/server-saves', saveData);
  if (saveRes.status !== 200) {
    console.error(`❌ 保存エラー: ${saveRes.status} ${saveRes.body}`);
    process.exit(1);
  }

  const saved = JSON.parse(saveRes.body);
  console.log(`💾 保存完了: saves/${saved.filename}`);
  console.log('📌 ブラウザで読み込みボタンから「西ノ宮線（運行テスト）」を選択してください');
}

main().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
