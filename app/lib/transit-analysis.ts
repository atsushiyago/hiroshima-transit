const EARTH_RADIUS_METERS = 6371000;

// =============================================================================
// 対象地域・初期ビュー・データソース定数（広島市安佐南区 毘沙門台エリア）
// =============================================================================
export const TARGET_AREA_NAME = "広島市安佐南区 毘沙門台";
export const TARGET_AREA_DETAIL_NAME = "広島県広島市安佐南区毘沙門台1丁目〜4丁目";
export const TARGET_CITY_CODE = "34105"; // 広島市安佐南区（PLATEAU 3D Tiles 配信コード）
// 初期カメラターゲット座標（大塚・伴・長楽寺・高取・上安・安東・毘沙門台・山本・祇園・緑井を一望する中心点）
export const TARGET_CENTER_LAT = 34.462;
export const TARGET_CENTER_LNG = 132.442;
export const TARGET_INITIAL_ALTITUDE_METERS = 7200;
// 北西方向の斜面を見下ろすアングル（Heading 315° = 北西向き、Pitch -35° = 斜面見下ろし）
export const TARGET_INITIAL_HEADING_DEG = 315;
export const TARGET_INITIAL_PITCH_DEG = -35;
export const TARGET_MESH_CODES = ["51325397", "51325398"] as const;

// 毘沙門台地区を包含するバウンディングボックス（南西: 34.460, 132.472 / 北東: 34.478, 132.490）
export const BISHAMONDAI_BBOX = {
  south: 34.460,
  west: 132.472,
  north: 34.478,
  east: 132.490,
  minLat: 34.460,
  maxLat: 34.478,
  minLng: 132.472,
  maxLng: 132.490,
} as const;

// 毘沙門台1丁目〜4丁目・周辺メッシュ（51325397, 51325398）および安佐南区全域を含む広域評価範囲
export const BISHAMONDAI_EXTENDED_BBOX = {
  minLat: 34.405,
  maxLat: 34.530,
  minLng: 132.380,
  maxLng: 132.540,
} as const;

export function isInsideBishamondaiBBox(lng: number, lat: number): boolean {
  return (
    lat >= BISHAMONDAI_BBOX.south &&
    lat <= BISHAMONDAI_BBOX.north &&
    lng >= BISHAMONDAI_BBOX.west &&
    lng <= BISHAMONDAI_BBOX.east
  );
}

export function isInsideTargetEvaluationArea(lng: number, lat: number): boolean {
  return (
    isInsideBishamondaiBBox(lng, lat) ||
    (lat >= BISHAMONDAI_EXTENDED_BBOX.minLat &&
      lat <= BISHAMONDAI_EXTENDED_BBOX.maxLat &&
      lng >= BISHAMONDAI_EXTENDED_BBOX.minLng &&
      lng <= BISHAMONDAI_EXTENDED_BBOX.maxLng)
  );
}

// データソースパス設定（広島市・毘沙門台向け）
export const LOCAL_BUILDING_TILESET_URLS = [
  "/data/hiroshima/bldg/tileset.json",
  ...TARGET_MESH_CODES.map((code) => `/data/hiroshima/bldg/${code}/tileset.json`),
] as const;
export const LOCAL_BUILDING_GEOJSON_URLS = TARGET_MESH_CODES.map(
  (code) => `/data/hiroshima/bldg/${code}.geojson`
);
export const REMOTE_BUILDING_TILESET_URL = `https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/${TARGET_CITY_CODE}-bldg-lod1-latest/tileset.json`;
export const ROAD_NETWORK_GEOJSON_URL = "/data/hiroshima/road-network.geojson";
export const TRANSIT_FACILITIES_GEOJSON_URL = "/data/hiroshima/transit-facilities.geojson";
export const BUS_STOPS_GEOJSON_URL = "/data/hiroshima/bus-stops.geojson";
export const STATIONS_GEOJSON_URL = "/data/hiroshima/stations.geojson";
export const PLACE_LABELS_JSON_URL = "/data/hiroshima/place-labels.json";
export const EXISTING_DEMAND_TRANSIT_JSON_URL = "/data/hiroshima/existing-demand-transit.json";
export const BUILDING_NETWORK_SCORES_JSON_URL = "/data/hiroshima/building-network-scores.json";
export const ROUTING_GRAPH_JSON_URL = "/data/hiroshima/routing-graph.json";

// =============================================================================
// 交通空白地判定閾値および急傾斜地向け勾配負荷計算パラメータ
// =============================================================================
export const BUS_COVERAGE_THRESHOLD_METERS = 400;
export const STATION_COVERAGE_THRESHOLD_METERS = 800;

// 建物〜最寄りバス停/駅の経路を何点でサンプリングして標高差・勾配を求めるか（区間数はこの値-1）
export const SLOPE_SAMPLE_COUNT = 5;
// 地形データの局所ノイズで極端な勾配が出た場合の上限（40%勾配で頭打ち）
export const SLOPE_GRADIENT_CAP = 0.4;
// 毘沙門台のような急傾斜団地における「上り坂」の距離換算割増倍率（標高差による歩行負荷の増分）
export const SLOPE_UPHILL_DISTANCE_MULTIPLIER = 1.25;
// 下り坂区間でも往復利用（帰路の上り坂）や足腰への負荷を考慮する基準倍率
export const SLOPE_DOWNHILL_DISTANCE_MULTIPLIER = 1.0;

export type WalkProfile = "general" | "elderly";
export const WALK_PROFILES: Record<
  WalkProfile,
  {
    label: string;
    slopePenaltyFactor: number;
    uphillDistanceMultiplier: number;
    downhillDistanceMultiplier: number;
    walkSpeedMPerMin: number;
  }
> = {
  // 勾配1（100%）あたり実効距離を何倍割り増しするかの係数。
  // 例: 勾配0.1(10%)ならslopePenaltyFactor=3.5、上り坂倍率1.25で実効距離が約1.44倍に換算される。
  general: {
    label: "一般（標準の坂道補正）",
    slopePenaltyFactor: 3.5,
    uphillDistanceMultiplier: SLOPE_UPHILL_DISTANCE_MULTIPLIER,
    downhillDistanceMultiplier: SLOPE_DOWNHILL_DISTANCE_MULTIPLIER,
    walkSpeedMPerMin: 67,
  },
  elderly: {
    label: "高齢者（坂道の負荷係数2倍）",
    slopePenaltyFactor: 7.0,
    uphillDistanceMultiplier: SLOPE_UPHILL_DISTANCE_MULTIPLIER,
    downhillDistanceMultiplier: SLOPE_DOWNHILL_DISTANCE_MULTIPLIER,
    walkSpeedMPerMin: 50,
  },
};

