import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const load = createRequire(`${process.env.TRANSIT_TEST_BUILD}/test.cjs`);
const { TileWorkGate } = load('./async-generation.js');
const { NetworkRouter } = load('./network-routing.js');
const { buildGreedyDemandTransitPlan, evaluateCustomStopsSimulation, buildCustomStopSimulationGeoJson, evaluateMobilityHubSimulation, buildMobilityHubSimulationGeoJson, MOBILITY_HUB_CANDIDATES, computeSlopeSegmentEffectiveDistance, isInsideBishamondaiBBox, isInsideKureMiyaharaBBox, isInsideAreaBBox, isInsideAreaEvaluationBBox, AREA_CONFIGS, getAreaConfig, DEFAULT_AREA_ID, TARGET_CENTER_LAT, TARGET_CENTER_LNG, BISHAMONDAI_BBOX, KURE_MIYAHARA_CENTER_LAT, KURE_MIYAHARA_CENTER_LNG, KURE_MIYAHARA_INITIAL_ALTITUDE_METERS } = load('./transit-analysis.js');

test('old work cannot overwrite a newer generation; duplicate work is suppressed',async()=>{
  const gate=new TileWorkGate(), tile={}; let release; let value=''; let calls=0;
  const old=gate.run(tile,async g=>{calls++;await new Promise(r=>release=r);if(g===gate.generation)value='old';return true;});
  await gate.run(tile,async()=>{calls++;return true;});
  assert.equal(calls,1);
  gate.invalidate();
  await gate.run(tile,async()=>{value='new';return true;});
  release(); await old;
  assert.equal(value,'new');
});
test('transient failures retry after backoff; successful work is cached',async()=>{
  const gate=new TileWorkGate(),tile={};let calls=0;
  await gate.run(tile,async()=>{calls++;throw Error('temporary');});
  await gate.run(tile,async()=>{calls++;return true;}); assert.equal(calls,1);
  await gate.run(tile,async()=>{calls++;return true;},Date.now()+30001);
  await gate.run(tile,async()=>{calls++;return true;},Date.now()+60000);assert.equal(calls,2);
});
test('new stop on a split road reaches a building via its access edge',()=>{
  const graph={version:'test',missingElevationNodes:0,nodes:[[139,35,0],[139.0005,35,0],[139.001,35,0],[139.0005,35.00001,0]],edges:[[0,1,50,50,50,1],[1,2,50,50,50,1],[1,3,10,20,30,0]]};
  const result=new NetworkRouter(graph,'general').fromCandidate(35,139.0007);
  assert.ok(Math.abs(result.distances[3]-40)<.1);
  assert.ok(Math.abs(result.lng-139.0007)<1e-8);
  assert.ok(Math.abs(new NetworkRouter(graph,'elderly').fromCandidate(35,139.0007).distances[3]-50)<.1);
});
test('routing respects a detour instead of using cross-barrier straight distance',()=>{
  const graph={version:'test',missingElevationNodes:0,nodes:[[139,35,0],[139.001,35,0],[139.001,35.001,0],[139,35.001,0]],edges:[[0,1,100,100,100,1],[1,2,100,100,100,1],[2,3,100,100,100,1]]};
  const result=new NetworkRouter(graph,'general').fromCandidate(35,139);
  assert.equal(result.distances[3],300);
});
test('additional sites never worsen access and empty targets are supported',()=>{
  assert.deepEqual(buildGreedyDemandTransitPlan([],10,1),{sites:[],results:[]});
  const members=Array.from({length:20},(_,i)=>({lat:35+i*.001,lng:139,busStraightDistanceMeters:500,busEffectiveDistanceMeters:700,stationEffectiveDistanceMeters:2000,coverageRatio:700/400}));
  const {results}=buildGreedyDemandTransitPlan(members,10,1);
  for(let i=0;i<results.length;i++) {
    assert.ok(results[i].averageAfterMeters <= (i?results[i-1].averageAfterMeters:700));
    assert.ok(results[i].newlyCoveredBuildings <= members.length);
  }
});
test('evaluateCustomStopsSimulation aggregates newly covered buildings across multiple custom stops',()=>{
  const buildings = [
    { buildingId: 'b1', lat: 35.36, lng: 139.45, baseBusEffectiveDistanceMeters: 620, baseStationEffectiveDistanceMeters: 1200, baseCoverageRatio: 620 / 400, totalFloorArea: 120 },
    { buildingId: 'b2', lat: 35.361, lng: 139.451, baseBusEffectiveDistanceMeters: 510, baseStationEffectiveDistanceMeters: 1200, baseCoverageRatio: 510 / 400, totalFloorArea: 80 },
    { buildingId: 'b3', lat: 35.362, lng: 139.452, baseBusEffectiveDistanceMeters: 280, baseStationEffectiveDistanceMeters: 1200, baseCoverageRatio: 280 / 400, totalFloorArea: 100 },
  ];
  const stops = [
    { id: 1, label: '仮設停留所 #1', lat: 35.36, lng: 139.45 },
    { id: 2, label: '仮設停留所 #2', lat: 35.361, lng: 139.451 },
  ];
  const stopDistanceMap = new Map([
    [1, new Map([['b1', 280], ['b2', 380]])],
    [2, new Map([['b2', 200]])],
  ]);
  const { outcomes, summary } = evaluateCustomStopsSimulation(buildings, stops, stopDistanceMap, 1);
  assert.equal(summary.stopCount, 2);
  assert.equal(summary.totalGapBuildingsBefore, 2);
  assert.equal(summary.newlyCoveredBuildings, 2);
  assert.equal(summary.newlyCoveredFloorArea, 200);
  assert.equal(summary.remainingGapBuildings, 0);
  assert.equal(summary.severeGapBeforeBuildings, 1);
  assert.equal(summary.severeGapAfterBuildings, 0);
  assert.equal(summary.perStopStats[0].standaloneCoveredBuildings, 2);
  assert.equal(summary.perStopStats[0].primaryCoveredBuildings, 1);
  assert.equal(summary.perStopStats[1].standaloneCoveredBuildings, 1);
  assert.equal(summary.perStopStats[1].primaryCoveredBuildings, 1);
  assert.equal(outcomes.get('b1')?.isNewlyCovered, true);
  assert.equal(outcomes.get('b1')?.bestStopId, 1);
  assert.equal(outcomes.get('b2')?.bestStopId, 2);
  assert.equal(outcomes.get('b2')?.afterBusEffectiveDistanceMeters, 200);
});
test('evaluateCustomStopsSimulation respects thresholdMultiplier for custom stop coverage without falsely covering distant gap buildings',()=>{
  const buildings = [
    { buildingId: 'nearCustom', lat: 35.36, lng: 139.45, baseBusEffectiveDistanceMeters: 580, baseStationEffectiveDistanceMeters: 1200, baseCoverageRatio: 580 / 400, totalFloorArea: 100 },
    { buildingId: 'farFromCustom', lat: 35.37, lng: 139.46, baseBusEffectiveDistanceMeters: 440, baseStationEffectiveDistanceMeters: 1200, baseCoverageRatio: 440 / 400, totalFloorArea: 100 },
  ];
  const stops = [{ id: 1, label: '仮設停留所 #1', lat: 35.36, lng: 139.45 }];
  const stopDistanceMap = new Map([[1, new Map([['nearCustom', 440]])]]);
  const res10 = evaluateCustomStopsSimulation(buildings, stops, stopDistanceMap, 1.0);
  assert.equal(res10.summary.newlyCoveredBuildings, 0);
  assert.equal(res10.outcomes.get('nearCustom')?.isNewlyCovered, false);

  const res12 = evaluateCustomStopsSimulation(buildings, stops, stopDistanceMap, 1.2);
  assert.equal(res12.summary.newlyCoveredBuildings, 1);
  assert.equal(res12.outcomes.get('nearCustom')?.isNewlyCovered, true);
  assert.equal(res12.outcomes.has('farFromCustom'), false);
});

