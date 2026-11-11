import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("snap-road (hiroshima): snaps to real road edges including Chorakuji and Takatori", async () => {
  let jsonPath = path.join(process.cwd(), "public", "data", "hiroshima", "snap-roads.json");
  if (!fs.existsSync(jsonPath)) {
    jsonPath = path.join(process.cwd(), "public", "data", "hiroshima", "routing-graph.json");
  }
  assert.ok(fs.existsSync(jsonPath), "hiroshima snap-roads.json/routing-graph.json should exist");

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.nodes) && Array.isArray(data.edges));

  const roadEdges = [];
  for (let i = 0; i < data.edges.length; i++) {
    if (data.edges[i][5] === 1 || data.edges[i][5] === undefined) {
      roadEdges.push([data.edges[i][0], data.edges[i][1]]);
    }
  }
  assert.ok(roadEdges.length > 5000, `should have > 5000 real road edges, found ${roadEdges.length}`);

  const GRID_DEG = 0.005;
  const grid = new Map();
  for (let i = 0; i < roadEdges.length; i++) {
    const [uIdx, vIdx] = roadEdges[i];
    const [l1, a1] = data.nodes[uIdx];
    const [l2, a2] = data.nodes[vIdx];
    const minGx = Math.floor(Math.min(l1, l2) / GRID_DEG);
    const maxGx = Math.floor(Math.max(l1, l2) / GRID_DEG);
    const minGy = Math.floor(Math.min(a1, a2) / GRID_DEG);
    const maxGy = Math.floor(Math.max(a1, a2) / GRID_DEG);
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const key = `${gx}_${gy}`;
        let cell = grid.get(key);
        if (!cell) { cell = []; grid.set(key, cell); }
        cell.push(i);
      }
    }
  }

  function snap(qLat, qLng, maxDist = 60) {
    const gx = Math.floor(qLng / GRID_DEG);
    const gy = Math.floor(qLat / GRID_DEG);
    const cosLat = Math.cos((qLat * Math.PI) / 180);
    let bestDist = Infinity;
    let bestPoint = null;
    const checked = new Set();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get(`${gx + dx}_${gy + dy}`);
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const edgeIdx = cell[k];
          if (checked.has(edgeIdx)) continue;
          checked.add(edgeIdx);
          const [u, v] = roadEdges[edgeIdx];
          const [lA, tA] = data.nodes[u];
          const [lB, tB] = data.nodes[v];

          const ax = (lA - qLng) * 111000 * cosLat;
          const ay = (tA - qLat) * 111000;
          const bx = (lB - qLng) * 111000 * cosLat;
          const by = (tB - qLat) * 111000;
          const abx = bx - ax;
          const aby = by - ay;
          const abLenSq = abx * abx + aby * aby;
          let t = 0;
          if (abLenSq > 0) {
            t = Math.max(0, Math.min(1, (-ax * abx - ay * aby) / abLenSq));
          }
          const dist = Math.hypot(ax + t * abx, ay + t * aby);
          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = { lat: tA + t * (tB - tA), lng: lA + t * (lB - lA) };
          }
        }
      }
    }
    return { snapped: bestDist <= maxDist, distanceMeters: bestDist, bestPoint };
  }

  // 長楽寺3丁目 & 高取北4丁目
  const chorakujiRes = snap(34.474515, 132.425801, 60);
  assert.equal(chorakujiRes.snapped, true, "Chorakuji 3-chome should snap to road");
  assert.ok(chorakujiRes.distanceMeters < 30, `Chorakuji distance should be < 30m, got ${chorakujiRes.distanceMeters}`);

  const takatoriRes = snap(34.477772, 132.432854, 60);
  assert.equal(takatoriRes.snapped, true, "Takatori-kita 4-chome should snap to road");
  assert.ok(takatoriRes.distanceMeters < 15, `Takatori distance should be < 15m, got ${takatoriRes.distanceMeters}`);

  // 山奥・境界外
  const farRes = snap(34.474515 + 0.05, 132.425801 + 0.05, 60);
  assert.equal(farRes.snapped, false, "distant mountain point should not snap");
});

test("snap-road (kure): snaps to real road edges including Kami-hirahara and Hirahara", async () => {
  const jsonPath = path.join(process.cwd(), "public", "data", "kure", "routing-graph.json");
  assert.ok(fs.existsSync(jsonPath), "kure routing-graph.json should exist");

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.nodes) && Array.isArray(data.edges));
  assert.ok(data.edges.length > 5000, `should have > 5000 road edges, found ${data.edges.length}`);

  function snap(qLat, qLng, maxDist = 60) {
    const cosLat = Math.cos((qLat * Math.PI) / 180);
    let bestDist = Infinity;
    let bestPoint = null;
    for (let i = 0; i < data.edges.length; i++) {
      const e = data.edges[i];
      if (e[5] === 0) continue;
      const [u, v] = e;
      const [lngA, latA] = data.nodes[u];
      const [lngB, latB] = data.nodes[v];

      const ax = (lngA - qLng) * 111000 * cosLat;
      const ay = (latA - qLat) * 111000;
      const bx = (lngB - qLng) * 111000 * cosLat;
      const by = (latB - qLat) * 111000;
      const abx = bx - ax;
      const aby = by - ay;
      const abLenSq = abx * abx + aby * aby;
      let t = 0;
      if (abLenSq > 0) {
        t = Math.max(0, Math.min(1, (-ax * abx - ay * aby) / abLenSq));
      }
      const dist = Math.hypot(ax + t * abx, ay + t * aby);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = { lat: latA + t * (latB - latA), lng: lngA + t * (lngB - lngA) };
      }
    }
    return { snapped: bestDist <= maxDist, distanceMeters: bestDist, bestPoint };
  }

  // 上平原町 (34.257488, 132.583786)
  const kamiHiraharaRes = snap(34.257488, 132.583786, 60);
  assert.equal(kamiHiraharaRes.snapped, true, "Kami-hirahara should snap to road");
  assert.ok(kamiHiraharaRes.distanceMeters < 55, `distance should be < 55m, got ${kamiHiraharaRes.distanceMeters}`);

  // 平原町 (34.254978, 132.580658)
  const hiraharaRes = snap(34.254978, 132.580658, 60);
  assert.equal(hiraharaRes.snapped, true, "Hirahara should snap to road");
  assert.ok(hiraharaRes.distanceMeters < 25, `distance should be < 25m, got ${hiraharaRes.distanceMeters}`);
});