/**
 * 1区間あたりの水平距離と標高差（終点標高 - 始点標高）から、
 * 急傾斜地の上り坂ペナルティ倍率を反映した実効距離（メートル）を算出する。
 */
export function computeSlopeSegmentEffectiveDistance(
  segmentDistanceMeters: number,
  deltaHeightMeters: number,
  slopePenaltyFactor: number,
  uphillMultiplier = SLOPE_UPHILL_DISTANCE_MULTIPLIER,
  downhillMultiplier = SLOPE_DOWNHILL_DISTANCE_MULTIPLIER,
  gradientCap = SLOPE_GRADIENT_CAP
): number {
  const safeSegmentDist = Math.max(segmentDistanceMeters, 0);
  if (safeSegmentDist === 0) return 0;
  const rise = Math.abs(deltaHeightMeters);
  const gradient = Math.min(rise / Math.max(safeSegmentDist, 1), gradientCap);
  const directionMultiplier = deltaHeightMeters > 0 ? uphillMultiplier : downhillMultiplier;
  return safeSegmentDist * (1 + slopePenaltyFactor * directionMultiplier * gradient);
}

export type DistanceModel = "straight" | "network";
export const DISTANCE_MODEL_DEFAULT: DistanceModel = "straight";
// 事前計算データ未収録の建物に対して道路網距離モデルをライブ適用する際の道路迂回係数（斜面住宅団地の平均迂回率）
export const ROAD_NETWORK_DETOUR_FACTOR = 1.32;

// =============================================================================
// 対象地域・初期ビュー・データソース定数（呉市 宮原地区エリア）
// =============================================================================
export const KURE_MIYAHARA_AREA_NAME = "呉市（宮原地区）";
export const KURE_MIYAHARA_AREA_DETAIL_NAME = "広島県呉市宮原1丁目〜8丁目周辺（急傾斜市街地）";
export const KURE_MIYAHARA_CITY_CODE = "34202"; // 広島県呉市（PLATEAU 3D Tiles 配信コード）
export const KURE_MIYAHARA_CENTER_LAT = 34.2435;
export const KURE_MIYAHARA_CENTER_LNG = 132.5630;
// 呉港・二河川河口側（南西）から呉駅・宮原・和庄・内陸斜面市街地を見通す俯瞰アングル（Heading 42° = 北東向き、Pitch -23°、視点距離約2350m）
export const KURE_MIYAHARA_INITIAL_ALTITUDE_METERS = 2350;
export const KURE_MIYAHARA_INITIAL_HEADING_DEG = 42;
export const KURE_MIYAHARA_INITIAL_PITCH_DEG = -23;
export const KURE_MIYAHARA_MESH_CODES = ["51322485", "51322486", "51322475", "51322476"] as const;

// 呉市宮原地区および呉駅・二河川河口・中央市街地を包含するバウンディングボックス
export const KURE_MIYAHARA_BBOX = {
  south: 34.225,
  west: 132.545,
  north: 34.258,
  east: 132.585,
  minLat: 34.225,
  maxLat: 34.258,
  minLng: 132.545,
  maxLng: 132.585,
} as const;

// 呉市宮原地区および周辺斜面市街地（坪ノ内・神山・休山麓・呉駅周辺）を含む広域評価範囲
export const KURE_MIYAHARA_EXTENDED_BBOX = {
  minLat: 34.210,
  maxLat: 34.265,
  minLng: 132.535,
  maxLng: 132.605,
} as const;

export function isInsideKureMiyaharaBBox(lng: number, lat: number): boolean {
  return (
    lat >= KURE_MIYAHARA_BBOX.south &&
    lat <= KURE_MIYAHARA_BBOX.north &&
    lng >= KURE_MIYAHARA_BBOX.west &&
    lng <= KURE_MIYAHARA_BBOX.east
  );
}

// データソースパス設定（呉市・宮原地区向け）
export const KURE_LOCAL_BUILDING_TILESET_URLS = [
  "/data/kure/bldg/tileset.json",
  ...KURE_MIYAHARA_MESH_CODES.map((code) => `/data/kure/bldg/${code}/tileset.json`),
] as const;
export const KURE_LOCAL_BUILDING_GEOJSON_URLS = KURE_MIYAHARA_MESH_CODES.map(
  (code) => `/data/kure/bldg/${code}.geojson`
);
export const KURE_REMOTE_BUILDING_TILESET_URL = `https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/${KURE_MIYAHARA_CITY_CODE}-bldg-lod1-latest/tileset.json`;
export const KURE_ROAD_NETWORK_GEOJSON_URL = "/data/kure/roads.geojson";
export const KURE_TRANSIT_FACILITIES_GEOJSON_URL = "/data/kure/transit-facilities.geojson";
export const KURE_BUS_STOPS_GEOJSON_URL = "/data/kure/stops.geojson";
export const KURE_STATIONS_GEOJSON_URL = "/data/kure/stations.geojson";
export const KURE_PLACE_LABELS_JSON_URL = "/data/kure/place-labels.json";
export const KURE_EXISTING_DEMAND_TRANSIT_JSON_URL = "/data/kure/existing-demand-transit.json";
export const KURE_BUILDING_NETWORK_SCORES_JSON_URL = "/data/kure/building-network-scores.json";
export const KURE_ROUTING_GRAPH_JSON_URL = "/data/kure/routing-graph.json";

// =============================================================================
// エリア切り替え管理（広島市安佐南区 毘沙門台 / 呉市 宮原地区）
// =============================================================================
export type AreaId = "hiroshima_bishamondai" | "kure_miyahara";
export const DEFAULT_AREA_ID: AreaId = "kure_miyahara";

export type AreaWalkProfileParams = {
  label: string;
  slopePenaltyFactor: number;
  uphillDistanceMultiplier: number;
  downhillDistanceMultiplier: number;
  walkSpeedMPerMin: number;
};

export type AreaSlopeParams = {
  sampleCount: number;
  gradientCap: number;
  uphillDistanceMultiplier: number;
  downhillDistanceMultiplier: number;
  roadNetworkDetourFactor: number;
  slopeNote: string;
  walkProfiles: Record<WalkProfile, AreaWalkProfileParams>;
};