test('buildCustomStopSimulationGeoJson creates valid GeoJSON with stops and newly covered buildings',()=>{
  const geojson = buildCustomStopSimulationGeoJson({
    stops: [
      { id: 1, label: '仮設停留所 #1', lat: 35.3600001, lng: 139.4500002, standaloneCoveredBuildings: 10, primaryCoveredBuildings: 8 },
    ],
    newlyCoveredBuildings: [
      {
        buildingId: 'bldg_001',
        lat: 35.3610001,
        lng: 139.4510002,
        usage: '共同住宅',
        totalFloorArea: 245.5,
        assignedStopLabel: '仮設停留所 #1',
        originalNearestStopName: '遠い既存バス停',
        beforeBusEffectiveDistanceMeters: 550.2,
        afterBusEffectiveDistanceMeters: 210.4,
        beforeBusWalkMinutes: 7.0,
        afterBusWalkMinutes: 2.6,
        walkProfileLabel: '高齢者（坂道の負荷係数2倍）',
      },
    ],
  });

  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features.length, 2);

  const stopFeature = geojson.features[0];
  assert.equal(stopFeature.geometry.type, 'Point');
  assert.deepEqual(stopFeature.geometry.coordinates, [139.45, 35.36]);
  assert.equal(stopFeature.properties.feature_type, 'custom_stop');
  assert.equal(stopFeature.properties.name, '仮設停留所 #1');
  assert.equal(stopFeature.properties.standalone_covered_buildings, 10);
  assert.equal(stopFeature.properties.primary_covered_buildings, 8);

  const bldgFeature = geojson.features[1];
  assert.equal(bldgFeature.geometry.type, 'Point');
  assert.deepEqual(bldgFeature.geometry.coordinates, [139.451, 35.361]);
  assert.equal(bldgFeature.properties.feature_type, 'newly_covered_building');
  assert.equal(bldgFeature.properties.building_id, 'bldg_001');
  assert.equal(bldgFeature.properties.usage, '共同住宅');
  assert.equal(bldgFeature.properties.total_floor_area_sqm, 245.5);
  assert.equal(bldgFeature.properties.assigned_stop, '仮設停留所 #1');
  assert.equal(bldgFeature.properties.before_bus_distance_m, 550);
  assert.equal(bldgFeature.properties.after_bus_distance_m, 210);
  assert.equal(bldgFeature.properties.reduced_distance_m, 340);
  assert.equal(bldgFeature.properties.walk_profile, '高齢者（坂道の負荷係数2倍）');
});

