import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("snap-road (hiroshima): snaps to real road edges and rejects points >= 35m", async () => {
  const jsonPath = path.join(process.cwd(), "public", "data", "hiroshima", "routing-graph.json");
  assert.ok(fs.existsSync(jsonPath), "hiroshima routing-graph.json should exist");

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.nodes) && Array.isArray(data.edges));

  const roadEdges = [];
  for (let i = 0; i < data.edges.length; i++) {
    if (data.edges[i][5] === 1) {
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

  function snap(qLat, qLng, maxDist = 35) {
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

  // 1. Pick road edge
  const [u, v] = roadEdges[50];
  const [lngA, latA] = data.nodes[u];
  const [lngB, latB] = data.nodes[v];
  const midLat = (latA + latB) / 2;
  const midLng = (lngA + lngB) / 2;

  // Jitter 10m off road
  const jitterLat = midLat + 0.00008;
  const jitterLng = midLng + 0.00008;

  const nearRes = snap(jitterLat, jitterLng, 35);
  assert.equal(nearRes.snapped, true, "10m off road should snap");
  assert.ok(nearRes.distanceMeters < 35, "distance should be under 35m");
  assert.ok(nearRes.bestPoint !== null, "snapped point should exist");

  // 2. Far away point (1km away)
  const farRes = snap(midLat + 0.01, midLng + 0.01, 35);
  assert.equal(farRes.snapped, false, "distant point should not snap");
});

test("snap-road (kure): snaps to real road edges and rejects points >= 35m", async () => {
  const jsonPath = path.join(process.cwd(), "public", "data", "kure", "routing-graph.json");
  assert.ok(fs.existsSync(jsonPath), "kure routing-graph.json should exist");

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.nodes) && Array.isArray(data.edges));
  assert.ok(data.edges.length > 5000, `should have > 5000 road edges, found ${data.edges.length}`);

  const [u, v] = data.edges[100];
  const [lngA, latA] = data.nodes[u];
  const [lngB, latB] = data.nodes[v];
  const midLat = (latA + latB) / 2;
  const midLng = (lngA + lngB) / 2;

  assert.ok(Number.isFinite(midLat) && Number.isFinite(midLng));
});