export type AreaBBox = {
  south: number;
  west: number;
  north: number;
  east: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type AreaConfig = {
  id: AreaId;
  selectorLabel: string;
  name: string;
  titleLabel: string;
  detailName: string;
  cityCode: string;
  meshCodes: readonly string[];
  descriptionText: string;
  stationLegendLabel: string;
  majorBusLegendLabel: string;
  majorOperatorKeywords: readonly string[];
  initialView: {
    centerLat: number;
    centerLng: number;
    altitudeMeters: number;
    radiusMeters: number;
    headingDeg: number;
    pitchDeg: number;
  };
  bbox: AreaBBox;
  extendedBbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  dataPaths: {
    localBuildingTilesetUrls: readonly string[];
    localBuildingGeoJsonUrls: readonly string[];
    remoteBuildingTilesetUrl: string;
    roadNetworkGeoJsonUrl: string;
    transitFacilitiesGeoJsonUrl: string;
    busStopsGeoJsonUrl: string;
    stationsGeoJsonUrl: string;
    placeLabelsJsonUrl: string;
    existingDemandTransitJsonUrl: string;
    buildingNetworkScoresJsonUrl: string;
    routingGraphJsonUrl: string;
  };
  slopeParams: AreaSlopeParams;
};

export const AREA_CONFIGS: Record<AreaId, AreaConfig> = {
  hiroshima_bishamondai: {
    id: "hiroshima_bishamondai",
    selectorLabel: "広島市安佐南区（毘沙門台）",
    name: TARGET_AREA_NAME,
    titleLabel: "広島市安佐南区 毘沙門台 交通空白地推計",
    detailName: TARGET_AREA_DETAIL_NAME,
    cityCode: TARGET_CITY_CODE,
    meshCodes: TARGET_MESH_CODES,
    descriptionText:
      "バス停（毘沙門台団地線等）400m／鉄道駅（アストラムライン毘沙門台駅等）800mを参考に、急傾斜地の上り坂負荷補正を加えて判定しています。",
    stationLegendLabel: "鉄道駅（アストラムライン・JR。800m圏判定に使用）",
    majorBusLegendLabel: "バス停（広島交通・広電バス等。400m圏判定に使用）",
    majorOperatorKeywords: [
      "広島交通",
      "広電バス",
      "広島電鉄",
      "中国ジェイアールバス",
      "フォーブル",
      "広島高速交通",
      "アストラムライン",
    ],
    initialView: {
      centerLat: TARGET_CENTER_LAT,
      centerLng: TARGET_CENTER_LNG,
      altitudeMeters: TARGET_INITIAL_ALTITUDE_METERS,
      radiusMeters: TARGET_INITIAL_ALTITUDE_METERS,
      headingDeg: TARGET_INITIAL_HEADING_DEG,
      pitchDeg: TARGET_INITIAL_PITCH_DEG,
    },
    bbox: BISHAMONDAI_BBOX,
    extendedBbox: BISHAMONDAI_EXTENDED_BBOX,
    dataPaths: {
      localBuildingTilesetUrls: LOCAL_BUILDING_TILESET_URLS,
      localBuildingGeoJsonUrls: LOCAL_BUILDING_GEOJSON_URLS,
      remoteBuildingTilesetUrl: REMOTE_BUILDING_TILESET_URL,
      roadNetworkGeoJsonUrl: ROAD_NETWORK_GEOJSON_URL,
      transitFacilitiesGeoJsonUrl: TRANSIT_FACILITIES_GEOJSON_URL,
      busStopsGeoJsonUrl: BUS_STOPS_GEOJSON_URL,
      stationsGeoJsonUrl: STATIONS_GEOJSON_URL,
      placeLabelsJsonUrl: PLACE_LABELS_JSON_URL,
      existingDemandTransitJsonUrl: EXISTING_DEMAND_TRANSIT_JSON_URL,
      buildingNetworkScoresJsonUrl: BUILDING_NETWORK_SCORES_JSON_URL,
      routingGraphJsonUrl: ROUTING_GRAPH_JSON_URL,
    },
    slopeParams: {
      sampleCount: SLOPE_SAMPLE_COUNT,
      gradientCap: SLOPE_GRADIENT_CAP,
      uphillDistanceMultiplier: SLOPE_UPHILL_DISTANCE_MULTIPLIER,
      downhillDistanceMultiplier: SLOPE_DOWNHILL_DISTANCE_MULTIPLIER,
      roadNetworkDetourFactor: ROAD_NETWORK_DETOUR_FACTOR,
      slopeNote: "標準斜面団地補正（上り坂距離換算 1.25倍）",
      walkProfiles: WALK_PROFILES,
    },
  },
  kure_miyahara: {
    id: "kure_miyahara",
    selectorLabel: "呉市（宮原地区）",
    name: KURE_MIYAHARA_AREA_NAME,
    titleLabel: "呉市 宮原地区 交通空白地推計",
    detailName: KURE_MIYAHARA_AREA_DETAIL_NAME,
    cityCode: KURE_MIYAHARA_CITY_CODE,
    meshCodes: KURE_MIYAHARA_MESH_CODES,
    descriptionText:
      "バス停（広電バス宮原線等）400m／鉄道駅（JR呉駅等）800mを参考に、急勾配・階段が多い斜面市街地の上り坂負荷補正（強化設定）を加えて判定しています。",
    stationLegendLabel: "鉄道駅（JR呉線。800m圏判定に使用）",
    majorBusLegendLabel: "バス停（広電バス・呉市生活バス等。400m圏判定に使用）",
    majorOperatorKeywords: [
      "広電バス",
      "広島電鉄",
      "呉市",
      "呉市営",
      "呉市営バス",
      "呉市生活バス",
      "中国ジェイアールバス",
    ],
    initialView: {
      centerLat: KURE_MIYAHARA_CENTER_LAT,
      centerLng: KURE_MIYAHARA_CENTER_LNG,
      altitudeMeters: KURE_MIYAHARA_INITIAL_ALTITUDE_METERS,
      radiusMeters: KURE_MIYAHARA_INITIAL_ALTITUDE_METERS,
      headingDeg: KURE_MIYAHARA_INITIAL_HEADING_DEG,
      pitchDeg: KURE_MIYAHARA_INITIAL_PITCH_DEG,
    },
    bbox: KURE_MIYAHARA_BBOX,
    extendedBbox: KURE_MIYAHARA_EXTENDED_BBOX,
    dataPaths: {
      localBuildingTilesetUrls: KURE_LOCAL_BUILDING_TILESET_URLS,
      localBuildingGeoJsonUrls: KURE_LOCAL_BUILDING_GEOJSON_URLS,
      remoteBuildingTilesetUrl: KURE_REMOTE_BUILDING_TILESET_URL,
      roadNetworkGeoJsonUrl: KURE_ROAD_NETWORK_GEOJSON_URL,
      transitFacilitiesGeoJsonUrl: KURE_TRANSIT_FACILITIES_GEOJSON_URL,
      busStopsGeoJsonUrl: KURE_BUS_STOPS_GEOJSON_URL,
      stationsGeoJsonUrl: KURE_STATIONS_GEOJSON_URL,
      placeLabelsJsonUrl: KURE_PLACE_LABELS_JSON_URL,
      existingDemandTransitJsonUrl: KURE_EXISTING_DEMAND_TRANSIT_JSON_URL,
      buildingNetworkScoresJsonUrl: KURE_BUILDING_NETWORK_SCORES_JSON_URL,
      routingGraphJsonUrl: KURE_ROUTING_GRAPH_JSON_URL,
    },
    // 呉市の斜面市街地は毘沙門台以上に急勾配や階段が多く、車道が途切れる箇所が存在するため、
    // 上り坂に対する実効歩行距離のペナルティ係数および道路迂回係数を強調した個別設定としている。
    slopeParams: {
      sampleCount: SLOPE_SAMPLE_COUNT,
      gradientCap: 0.45,
      uphillDistanceMultiplier: 1.55,
      downhillDistanceMultiplier: 1.1,
      roadNetworkDetourFactor: 1.48,
      slopeNote: "急傾斜・階段市街地補正（上り坂距離換算 1.55倍 / 高齢者1.85倍）",
      walkProfiles: {
        general: {
          label: "一般（急傾斜・階段補正）",
          slopePenaltyFactor: 4.5,
          uphillDistanceMultiplier: 1.55,
          downhillDistanceMultiplier: 1.1,
          walkSpeedMPerMin: 63,
        },
        elderly: {
          label: "高齢者（急傾斜・階段補正：負荷2倍）",
          slopePenaltyFactor: 9.0,
          uphillDistanceMultiplier: 1.85,
          downhillDistanceMultiplier: 1.2,
          walkSpeedMPerMin: 45,
        },
      },
    },
  },
};

export const AREA_LIST: readonly AreaConfig[] = [
  AREA_CONFIGS.kure_miyahara,
  AREA_CONFIGS.hiroshima_bishamondai,
];

export function getAreaConfig(areaId: AreaId): AreaConfig {
  return AREA_CONFIGS[areaId] ?? AREA_CONFIGS[DEFAULT_AREA_ID];
}

export function isInsideAreaBBox(areaId: AreaId, lng: number, lat: number): boolean {
  const { bbox } = getAreaConfig(areaId);
  return (
    lat >= bbox.south &&
    lat <= bbox.north &&
    lng >= bbox.west &&
    lng <= bbox.east
  );
}

export function isInsideAreaEvaluationBBox(areaId: AreaId, lng: number, lat: number): boolean {
  const { bbox, extendedBbox } = getAreaConfig(areaId);
  return (
    (lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east) ||
    (lat >= extendedBbox.minLat &&
      lat <= extendedBbox.maxLat &&
      lng >= extendedBbox.minLng &&
      lng <= extendedBbox.maxLng)
  );
}
export type BuildingNetworkScoreRow = {
  buildingId: string;
  networkNode: number;
  datasetVersion: string;
  nearestStopName_general: string;
  nearestStopName_elderly: string;
  nearestStationName_general: string;
  nearestStationName_elderly: string;
  busNetworkDistanceM_elderly: number;
  stationNetworkDistanceM_elderly: number;
  lat: number;
  lng: number;
  usage: string;
  totalFloorArea: number | null;
  busNetworkDistanceM: number;
  stationNetworkDistanceM: number;
  busEffectiveDistanceM_general: number;
  stationEffectiveDistanceM_general: number;
  coverageRatio_general: number;
  busEffectiveDistanceM_elderly: number;
  stationEffectiveDistanceM_elderly: number;
  coverageRatio_elderly: number;
  nearestStopName: string;
  nearestStationName: string;
};

export type DemandTransitPlanResult = {
  count: number;
  averageBeforeMeters: number;
  averageAfterMeters: number;
  farthestTenPercentBeforeMeters: number;
  farthestTenPercentAfterMeters: number;
  newlyCoveredBuildings: number;
  severeGapBeforeBuildings: number;
  severeGapAfterBuildings: number;
};
export type DemandTransitPlanAnalysis = {
  targetBuildingCount: number;
  scopeLabel: string;
  methodLabel: string;
  thresholdMultiplier: number;
  results: DemandTransitPlanResult[];
};
export type DemandTransitMember = {
  networkNode?: number;
  lat: number;
  lng: number;
  busStraightDistanceMeters: number;
  busEffectiveDistanceMeters: number;
  stationEffectiveDistanceMeters: number;
  coverageRatio: number;
};
export type DemandTransitPlanSite = { lat: number; lng: number; x: number; y: number; distances?: number[] };

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function projectToLocalMeters(lat: number, lng: number, refLat: number, refLng: number): [number, number] {
  const refLatRad = (refLat * Math.PI) / 180;
  return [(lng - refLng) * 111320 * Math.cos(refLatRad), (lat - refLat) * 110540];
}
export function unprojectFromLocalMeters(x: number, y: number, refLat: number, refLng: number): [number, number] {
  const refLatRad = (refLat * Math.PI) / 180;
  return [refLat + y / 110540, refLng + x / (111320 * Math.cos(refLatRad))];
}

// シンプルなk-means実装（Lloyd法）。
export function kMeans(
  points: [number, number][],
  k: number,
  maxIterations = 20
): { centroid: [number, number]; indices: number[] }[] {
  if (points.length === 0 || k <= 0) return [];
  const effectiveK = Math.min(k, points.length);
  const sortedIndices = [...points.keys()].sort((a, b) => points[a][0] - points[b][0]);
  let centroids: [number, number][] = Array.from({ length: effectiveK }, (_, i) => {
    const idx = sortedIndices[Math.floor(((i + 0.5) * points.length) / effectiveK)];
    return [points[idx][0], points[idx][1]];
  });
  const assignments = new Array(points.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < effectiveK; c++) {
        const dx = points[i][0] - centroids[c][0];
        const dy = points[i][1] - centroids[c][1];
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }

    const sums: [number, number][] = Array.from({ length: effectiveK }, () => [0, 0]);
    const counts = new Array(effectiveK).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      counts[c]++;
    }
    centroids = centroids.map((prev, c) => (counts[c] > 0 ? [sums[c][0] / counts[c], sums[c][1] / counts[c]] : prev));

    if (!changed) break;
  }

  const groups: number[][] = Array.from({ length: effectiveK }, () => []);
  for (let i = 0; i < points.length; i++) {
    groups[assignments[i]].push(i);
  }
  return centroids.map((centroid, c) => ({ centroid, indices: groups[c] })).filter((g) => g.indices.length > 0);
}