test('evaluateMobilityHubSimulation extracts gap buildings within range of hubs',()=>{
  const hubs = [
    { id: 2, name: '毘沙門台2丁目・団地中央', address: '広島市安佐南区毘沙門台2丁目', description: '団地中央拠点', lat: 34.4682, lng: 132.4812 },
  ];
  const buildings = [
    // 500m away, gap building (ratio 1.2 > 1) -> should be covered (min 400m, max 1500m)
    { buildingId: 'b_target', lat: 34.4728, lng: 132.4812, baseCoverageRatio: 1.2, totalFloorArea: 150, baseBusEffectiveDistanceMeters: 480 },
    // 200m away, gap building -> too close (< 400m)
    { buildingId: 'b_tooclose', lat: 34.4698, lng: 132.4812, baseCoverageRatio: 1.2, totalFloorArea: 100, baseBusEffectiveDistanceMeters: 480 },
    // 3000m away -> too far (> 1500m)
    { buildingId: 'b_toofar', lat: 34.494, lng: 132.4812, baseCoverageRatio: 1.4, totalFloorArea: 80, baseBusEffectiveDistanceMeters: 600 },
    // 600m away, NOT gap (ratio 0.8 <= 1) -> already covered by bus/train, should not be included
    { buildingId: 'b_notgap', lat: 34.4736, lng: 132.4812, baseCoverageRatio: 0.8, totalFloorArea: 200, baseBusEffectiveDistanceMeters: 300 },
  ];

  const { outcomes, summary } = evaluateMobilityHubSimulation(buildings, hubs, 400, 1500, 'cycle');

  assert.equal(summary.activeHubCount, 1);
  assert.equal(summary.totalGapBuildingsBefore, 3);
  assert.equal(summary.newlyCoveredBuildings, 1);
  assert.equal(summary.newlyCoveredFloorArea, 150);
  assert.equal(summary.perHubStats[0].coveredBuildings, 1);

  assert.equal(outcomes.get('b_target')?.isCoveredByHub, true);
  assert.equal(outcomes.get('b_target')?.nearestHubId, 2);
  assert.equal(outcomes.has('b_tooclose'), false);
  assert.equal(outcomes.has('b_toofar'), false);
  assert.equal(outcomes.has('b_notgap'), false);

  const geojson = buildMobilityHubSimulationGeoJson({
    hubs,
    modeLabel: 'シェアサイクル (400m〜1500m)',
    minDistanceMeters: 400,
    maxDistanceMeters: 1500,
    coveredBuildings: [
      {
        buildingId: 'b_target',
        lat: 34.4728,
        lng: 132.4812,
        usage: '住宅',
        totalFloorArea: 150,
        nearestHubName: '毘沙門台2丁目・団地中央',
        hubDistanceMeters: 520,
        originalBusDistanceMeters: 480,
      },
    ],
  });

  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features.length, 2);
  assert.equal(geojson.features[0].properties.feature_type, 'mobility_hub_candidate');
  assert.equal(geojson.features[1].properties.feature_type, 'hub_rescued_gap_building');
  assert.equal(MOBILITY_HUB_CANDIDATES.length, 4);

  // Test per-hub mode configuration (e.g. Hub 2 has carshare 1000m-3500m)
  const customConfigs = new Map([
    [2, { hubId: 2, mode: 'carshare', minDistanceMeters: 1000, maxDistanceMeters: 3500 }],
  ]);
  const perHubSim = evaluateMobilityHubSimulation(buildings, hubs, 400, 1500, 'cycle', customConfigs);
  assert.equal(perHubSim.summary.newlyCoveredBuildings, 1);
  assert.equal(perHubSim.outcomes.get('b_toofar')?.isCoveredByHub, true);
  assert.equal(perHubSim.outcomes.get('b_toofar')?.mode, 'carshare');
  assert.equal(perHubSim.outcomes.has('b_target'), false); // 500m away, below 1000m
});