export const DEMAND_TRANSIT_CANDIDATE_GRID_METERS = 400;
export function buildGreedyDemandTransitPlan(
  members: DemandTransitMember[],
  maxSites: number,
  thresholdMultiplier: number
): { sites: DemandTransitPlanSite[]; results: DemandTransitPlanResult[] } {
  if (members.length === 0) return { sites: [], results: [] };
  const refLat = members.reduce((sum, building) => sum + building.lat, 0) / members.length;
  const refLng = members.reduce((sum, building) => sum + building.lng, 0) / members.length;
  const points = members.map((building) => projectToLocalMeters(building.lat, building.lng, refLat, refLng));
  const slopeLoads = members.map((building) =>
    Math.max(1, building.busEffectiveDistanceMeters / Math.max(building.busStraightDistanceMeters, 1))
  );

  const grid = new Map<string, { xSum: number; ySum: number; count: number }>();
  points.forEach(([x, y]) => {
    const key = `${Math.floor(x / DEMAND_TRANSIT_CANDIDATE_GRID_METERS)},${Math.floor(y / DEMAND_TRANSIT_CANDIDATE_GRID_METERS)}`;
    const cell = grid.get(key) ?? { xSum: 0, ySum: 0, count: 0 };
    cell.xSum += x;
    cell.ySum += y;
    cell.count++;
    grid.set(key, cell);
  });
  const candidateSites: DemandTransitPlanSite[] = [...grid.values()].map((cell) => {
    const x = cell.xSum / cell.count;
    const y = cell.ySum / cell.count;
    const [lat, lng] = unprojectFromLocalMeters(x, y, refLat, refLng);
    return { lat, lng, x, y };
  });

  const currentDistances = members.map((building) => building.busEffectiveDistanceMeters);
  const averageBeforeMeters = currentDistances.reduce((sum, distance) => sum + distance, 0) / members.length;
  const farthestCount = Math.max(1, Math.ceil(members.length * 0.1));
  const farthestIndices = new Set(
    [...members.keys()]
      .sort((a, b) => members[b].busEffectiveDistanceMeters - members[a].busEffectiveDistanceMeters)
      .slice(0, farthestCount)
  );
  const farthestTenPercentBeforeMeters =
    [...farthestIndices].reduce((sum, index) => sum + members[index].busEffectiveDistanceMeters, 0) / farthestCount;
  const severeGapBeforeBuildings = members.filter((building) => building.coverageRatio > 1.5).length;
  const selectedCandidateIndices = new Set<number>();
  const sites: DemandTransitPlanSite[] = [];
  const results: DemandTransitPlanResult[] = [];

  for (let step = 0; step < Math.min(maxSites, candidateSites.length); step++) {
    let bestCandidateIndex = -1;
    let bestTotalImprovement = -Infinity;
    for (let candidateIndex = 0; candidateIndex < candidateSites.length; candidateIndex++) {
      if (selectedCandidateIndices.has(candidateIndex)) continue;
      const candidate = candidateSites[candidateIndex];
      let totalImprovement = 0;
      for (let i = 0; i < members.length; i++) {
        const candidateDistance = haversineMeters(members[i].lat, members[i].lng, candidate.lat, candidate.lng) * slopeLoads[i];
        if (candidateDistance < currentDistances[i]) totalImprovement += currentDistances[i] - candidateDistance;
      }
      if (totalImprovement > bestTotalImprovement) {
        bestTotalImprovement = totalImprovement;
        bestCandidateIndex = candidateIndex;
      }
    }
    if (bestCandidateIndex < 0) break;

    selectedCandidateIndices.add(bestCandidateIndex);
    const selectedSite = candidateSites[bestCandidateIndex];
    sites.push(selectedSite);
    for (let i = 0; i < members.length; i++) {
      const candidateDistance = haversineMeters(members[i].lat, members[i].lng, selectedSite.lat, selectedSite.lng) * slopeLoads[i];
      if (candidateDistance < currentDistances[i]) currentDistances[i] = candidateDistance;
    }

    let farthestAfterTotal = 0;
    let newlyCoveredBuildings = 0;
    let severeGapAfterBuildings = 0;
    for (let i = 0; i < members.length; i++) {
      const afterDistance = currentDistances[i];
      if (farthestIndices.has(i)) farthestAfterTotal += afterDistance;
      if (members[i].coverageRatio > 1 && afterDistance <= BUS_COVERAGE_THRESHOLD_METERS * thresholdMultiplier) {
        newlyCoveredBuildings++;
      }
      const coverageRatioAfter = Math.min(
        afterDistance / (BUS_COVERAGE_THRESHOLD_METERS * thresholdMultiplier),
        members[i].stationEffectiveDistanceMeters / (STATION_COVERAGE_THRESHOLD_METERS * thresholdMultiplier)
      );
      if (coverageRatioAfter > 1.5) severeGapAfterBuildings++;
    }
    results.push({
      count: sites.length,
      averageBeforeMeters,
      averageAfterMeters: currentDistances.reduce((sum, distance) => sum + distance, 0) / members.length,
      farthestTenPercentBeforeMeters,
      farthestTenPercentAfterMeters: farthestAfterTotal / farthestCount,
      newlyCoveredBuildings,
      severeGapBeforeBuildings,
      severeGapAfterBuildings,
    });
  }
  return { sites, results };
}

export type CustomStopSite = {
  id: number;
  label: string;
  lat: number;
  lng: number;
};

export type CustomStopBuildingRecord = {
  buildingId: string;
  lat: number;
  lng: number;
  baseBusEffectiveDistanceMeters: number;
  baseStationEffectiveDistanceMeters: number;
  baseCoverageRatio: number;
  totalFloorArea: number | null;
};

export type CustomStopBuildingOutcome = {
  bestStopId: number | null;
  bestStopLabel: string | null;
  bestCustomDistanceMeters: number;
  afterBusEffectiveDistanceMeters: number;
  afterCoverageRatio: number;
  isNewlyCovered: boolean;
  isImprovedGap: boolean;
};

export type CustomStopPerSiteStat = {
  id: number;
  label: string;
  lat: number;
  lng: number;
  standaloneCoveredBuildings: number;
  primaryCoveredBuildings: number;
};

export type CustomStopSimulationSummary = {
  stopCount: number;
  totalGapBuildingsBefore: number;
  newlyCoveredBuildings: number;
  newlyCoveredFloorArea: number;
  remainingGapBuildings: number;
  severeGapBeforeBuildings: number;
  severeGapAfterBuildings: number;
  improvedGapBuildingsCount: number;
  averageImprovedBusBeforeMeters: number | null;
  averageImprovedBusAfterMeters: number | null;
  perStopStats: CustomStopPerSiteStat[];
};