test('Bishamondai BBox and uphill slope penalty calculation work accurately',()=>{
  assert.equal(isInsideBishamondaiBBox(132.481, 34.468), true);
  assert.equal(isInsideBishamondaiBBox(139.45, 35.36), false);

  const uphillDist = computeSlopeSegmentEffectiveDistance(100, 10, 3.5, 1.25, 1.0);
  const downhillDist = computeSlopeSegmentEffectiveDistance(100, -10, 3.5, 1.25, 1.0);
  assert.ok(uphillDist > downhillDist, 'Uphill effective distance should exceed downhill distance');
  assert.ok(Math.abs(uphillDist - 143.75) < 1e-6);
  assert.ok(Math.abs(downhillDist - 135.0) < 1e-6);
});

test('Multi-area configs preserve Hiroshima Bishamondai and configure Kure Miyahara with separated paths and stronger slope penalties',()=>{
  const hiroshima = getAreaConfig('hiroshima_bishamondai');
  const kure = getAreaConfig('kure_miyahara');

  assert.equal(hiroshima.cityCode, '34105');
  assert.equal(hiroshima.initialView.centerLat, TARGET_CENTER_LAT);
  assert.equal(hiroshima.initialView.centerLng, TARGET_CENTER_LNG);
  assert.deepEqual(hiroshima.bbox, BISHAMONDAI_BBOX);
  assert.equal(hiroshima.dataPaths.busStopsGeoJsonUrl, '/data/hiroshima/bus-stops.geojson');
  assert.deepEqual(hiroshima.meshCodes, ['51325397', '51325398']);

  assert.equal(DEFAULT_AREA_ID, 'kure_miyahara');
  assert.equal(kure.cityCode, '34202');
  assert.equal(kure.initialView.centerLat, KURE_MIYAHARA_CENTER_LAT);
  assert.equal(kure.initialView.centerLng, KURE_MIYAHARA_CENTER_LNG);
  assert.equal(kure.initialView.altitudeMeters, KURE_MIYAHARA_INITIAL_ALTITUDE_METERS);
  assert.deepEqual(kure.meshCodes, ['51322485', '51322486', '51322475', '51322476']);
  assert.deepEqual(kure.dataPaths.localBuildingGeoJsonUrls, [
    '/data/kure/bldg/51322485.geojson',
    '/data/kure/bldg/51322486.geojson',
    '/data/kure/bldg/51322475.geojson',
    '/data/kure/bldg/51322476.geojson',
  ]);
  assert.equal(kure.dataPaths.roadNetworkGeoJsonUrl, '/data/kure/roads.geojson');
  assert.equal(kure.dataPaths.busStopsGeoJsonUrl, '/data/kure/stops.geojson');

  assert.equal(isInsideKureMiyaharaBBox(132.572, 34.238), true);
  assert.equal(isInsideKureMiyaharaBBox(132.481, 34.468), false);
  assert.equal(isInsideAreaBBox('kure_miyahara', 132.572, 34.238), true);
  assert.equal(isInsideAreaEvaluationBBox('kure_miyahara', 132.572, 34.238), true);

  // Kure has stronger uphill penalty multipliers than Hiroshima Bishamondai
  assert.ok(kure.slopeParams.uphillDistanceMultiplier > hiroshima.slopeParams.uphillDistanceMultiplier);
  assert.ok(kure.slopeParams.walkProfiles.elderly.uphillDistanceMultiplier > hiroshima.slopeParams.walkProfiles.elderly.uphillDistanceMultiplier);
  assert.ok(kure.slopeParams.walkProfiles.general.slopePenaltyFactor > hiroshima.slopeParams.walkProfiles.general.slopePenaltyFactor);

  const hiroshimaUphill = computeSlopeSegmentEffectiveDistance(
    100, 15,
    hiroshima.slopeParams.walkProfiles.general.slopePenaltyFactor,
    hiroshima.slopeParams.walkProfiles.general.uphillDistanceMultiplier,
    hiroshima.slopeParams.walkProfiles.general.downhillDistanceMultiplier,
    hiroshima.slopeParams.gradientCap,
  );
  const kureUphill = computeSlopeSegmentEffectiveDistance(
    100, 15,
    kure.slopeParams.walkProfiles.general.slopePenaltyFactor,
    kure.slopeParams.walkProfiles.general.uphillDistanceMultiplier,
    kure.slopeParams.walkProfiles.general.downhillDistanceMultiplier,
    kure.slopeParams.gradientCap,
  );
  assert.ok(kureUphill > hiroshimaUphill, 'Kure uphill effective distance should exceed Hiroshima for the same slope');
  assert.ok(AREA_CONFIGS.hiroshima_bishamondai && AREA_CONFIGS.kure_miyahara);
});