export function evaluateCustomStopsSimulation(
  buildings: Iterable<CustomStopBuildingRecord>,
  stops: CustomStopSite[],
  stopDistanceMap: ReadonlyMap<number, ReadonlyMap<string, number>>,
  thresholdMultiplier = 1
): {
  outcomes: Map<string, CustomStopBuildingOutcome>;
  summary: CustomStopSimulationSummary;
} {
  const busThreshold = BUS_COVERAGE_THRESHOLD_METERS * thresholdMultiplier;
  const stationThreshold = STATION_COVERAGE_THRESHOLD_METERS * thresholdMultiplier;
  const outcomes = new Map<string, CustomStopBuildingOutcome>();

  const standaloneCounts = new Map<number, number>();
  const primaryCounts = new Map<number, number>();
  for (const stop of stops) {
    standaloneCounts.set(stop.id, 0);
    primaryCounts.set(stop.id, 0);
  }

  let totalGapBuildingsBefore = 0;
  let newlyCoveredBuildings = 0;
  let newlyCoveredFloorArea = 0;
  let remainingGapBuildings = 0;
  let severeGapBeforeBuildings = 0;
  let severeGapAfterBuildings = 0;
  let improvedGapBuildingsCount = 0;
  let improvedBusBeforeSum = 0;
  let improvedBusAfterSum = 0;

  for (const b of buildings) {
    const isGapBefore = b.baseCoverageRatio > 1;
    if (isGapBefore) {
      totalGapBuildingsBefore++;
      if (b.baseCoverageRatio > 1.5) {
        severeGapBeforeBuildings++;
      }
    }

    let bestStopId: number | null = null;
    let bestStopLabel: string | null = null;
    let bestCustomDistanceMeters = Infinity;

    for (const stop of stops) {
      const dist = stopDistanceMap.get(stop.id)?.get(b.buildingId);
      if (
        dist !== undefined &&
        Number.isFinite(dist) &&
        dist < b.baseBusEffectiveDistanceMeters
      ) {
        if (isGapBefore && dist <= busThreshold) {
          standaloneCounts.set(stop.id, (standaloneCounts.get(stop.id) ?? 0) + 1);
        }
        if (dist < bestCustomDistanceMeters) {
          bestCustomDistanceMeters = dist;
          bestStopId = stop.id;
          bestStopLabel = stop.label;
        }
      }
    }

    const afterBusEffectiveDistanceMeters = Math.min(
      b.baseBusEffectiveDistanceMeters,
      bestCustomDistanceMeters
    );
    const isNewlyCovered = isGapBefore && bestCustomDistanceMeters <= busThreshold;
    const afterCoverageRatio =
      bestCustomDistanceMeters < b.baseBusEffectiveDistanceMeters
        ? Math.min(
            b.baseCoverageRatio,
            bestCustomDistanceMeters / busThreshold,
            b.baseStationEffectiveDistanceMeters / stationThreshold
          )
        : b.baseCoverageRatio;
    const isImprovedGap =
      isGapBefore &&
      (afterBusEffectiveDistanceMeters < b.baseBusEffectiveDistanceMeters - 0.5 || isNewlyCovered);

    if (isGapBefore) {
      if (isNewlyCovered) {
        newlyCoveredBuildings++;
        if (b.totalFloorArea != null && Number.isFinite(b.totalFloorArea)) {
          newlyCoveredFloorArea += b.totalFloorArea;
        }
        if (bestStopId !== null) {
          primaryCounts.set(bestStopId, (primaryCounts.get(bestStopId) ?? 0) + 1);
        }
      } else {
        remainingGapBuildings++;
      }
      if (afterCoverageRatio > 1.5) {
        severeGapAfterBuildings++;
      }
      if (isImprovedGap) {
        improvedGapBuildingsCount++;
        improvedBusBeforeSum += b.baseBusEffectiveDistanceMeters;
        improvedBusAfterSum += afterBusEffectiveDistanceMeters;
      }
    }

    if (stops.length > 0 && bestCustomDistanceMeters < b.baseBusEffectiveDistanceMeters) {
      outcomes.set(b.buildingId, {
        bestStopId,
        bestStopLabel,
        bestCustomDistanceMeters,
        afterBusEffectiveDistanceMeters,
        afterCoverageRatio,
        isNewlyCovered,
        isImprovedGap,
      });
    }
  }

  const perStopStats: CustomStopPerSiteStat[] = stops.map((stop) => ({
    id: stop.id,
    label: stop.label,
    lat: stop.lat,
    lng: stop.lng,
    standaloneCoveredBuildings: standaloneCounts.get(stop.id) ?? 0,
    primaryCoveredBuildings: primaryCounts.get(stop.id) ?? 0,
  }));

  return {
    outcomes,
    summary: {
      stopCount: stops.length,
      totalGapBuildingsBefore,
      newlyCoveredBuildings,
      newlyCoveredFloorArea,
      remainingGapBuildings,
      severeGapBeforeBuildings,
      severeGapAfterBuildings,
      improvedGapBuildingsCount,
      averageImprovedBusBeforeMeters:
        improvedGapBuildingsCount > 0 ? improvedBusBeforeSum / improvedGapBuildingsCount : null,
      averageImprovedBusAfterMeters:
        improvedGapBuildingsCount > 0 ? improvedBusAfterSum / improvedGapBuildingsCount : null,
      perStopStats,
    },
  };
}

export type CustomStopExportItem = {
  id: number;
  label: string;
  lat: number;
  lng: number;
  standaloneCoveredBuildings?: number;
  primaryCoveredBuildings?: number;
};

export type NewlyCoveredBuildingExportItem = {
  buildingId: string;
  lat: number;
  lng: number;
  usage?: string;
  totalFloorArea?: number | null;
  assignedStopLabel?: string;
  originalNearestStopName?: string;
  beforeBusEffectiveDistanceMeters: number;
  afterBusEffectiveDistanceMeters: number;
  beforeBusWalkMinutes?: number;
  afterBusWalkMinutes?: number;
  walkProfileLabel?: string;
};

export type SimulationGeoJsonFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Record<string, string | number | boolean | null>;
};

export type SimulationGeoJson = {
  type: "FeatureCollection";
  name: string;
  crs: {
    type: "name";
    properties: {
      name: string;
    };
  };
  features: SimulationGeoJsonFeature[];
};

/**
 * 停留所自由配置シミュレーション結果（配置した仮設停留所および新規カバー建物）を
 * QGIS等の一般的なGISソフトで直接取り込めるGeoJSON形式に整形する。
 */
export function buildCustomStopSimulationGeoJson(params: {
  stops: CustomStopExportItem[];
  newlyCoveredBuildings: NewlyCoveredBuildingExportItem[];
}): SimulationGeoJson {
  const features: SimulationGeoJsonFeature[] = [];

  for (const stop of params.stops) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          Number(stop.lng.toFixed(6)),
          Number(stop.lat.toFixed(6)),
        ],
      },
      properties: {
        feature_type: "custom_stop",
        stop_id: stop.id,
        name: stop.label,
        standalone_covered_buildings: stop.standaloneCoveredBuildings ?? 0,
        primary_covered_buildings: stop.primaryCoveredBuildings ?? 0,
      },
    });
  }

  for (const b of params.newlyCoveredBuildings) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          Number(b.lng.toFixed(6)),
          Number(b.lat.toFixed(6)),
        ],
      },
      properties: {
        feature_type: "newly_covered_building",
        building_id: b.buildingId,
        usage: b.usage ?? "不明",
        total_floor_area_sqm:
          b.totalFloorArea != null && Number.isFinite(b.totalFloorArea)
            ? Math.round(b.totalFloorArea * 10) / 10
            : null,
        assigned_stop: b.assignedStopLabel ?? "",
        original_bus_stop: b.originalNearestStopName ?? "",
        before_bus_distance_m: Math.round(b.beforeBusEffectiveDistanceMeters),
        after_bus_distance_m: Math.round(b.afterBusEffectiveDistanceMeters),
        reduced_distance_m: Math.max(
          0,
          Math.round(b.beforeBusEffectiveDistanceMeters - b.afterBusEffectiveDistanceMeters)
        ),
        before_bus_walk_min:
          b.beforeBusWalkMinutes != null
            ? Math.round(b.beforeBusWalkMinutes * 10) / 10
            : null,
        after_bus_walk_min:
          b.afterBusWalkMinutes != null
            ? Math.round(b.afterBusWalkMinutes * 10) / 10
            : null,
        walk_profile: b.walkProfileLabel ?? null,
      },
    });
  }

  return {
    type: "FeatureCollection",
    name: "plateau_custom_stop_simulation",
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:OGC:1.3:CRS84",
      },
    },
    features,
  };
}

// -----------------------------------------------------------------------------
// モビリティ・ハブ検討シミュレーション（広島市安佐南区 毘沙門台エリア）
// -----------------------------------------------------------------------------

export type MobilityHubSite = {
  id: number;
  name: string;
  address: string;
  description: string;
  lat: number;
  lng: number;
};

// 広島市安佐南区 毘沙門台エリア（1丁目〜4丁目および周辺斜面地）におけるモビリティ・ハブ検討候補地点
export const MOBILITY_HUB_CANDIDATES: MobilityHubSite[] = [
  {
    id: 1,
    name: "① アストラムライン毘沙門台駅・団地入口",
    address: "広島市安佐南区毘沙門台1丁目1",
    description: "毘沙門台駅〜団地1丁目結節点エリア",
    lat: 34.469602,
    lng: 132.462687,
  },
  {
    id: 2,
    name: "② 毘沙門台2丁目・団地中央",
    address: "広島市安佐南区毘沙門台2丁目18",
    description: "毘沙門台上・安古市高校前周辺の斜面中腹エリア",
    lat: 34.476078,
    lng: 132.461986,
  },
  {
    id: 3,
    name: "③ 毘沙門台3丁目・4丁目高台",
    address: "広島市安佐南区毘沙門台3丁目・4丁目",
    description: "毘沙門台小学校前〜毘沙門台4丁目上部斜面エリア",
    lat: 34.482128,
    lng: 132.464586,
  },
  {
    id: 4,
    name: "④ 毘沙門台東・緑井斜面下部",
    address: "広島市安佐南区緑井・毘沙門台東周辺",
    description: "毘沙門台エリア南東側・急傾斜地接続拠点",
    lat: 34.468,
    lng: 132.481,
  },
];

export type MobilityHubMode = "cycle" | "kickboard" | "carshare" | "custom";

export type MobilityHubModePreset = {
  id: MobilityHubMode;
  label: string;
  icon: string;
  minMeters: number;
  maxMeters: number;
  description: string;
};

export const MOBILITY_HUB_MODES: MobilityHubModePreset[] = [
  {
    id: "cycle",
    label: "シェアサイクル",
    icon: "🚲",
    minMeters: 400,
    maxMeters: 1500,
    description: "徒歩5分超〜電動アシスト自転車約7分圏。坂道や日常の買い物・駅への移動",
  },
  {
    id: "kickboard",
    label: "特定小型原付",
    icon: "🛴",
    minMeters: 400,
    maxMeters: 1000,
    description: "徒歩5分超〜電動モビリティ約5分圏。短距離のラストワンマイル",
  },
  {
    id: "carshare",
    label: "カーシェア/小型EV",
    icon: "🚗",
    minMeters: 1000,
    maxMeters: 3000,
    description: "徒歩困難な急傾斜・広域空白地〜車約10分圏。雨天時やまとめ買い・通院",
  },
  {
    id: "custom",
    label: "自由設定",
    icon: "⚙️",
    minMeters: 400,
    maxMeters: 2000,
    description: "任意の最小・最大距離を指定して救済範囲を検証",
  },
];

export type MobilityHubBuildingRecord = {
  buildingId: string;
  lat: number;
  lng: number;
  baseCoverageRatio: number;
  totalFloorArea: number | null;
  baseBusEffectiveDistanceMeters: number;
  usage?: string;
};

export type MobilityHubBuildingOutcome = {
  isCoveredByHub: boolean;
  nearestHubId: number | null;
  nearestHubName: string | null;
  hubDistanceMeters: number;
  mode?: MobilityHubMode;
  modeLabel?: string;
};

export type MobilityHubSiteConfig = {
  hubId: number;
  mode: MobilityHubMode;
  minDistanceMeters: number;
  maxDistanceMeters: number;
};

export type MobilityHubPerSiteStat = {
  hubId: number;
  name: string;
  address: string;
  coveredBuildings: number;
  appliedMode?: MobilityHubMode;
  modeLabel?: string;
  minMeters?: number;
  maxMeters?: number;
};

export type MobilityHubSimulationSummary = {
  activeHubCount: number;
  selectedMode: MobilityHubMode;
  minDistanceMeters: number;
  maxDistanceMeters: number;
  totalGapBuildingsBefore: number;
  newlyCoveredBuildings: number;
  newlyCoveredFloorArea: number;
  severeGapBeforeBuildings: number;
  severeGapCoveredBuildings: number;
  perHubStats: MobilityHubPerSiteStat[];
};

/**
 * モビリティ・ハブ検討シミュレーション。
 * 交通空白地（カバー率>1）の住宅のうち、選択されたハブ候補地から
 * 指定の距離範囲（minMeters〜maxMeters、またはハブ個別設定）に位置する建物を抽出・集計する。
 */
export function evaluateMobilityHubSimulation(
  buildings: Iterable<MobilityHubBuildingRecord>,
  activeHubs: MobilityHubSite[],
  minDistanceMeters: number,
  maxDistanceMeters: number,
  mode: MobilityHubMode,
  hubConfigs?: Map<number, MobilityHubSiteConfig>
): {
  outcomes: Map<string, MobilityHubBuildingOutcome>;
  summary: MobilityHubSimulationSummary;
} {
  const outcomes = new Map<string, MobilityHubBuildingOutcome>();
  const hubCounts = new Map<number, number>();
  for (const hub of activeHubs) {
    hubCounts.set(hub.id, 0);
  }

  let totalGapBuildingsBefore = 0;
  let newlyCoveredBuildings = 0;
  let newlyCoveredFloorArea = 0;
  let severeGapBeforeBuildings = 0;
  let severeGapCoveredBuildings = 0;

  for (const b of buildings) {
    const isGapBefore = b.baseCoverageRatio > 1;
    if (!isGapBefore) continue;

    totalGapBuildingsBefore++;
    const isSevere = b.baseCoverageRatio > 1.5;
    if (isSevere) severeGapBeforeBuildings++;

    if (activeHubs.length === 0) continue;

    let bestCoveringHub: {
      hubId: number;
      hubName: string;
      dist: number;
      mode: MobilityHubMode;
      modeLabel: string;
    } | null = null;
    let minCoveringDist = Infinity;

    for (const hub of activeHubs) {
      const cfg = hubConfigs?.get(hub.id);
      const hubMin = cfg ? cfg.minDistanceMeters : minDistanceMeters;
      const hubMax = cfg ? cfg.maxDistanceMeters : maxDistanceMeters;
      const hubMode = cfg ? cfg.mode : mode;

      // 道路網の蛇行等を考慮した標準迂回係数 1.2
      const dist = haversineMeters(b.lat, b.lng, hub.lat, hub.lng) * 1.2;
      if (dist >= hubMin && dist <= hubMax) {
        if (dist < minCoveringDist) {
          minCoveringDist = dist;
          const modeDef = MOBILITY_HUB_MODES.find((m) => m.id === hubMode);
          bestCoveringHub = {
            hubId: hub.id,
            hubName: hub.name,
            dist,
            mode: hubMode,
            modeLabel: modeDef?.label ?? "自由設定",
          };
        }
      }
    }

    if (bestCoveringHub) {
      newlyCoveredBuildings++;
      if (b.totalFloorArea != null && Number.isFinite(b.totalFloorArea)) {
        newlyCoveredFloorArea += b.totalFloorArea;
      }
      if (isSevere) {
        severeGapCoveredBuildings++;
      }
      hubCounts.set(bestCoveringHub.hubId, (hubCounts.get(bestCoveringHub.hubId) ?? 0) + 1);

      outcomes.set(b.buildingId, {
        isCoveredByHub: true,
        nearestHubId: bestCoveringHub.hubId,
        nearestHubName: bestCoveringHub.hubName,
        hubDistanceMeters: bestCoveringHub.dist,
        mode: bestCoveringHub.mode,
        modeLabel: bestCoveringHub.modeLabel,
      });
    }
  }

  const perHubStats: MobilityHubPerSiteStat[] = activeHubs.map((hub) => {
    const cfg = hubConfigs?.get(hub.id);
    const hubMode = cfg ? cfg.mode : mode;
    const modeDef = MOBILITY_HUB_MODES.find((m) => m.id === hubMode);
    return {
      hubId: hub.id,
      name: hub.name,
      address: hub.address,
      coveredBuildings: hubCounts.get(hub.id) ?? 0,
      appliedMode: hubMode,
      modeLabel: modeDef?.label ?? "自由設定",
      minMeters: cfg ? cfg.minDistanceMeters : minDistanceMeters,
      maxMeters: cfg ? cfg.maxDistanceMeters : maxDistanceMeters,
    };
  });

  return {
    outcomes,
    summary: {
      activeHubCount: activeHubs.length,
      selectedMode: mode,
      minDistanceMeters,
      maxDistanceMeters,
      totalGapBuildingsBefore,
      newlyCoveredBuildings,
      newlyCoveredFloorArea,
      severeGapBeforeBuildings,
      severeGapCoveredBuildings,
      perHubStats,
    },
  };
}

export type MobilityHubCoveredBuildingExportItem = {
  buildingId: string;
  lat: number;
  lng: number;
  usage?: string;
  totalFloorArea?: number | null;
  nearestHubName: string;
  hubDistanceMeters: number;
  originalBusDistanceMeters: number;
  appliedModeLabel?: string;
};

export function buildMobilityHubSimulationGeoJson(params: {
  hubs: MobilityHubSite[];
  modeLabel: string;
  minDistanceMeters: number;
  maxDistanceMeters: number;
  coveredBuildings: MobilityHubCoveredBuildingExportItem[];
}): SimulationGeoJson {
  const features: SimulationGeoJsonFeature[] = [];

  for (const hub of params.hubs) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(hub.lng.toFixed(6)), Number(hub.lat.toFixed(6))],
      },
      properties: {
        feature_type: "mobility_hub_candidate",
        hub_id: hub.id,
        name: hub.name,
        address: hub.address,
        description: hub.description,
        applied_mode: params.modeLabel,
        distance_range_m: `${params.minDistanceMeters}m - ${params.maxDistanceMeters}m`,
      },
    });
  }

  for (const b of params.coveredBuildings) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(b.lng.toFixed(6)), Number(b.lat.toFixed(6))],
      },
      properties: {
        feature_type: "hub_rescued_gap_building",
        building_id: b.buildingId,
        usage: b.usage ?? "不明",
        total_floor_area_sqm:
          b.totalFloorArea != null && Number.isFinite(b.totalFloorArea)
            ? Math.round(b.totalFloorArea * 10) / 10
            : null,
        assigned_hub: b.nearestHubName,
        hub_distance_m: Math.round(b.hubDistanceMeters),
        original_bus_distance_m: Math.round(b.originalBusDistanceMeters),
        applied_mode: b.appliedModeLabel ?? params.modeLabel,
      },
    });
  }

  return {
    type: "FeatureCollection",
    name: "plateau_mobility_hub_simulation",
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:OGC:1.3:CRS84",
      },
    },
    features,
  };
}
