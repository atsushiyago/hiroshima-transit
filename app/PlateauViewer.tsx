"use client";

import {
  AREA_LIST,
  DEFAULT_AREA_ID,
  getAreaConfig,
  isInsideAreaEvaluationBBox,
  BUS_COVERAGE_THRESHOLD_METERS,
  STATION_COVERAGE_THRESHOLD_METERS,
  SLOPE_SAMPLE_COUNT,
  SLOPE_GRADIENT_CAP,
  SLOPE_UPHILL_DISTANCE_MULTIPLIER,
  SLOPE_DOWNHILL_DISTANCE_MULTIPLIER,
  computeSlopeSegmentEffectiveDistance,
  DISTANCE_MODEL_DEFAULT,
  haversineMeters,
  projectToLocalMeters,
  unprojectFromLocalMeters,
  kMeans,
  evaluateCustomStopsSimulation,
  buildCustomStopSimulationGeoJson,
  MOBILITY_HUB_CANDIDATES,
  MOBILITY_HUB_MODES,
  evaluateMobilityHubSimulation,
  buildMobilityHubSimulationGeoJson,
  type AreaId,
  type WalkProfile,
  type DistanceModel,
  type BuildingNetworkScoreRow,
  type DemandTransitPlanAnalysis,
  type DemandTransitMember,
  type DemandTransitPlanSite,
  type CustomStopSite,
  type CustomStopSimulationSummary,
  type CustomStopBuildingRecord,
  type CustomStopExportItem,
  type NewlyCoveredBuildingExportItem,
  type MobilityHubSite,
  type MobilityHubMode,
  type MobilityHubSiteConfig,
  type MobilityHubSimulationSummary,
  type MobilityHubBuildingRecord,
  type MobilityHubCoveredBuildingExportItem,
} from "./lib/transit-analysis";
import { NetworkRouter, type RoutingGraph } from "./lib/network-routing";
import { TileWorkGate } from "./lib/async-generation";
import type { AnalysisResponse } from "./workers/transit-analysis.worker";
import { SlopeCalculationModal } from "./SlopeCalculationModal";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import * as Cesium from "cesium";

// PLATEAU-Terrain（Cesium ionトークン不要で利用可能）
const TERRAIN_URL = "https://tile.plateauview.mlit.go.jp/terrain";

// PLATEAU-Ortho（航空写真オルソ画像。ionトークン不要）
const ORTHO_URL = "https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png";

// OpenStreetMapタイル。航空写真の上に半透明で重ね、道路網・路線名・交差点を明瞭にする。
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const BUS_STOP_COLOR = Cesium.Color.fromCssColorString("#f59e0b");
const BUS_STOP_PIXEL_SIZE = 10;
const BUS_STOP_COLOR_MINOR = Cesium.Color.fromCssColorString("#fde68a");
const BUS_STOP_PIXEL_SIZE_MINOR = BUS_STOP_PIXEL_SIZE;
const STATION_PIN_COLOR = Cesium.Color.fromCssColorString("#22d3ee");

function isMajorOperatorStop(stop: BusStop, areaId: AreaId = DEFAULT_AREA_ID): boolean {
  if (!stop.operator) return true;
  const keywords = getAreaConfig(areaId).majorOperatorKeywords;
  return keywords.some((keyword) => stop.operator.includes(keyword));
}

type BusRoute = { name: string; classCode: string | null };
type BusStop = { name: string; lat: number; lng: number; operator: string; routes: BusRoute[] };
type TrainStation = { name: string; lat: number; lng: number; operator?: string; line?: string };

// ローカルGeoJSON未配置時のフォールバック用・毘沙門台エリア基本交通施設データ
const DEFAULT_BISHAMONDAI_STATIONS: TrainStation[] = [
  { name: "毘沙門台駅", lat: 34.4696015, lng: 132.4626873, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "安東駅", lat: 34.4749944, lng: 132.4533465, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "上安駅", lat: 34.4757349, lng: 132.4447292, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "高取駅", lat: 34.4751622, lng: 132.438136, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "長楽寺駅", lat: 34.4729632, lng: 132.4310097, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "伴駅", lat: 34.4699078, lng: 132.4191041, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "大原駅", lat: 34.4632256, lng: 132.4127184, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "伴中央駅", lat: 34.45598, lng: 132.4052287, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "大塚駅", lat: 34.4415716, lng: 132.402817, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "広域公園前駅", lat: 34.4354023, lng: 132.4001446, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "大町駅", lat: 34.4616748, lng: 132.4705368, operator: "広島高速交通（アストラムライン）・JR西日本", line: "アストラムライン・JR可部線" },
  { name: "古市駅", lat: 34.4577195, lng: 132.4752085, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "中筋駅", lat: 34.451686, lng: 132.4769955, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "西原駅", lat: 34.4433627, lng: 132.4748216, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "祗園新橋北駅", lat: 34.4352184, lng: 132.4708622, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "不動院前駅", lat: 34.4265677, lng: 132.4689107, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "牛田駅", lat: 34.4175234, lng: 132.4647868, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "白島駅", lat: 34.4109218, lng: 132.4627488, operator: "広島高速交通（アストラムライン）", line: "アストラムライン" },
  { name: "緑井駅", lat: 34.4675983, lng: 132.4759686, operator: "JR西日本（可部線）", line: "JR可部線" },
  { name: "七軒茶屋駅", lat: 34.4719961, lng: 132.4805594, operator: "JR西日本（可部線）", line: "JR可部線" },
  { name: "梅林駅", lat: 34.4808645, lng: 132.4942334, operator: "JR西日本（可部線）", line: "JR可部線" },
  { name: "上八木駅", lat: 34.4899154, lng: 132.5060318, operator: "JR西日本（可部線）", line: "JR可部線" },
  { name: "古市橋駅", lat: 34.4507923, lng: 132.4681971, operator: "JR西日本（可部線）", line: "JR可部線" },
  { name: "下祗園駅", lat: 34.4395351, lng: 132.4625325, operator: "JR西日本（可部線）", line: "JR可部線" },
  { name: "安芸長束駅", lat: 34.428274, lng: 132.4560454, operator: "JR西日本（可部線）", line: "JR可部線" },
  { name: "安芸矢口駅", lat: 34.4631489, lng: 132.4949935, operator: "JR西日本（芸備線）", line: "JR芸備線" },
  { name: "玖村駅", lat: 34.4823, lng: 132.5082828, operator: "JR西日本（芸備線）", line: "JR芸備線" },
];

const DEFAULT_BISHAMONDAI_BUS_STOPS: BusStop[] = [
  { name: "毘沙門台駅", lat: 34.4696015, lng: 132.4626873, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台下", lat: 34.4703122, lng: 132.4638195, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台中", lat: 34.4703122, lng: 132.4624029, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台上", lat: 34.4760782, lng: 132.461986, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "安古市高校前", lat: 34.4779447, lng: 132.461586, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "安古市高校北口", lat: 34.481161, lng: 132.4627524, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門天", lat: 34.4793446, lng: 132.4689186, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台東一丁目", lat: 34.4797779, lng: 132.4672854, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台小学校前", lat: 34.4804445, lng: 132.4662521, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台三丁目", lat: 34.4821276, lng: 132.4645855, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "古畑", lat: 34.4833275, lng: 132.4645855, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台", lat: 34.4844106, lng: 132.4622023, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "毘沙門台駐車場", lat: 34.4857438, lng: 132.4615523, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "安佐中学校前", lat: 34.4678958, lng: 132.4665527, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "スイミング前", lat: 34.4676792, lng: 132.4695358, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "ネクスコ西日本前", lat: 34.4660661, lng: 132.4714831, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "緑井小学校前", lat: 34.4677959, lng: 132.4734688, operator: "広島交通", routes: [{ name: "毘沙門台・サンハイツ線（毘沙門台団地線）", classCode: "1" }] },
  { name: "中緑井", lat: 34.4662579, lng: 132.4772917, operator: "広島交通", routes: [{ name: "可部・深川線", classCode: "1" }] },
  { name: "緑井天満屋前", lat: 34.4666388, lng: 132.478506, operator: "広島交通", routes: [{ name: "可部・深川線", classCode: "1" }] },
  { name: "佐東出張所口", lat: 34.4703125, lng: 132.4832345, operator: "広島交通", routes: [{ name: "可部・深川線", classCode: "1" }] },
  { name: "七軒茶屋", lat: 34.472029, lng: 132.4817679, operator: "広島交通", routes: [{ name: "可部・深川線", classCode: "1" }] },
  { name: "上緑井", lat: 34.4745621, lng: 132.4846009, operator: "広島交通", routes: [{ name: "可部・深川線", classCode: "1" }] },
];

// ローカルGeoJSON未配置時のフォールバック用・呉市宮原地区基本交通施設データ
const DEFAULT_KURE_STATIONS: TrainStation[] = [
  { name: "呉駅", lat: 34.24495, lng: 132.55678, operator: "JR西日本（呉線）", line: "JR呉線" },
  { name: "川原石駅", lat: 34.24846, lng: 132.54192, operator: "JR西日本（呉線）", line: "JR呉線" },
  { name: "安芸阿賀駅", lat: 34.2367, lng: 132.6012, operator: "JR西日本（呉線）", line: "JR呉線" },
];

const DEFAULT_KURE_BUS_STOPS: BusStop[] = [
  { name: "宮原一丁目", lat: 34.2405, lng: 132.5661, operator: "広電バス", routes: [{ name: "宮原線", classCode: "1" }] },
  { name: "宮原三丁目", lat: 34.2408, lng: 132.5688, operator: "広電バス", routes: [{ name: "宮原線", classCode: "1" }] },
  { name: "宮原五丁目", lat: 34.2369, lng: 132.5675, operator: "広電バス", routes: [{ name: "宮原線", classCode: "1" }] },
  { name: "宮原高校前", lat: 34.2362, lng: 132.5702, operator: "広電バス", routes: [{ name: "宮原線", classCode: "1" }] },
  { name: "宮原七丁目", lat: 34.2339, lng: 132.5686, operator: "広電バス", routes: [{ name: "宮原線", classCode: "1" }] },
  { name: "宮原八丁目", lat: 34.2318, lng: 132.5705, operator: "広電バス", routes: [{ name: "宮原線", classCode: "1" }] },
  { name: "坪ノ内町", lat: 34.2378, lng: 132.5738, operator: "広電バス", routes: [{ name: "坪ノ内・宮原線", classCode: "1" }] },
  { name: "神山", lat: 34.2352, lng: 132.5752, operator: "広電バス", routes: [{ name: "坪ノ内・宮原線", classCode: "1" }] },
  { name: "和庄一丁目", lat: 34.2448, lng: 132.5725, operator: "広電バス", routes: [{ name: "市内循環線", classCode: "1" }] },
  { name: "和庄登町", lat: 34.2465, lng: 132.5742, operator: "広電バス", routes: [{ name: "市内循環線", classCode: "1" }] },
  { name: "和庄小学校下", lat: 34.2478, lng: 132.5755, operator: "広電バス", routes: [{ name: "市内循環線", classCode: "1" }] },
  { name: "呉駅前", lat: 34.2446, lng: 132.5582, operator: "広電バス", routes: [{ name: "呉市内幹線", classCode: "1" }] },
  { name: "中央公園", lat: 34.2458, lng: 132.5642, operator: "広電バス", routes: [{ name: "市内循環線", classCode: "1" }] },
  { name: "市役所前（呉市）", lat: 34.2482, lng: 132.5658, operator: "広電バス", routes: [{ name: "市内幹線", classCode: "1" }] },
  { name: "呉本通三丁目", lat: 34.2455, lng: 132.5671, operator: "広電バス", routes: [{ name: "市内幹線", classCode: "1" }] },
  { name: "呉本通四丁目", lat: 34.2473, lng: 132.5690, operator: "広電バス", routes: [{ name: "市内幹線", classCode: "1" }] },
  { name: "呉本通六丁目", lat: 34.2497, lng: 132.5741, operator: "広電バス", routes: [{ name: "市内幹線", classCode: "1" }] },
  { name: "呉本通八丁目", lat: 34.2510, lng: 132.5793, operator: "広電バス", routes: [{ name: "市内幹線", classCode: "1" }] },
  { name: "体育館前", lat: 34.2506, lng: 132.5634, operator: "広電バス", routes: [{ name: "西中央線", classCode: "1" }] },
  { name: "二河公園", lat: 34.2532, lng: 132.5612, operator: "広電バス", routes: [{ name: "西中央線", classCode: "1" }] },
  { name: "西片山町", lat: 34.2538, lng: 132.5646, operator: "広電バス", routes: [{ name: "片山線", classCode: "1" }] },
  { name: "東片山町", lat: 34.2525, lng: 132.5661, operator: "広電バス", routes: [{ name: "片山線", classCode: "1" }] },
  { name: "子規句碑前", lat: 34.2358, lng: 132.5642, operator: "広電バス", routes: [{ name: "呉倉橋島線・音戸線", classCode: "1" }] },
  { name: "歴史の見える丘", lat: 34.2335, lng: 132.5648, operator: "広電バス", routes: [{ name: "呉倉橋島線・音戸線", classCode: "1" }] },
  { name: "入船山公園", lat: 34.2412, lng: 132.5635, operator: "広電バス", routes: [{ name: "宮原線・音戸線", classCode: "1" }] },
  { name: "眼鏡橋", lat: 34.2428, lng: 132.5625, operator: "広電バス", routes: [{ name: "宮原線", classCode: "1" }] },
];

// 建物属性`bldg:usage`にこの文字列を含む場合を住宅系とみなす
const RESIDENTIAL_USAGE_SUBSTRING = "住宅";

// 傾斜込みアクセシビリティスコアを計算する住宅系建物の上限数。
const MAX_SCORED_BUILDINGS = 80000;

const WALK_PROFILE_DEFAULT: WalkProfile = "general";
const NETWORK_THRESHOLD_MULTIPLIER_DEFAULT = 1.2;

const COVERAGE_RANKS: { maxRatio: number; legendLabel: string; color: Cesium.Color }[] = [
  { maxRatio: 1, legendLabel: "カバーされている", color: Cesium.Color.fromCssColorString("#22c55e") },
  { maxRatio: 1.5, legendLabel: "空白地（僅かに超過）", color: Cesium.Color.fromCssColorString("#fecaca") },
  { maxRatio: Infinity, legendLabel: "空白地（非常に遠い）", color: Cesium.Color.fromCssColorString("#7f1d1d") },
];

const NEWLY_COVERED_BUILDING_COLOR_HEX = "#38bdf8";
const NEWLY_COVERED_BUILDING_COLOR = Cesium.Color.fromCssColorString(NEWLY_COVERED_BUILDING_COLOR_HEX);
const CUSTOM_STOP_PIN_COLOR_HEX = "#0284c7";

function colorForCoverageRatio(ratio: number): Cesium.Color {
  const rank = COVERAGE_RANKS.find((r) => ratio <= r.maxRatio) ?? COVERAGE_RANKS[COVERAGE_RANKS.length - 1];
  return rank.color;
}

/**
 * PLATEAU 3D Tiles フィーチャーから住宅系建物の用途表示名を抽出する。
 * - 呉市（34202）等の標準データセットでは `bldg:usage` に「住宅」「共同住宅」等が入る。
 * - 広島市安佐南区（34105）のデータセットでは全建物の `bldg:usage` が「不明」となっており、
 *   都市計画基礎調査由来の `uro:BuildingDetailAttribute_uro:landUseType` に
 *   「住宅用地（住宅、共同住宅、店舗等併用住宅、店舗等併用共同住宅、作業所併用住宅）」が格納されているため、
 *   両方の属性を参照して住宅系建物を漏れなく判定する。
 */
function extractResidentialUsage(feature: Cesium.Cesium3DTileFeature): string | null {
  const usage = feature.getProperty("bldg:usage") as string | undefined;
  if (typeof usage === "string" && usage.includes(RESIDENTIAL_USAGE_SUBSTRING)) {
    return usage;
  }
  const landUse = feature.getProperty("uro:BuildingDetailAttribute_uro:landUseType") as string | undefined;
  if (typeof landUse === "string" && landUse.includes(RESIDENTIAL_USAGE_SUBSTRING)) {
    const bldgClass = feature.getProperty("bldg:class") as string | undefined;
    return typeof bldgClass === "string" && bldgClass.length > 0 && bldgClass !== "不明"
      ? `住宅（${bldgClass}）`
      : "住宅（住宅用地）";
  }
  const attrs = feature.getProperty("attributes") as Record<string, unknown> | undefined;
  if (attrs && typeof attrs === "object") {
    const attrUsage = attrs["bldg:usage"];
    if (typeof attrUsage === "string" && attrUsage.includes(RESIDENTIAL_USAGE_SUBSTRING)) {
      return attrUsage;
    }
  }
  return null;
}

type BuildingScoreInfo = {
  usage: string;
  lat: number;
  lng: number;
  nearestStopName: string;
  busStraightDistanceMeters: number;
  busEffectiveDistanceMeters: number;
  busWalkMinutes: number;
  nearestStationName: string;
  stationStraightDistanceMeters: number;
  stationEffectiveDistanceMeters: number;
  stationWalkMinutes: number;
  coverageRatio: number;
  isCovered: boolean;
  totalFloorArea: number | null;
  walkProfileLabel: string;
  customStopImprovement?: {
    stopId: number;
    stopLabel: string;
    afterBusEffectiveDistanceMeters: number;
    afterBusWalkMinutes: number;
    afterCoverageRatio: number;
    isNewlyCovered: boolean;
  };
  mobilityHubImprovement?: {
    hubId: number;
    hubName: string;
    hubAddress: string;
    hubDistanceMeters: number;
    modeLabel: string;
  };
};

// 2点間の傾斜込み実効距離を計算する共通ロジック。
// エリアごとの上り坂距離換算係数（uphillMultiplier）およびプロファイル別勾配ペナルティ係数（slopePenaltyFactor）を反映する。
type EffectiveDistancePair = { originLat: number; originLng: number; destLat: number; destLng: number };
type EffectiveDistanceResult = { straightDistanceMeters: number; effectiveDistanceMeters: number };

async function computeEffectiveDistances(
  terrainProvider: Cesium.TerrainProvider,
  pairs: EffectiveDistancePair[],
  slopePenaltyFactor: number,
  uphillMultiplier = SLOPE_UPHILL_DISTANCE_MULTIPLIER,
  downhillMultiplier = SLOPE_DOWNHILL_DISTANCE_MULTIPLIER,
  gradientCap = SLOPE_GRADIENT_CAP
): Promise<EffectiveDistanceResult[]> {
  const straightDistances = pairs.map((p) => haversineMeters(p.originLat, p.originLng, p.destLat, p.destLng));

  const allSamples: Cesium.Cartographic[] = [];
  const sampleRanges: [number, number][] = [];
  pairs.forEach((p) => {
    const start = allSamples.length;
    for (let s = 0; s < SLOPE_SAMPLE_COUNT; s++) {
      const t = s / (SLOPE_SAMPLE_COUNT - 1);
      const lng = p.originLng + (p.destLng - p.originLng) * t;
      const lat = p.originLat + (p.destLat - p.originLat) * t;
      allSamples.push(Cesium.Cartographic.fromDegrees(lng, lat));
    }
    sampleRanges.push([start, start + SLOPE_SAMPLE_COUNT]);
  });

  const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, allSamples);

  return pairs.map((_, idx) => {
    const straightDistanceMeters = straightDistances[idx];
    const [start, end] = sampleRanges[idx];
    const heights = sampled.slice(start, end).map((carto) => carto.height);
    if (heights.some((height) => !Number.isFinite(height))) {
      return { straightDistanceMeters, effectiveDistanceMeters: straightDistanceMeters };
    }
    const segmentDistance = straightDistanceMeters / (SLOPE_SAMPLE_COUNT - 1);
    let effectiveDistanceMeters = 0;
    for (let k = 0; k < heights.length - 1; k++) {
      const deltaH = heights[k + 1] - heights[k];
      effectiveDistanceMeters += computeSlopeSegmentEffectiveDistance(
        segmentDistance,
        deltaH,
        slopePenaltyFactor,
        uphillMultiplier,
        downhillMultiplier,
        gradientCap
      );
    }
    return { straightDistanceMeters, effectiveDistanceMeters };
  });
}

const DEMAND_TRANSIT_GAP_RATIO_THRESHOLD = 1.0;
const DEMAND_TRANSIT_CLUSTER_COUNT_DEFAULT = 4;
const DEMAND_TRANSIT_ANALYSIS_THRESHOLD_MULTIPLIER_DEFAULT = 1.2;
const DEMAND_TRANSIT_MIN_BUILDINGS = 8;
const DEMAND_TRANSIT_RECOMPUTE_DEBOUNCE_MS = 1500;
const DEMAND_TRANSIT_COLOR = "#a855f7";

type PlaceLabel = { name: string; lat: number; lng: number };

type ExistingDemandTransitStop = { name: string; lat: number; lng: number };
type ExistingDemandTransitService = {
  name: string;
  type: string;
  operator: string;
  startDate: string;
  description: string;
  sourceUrl: string;
  stops: ExistingDemandTransitStop[];
};
const EXISTING_DEMAND_TRANSIT_COLOR = Cesium.Color.fromCssColorString("#a855f7");

const HELLO_CYCLING_STATIONS_API_URL = "/api/hellocycling-stations";
type HelloCyclingStation = { id: string; name: string; lat: number; lng: number; capacity: number | null };
const HELLO_CYCLING_COLOR = "#facc15";

// 対象エリアが藤沢市北部（東西南北とも十数km程度）に限られるため、緯度経度を
// 単純な等距円筒図法でメートル相当のローカルXY座標に変換して使う（k-meansのユークリッド距離が
// 経度方向で不当に圧縮/伸長されるのを避けるため。全国精度は不要という他の判定と同じ方針）。
function createSquareIconDataUrl(fillColor: string, size = 28): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = fillColor;
  ctx.fillRect(3, 3, size - 6, size - 6);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  return canvas.toDataURL();
}

// 既存の乗合タクシー・オンデマンドバスの拠点ピンを、デマンド交通候補（紫の四角）・バス停（丸だが
// 小さい）と見た目で区別するため、円形のアイコンを生成する（四角=このPoCの提案、丸=市の既存実績、
// という視覚的な対比を意図している）。
function createCircleIconDataUrl(fillColor: string, size = 28): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const center = size / 2;
  const radius = size / 2 - 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  return canvas.toDataURL();
}

// ハローサイクリングのステーションピンを、バス停（丸）・既存デマンド交通（青丸）と見た目で
// 区別するため、黄色い円に自転車の絵文字を重ねたアイコンを生成する。
function createBicycleIconDataUrl(fillColor: string, size = 28): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const center = size / 2;
  const radius = size / 2 - 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `${Math.round(size * 0.6)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🚲", center, center + 1);
  return canvas.toDataURL();
}

// 自由配置した仮設停留所ピン（水色系の丸＋白い番号テキスト）をcanvasで生成する。
function createCustomStopPinIconDataUrl(
  labelNumber: number,
  fillColor = CUSTOM_STOP_PIN_COLOR_HEX,
  size = 30
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const center = size / 2;
  const radius = size / 2 - 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${labelNumber >= 10 ? 12 : 14}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(labelNumber), center, center + 1);
  return canvas.toDataURL();
}

// モビリティ・ハブ候補地ピン（アンバー/オレンジ系の丸＋白いH1〜H4テキスト）をcanvasで生成する。
const MOBILITY_HUB_PIN_COLOR_HEX = "#f59e0b";
function createMobilityHubPinIconDataUrl(
  hubId: number,
  fillColor = MOBILITY_HUB_PIN_COLOR_HEX,
  size = 32
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const center = size / 2;
  const radius = size / 2 - 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`H${hubId}`, center, center + 1);
  return canvas.toDataURL();
}

// 画面上のクリック位置から地形表面（未ロード時は楕円体表面）の緯度経度を取得する。
// viewer.scene.pickPositionは3D Tilesの建物屋根を拾ったり深度設定で空振りすることがあるため、
// camera.getPickRay + globe.pick を優先し、フォールバックに pickEllipsoid を使う。
function pickGroundLatLng(
  viewer: Cesium.Viewer,
  windowPosition: Cesium.Cartesian2
): { lat: number; lng: number } | null {
  const ray = viewer.camera.getPickRay(windowPosition);
  let cartesian: Cesium.Cartesian3 | undefined;
  if (ray) {
    cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  }
  if (!cartesian) {
    cartesian = viewer.camera.pickEllipsoid(windowPosition, viewer.scene.globe.ellipsoid);
  }
  if (!cartesian) return null;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lng: Cesium.Math.toDegrees(carto.longitude),
  };
}

type PopupInfo = { title: string; lines: ReactNode[] };

// Cesium標準のinfoBox/selectionIndicatorは無効化している（下記Viewer初期化オプション参照）ため、
// バス停クリック時の情報表示はこの自前ポップアップで行う。
function InfoPopup({ info, onClose }: { info: PopupInfo; onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 15,
        background: "rgba(20, 20, 20, 0.9)",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 6,
        fontSize: 13,
        lineHeight: 1.6,
        fontFamily: "sans-serif",
        maxWidth: 320,
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: "bold" }}>{info.title}</div>
        <button
          onClick={onClose}
          aria-label="閉じる"
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      {info.lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

// 将来的に自動抽出の乗り場候補ピン（紫）・全域比較グラフ・ハローサイクリング表示・
// モビリティ・ハブ検討UIを復活させる場合の表示切り替えフラグ（内部ロジックはそのまま保持）。
const SHOW_AUTO_CANDIDATE_AND_COMPARISON_UI = false;
const SHOW_HELLO_CYCLING_UI = false;
const SHOW_MOBILITY_HUB_UI = false;

function Legend({
  selectedAreaId,
  onAreaChange,
  areaDataStatusNote,
  clusterCount,
  analysisThresholdMultiplier,
  showHelloCycling,
  walkProfile,
  distanceModel,
  loadingNetworkScores,
  networkThresholdMultiplier,
  showExperimentalDistanceModel,
  onClusterCountChange,
  onAnalysisThresholdMultiplierChange,
  onShowHelloCyclingChange,
  onWalkProfileChange,
  onDistanceModelChange,
  onNetworkThresholdMultiplierChange,
  onToggleExperimentalDistanceModel,
  isDemandTransitAnalysisRunning,
  isDemandTransitPanelVisible,
  onShowDemandTransitPanel,
  isAddingCustomStop,
  customStopCount,
  customStopNewlyCoveredCount,
  isMobilityHubActive,
  onToggleMobilityHubActive,
  mobilityHubRescuedCount,
  mobilityHubRescuedArea,
  isCollapsed,
  onToggleCollapsed,
  onToggleAddingCustomStop,
  onClearCustomStops,
}: {
  selectedAreaId: AreaId;
  onAreaChange: (areaId: AreaId) => void;
  areaDataStatusNote?: string | null;
  clusterCount: number;
  analysisThresholdMultiplier: number;
  showHelloCycling: boolean;
  walkProfile: WalkProfile;
  distanceModel: DistanceModel;
  loadingNetworkScores: boolean;
  networkThresholdMultiplier: number;
  showExperimentalDistanceModel: boolean;
  onClusterCountChange: (value: number) => void;
  onAnalysisThresholdMultiplierChange: (value: number) => void;
  onShowHelloCyclingChange: (value: boolean) => void;
  onWalkProfileChange: (value: WalkProfile) => void;
  onDistanceModelChange: (value: DistanceModel) => void;
  onNetworkThresholdMultiplierChange: (value: number) => void;
  onToggleExperimentalDistanceModel: (value: boolean) => void;
  isDemandTransitAnalysisRunning: boolean;
  isDemandTransitPanelVisible: boolean;
  onShowDemandTransitPanel: () => void;
  isAddingCustomStop: boolean;
  customStopCount: number;
  customStopNewlyCoveredCount: number;
  isMobilityHubActive: boolean;
  onToggleMobilityHubActive: () => void;
  mobilityHubRescuedCount?: number;
  mobilityHubRescuedArea?: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleAddingCustomStop: () => void;
  onClearCustomStops: () => void;
}) {
  const [experimentalHeaderHovered, setExperimentalHeaderHovered] = useState(false);
  const [showSlopeCalculationModal, setShowSlopeCalculationModal] = useState(false);
  const areaConfig = getAreaConfig(selectedAreaId);
  const areaWalkProfiles = areaConfig.slopeParams.walkProfiles;
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        top: 12,
        zIndex: 10,
        background: "rgba(20, 20, 20, 0.78)",
        color: "#fff",
        padding: "10px 12px",
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.5,
        fontFamily: "sans-serif",
        pointerEvents: "auto",
        maxWidth: 328,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div
          onClick={onToggleCollapsed}
          style={{ cursor: "pointer", flex: 1, userSelect: "none" }}
        >
          <div style={{ fontWeight: "bold", fontSize: 13 }}>{areaConfig.titleLabel}</div>
          {isCollapsed && (
            <div
              style={{
                fontSize: 11,
                color: isAddingCustomStop || customStopCount > 0 ? "#38bdf8" : "#94a3b8",
                marginTop: 2,
              }}
            >
              {isAddingCustomStop
                ? "📍 停留所配置中（凡例・設定を展開）"
                : customStopCount > 0
                ? "📊 シミュレーション結果表示中（凡例・設定を展開）"
                : "クリックまたは右のボタンで凡例と設定を展開"}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={isCollapsed ? "凡例パネルを展開" : "凡例パネルを折りたたむ"}
          title={isCollapsed ? "展開する" : "折りたたむ"}
          onClick={onToggleCollapsed}
          style={{
            border: "1px solid rgba(148, 163, 184, 0.4)",
            borderRadius: 4,
            background: "rgba(255, 255, 255, 0.08)",
            color: "#cbd5e1",
            fontSize: 11,
            lineHeight: 1,
            cursor: "pointer",
            padding: "4px 6px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {isCollapsed ? "▼ 展開" : "▲ 縮小"}
        </button>
      </div>
      {/* 対象エリア切り替えセレクター（折りたたみ状態でも常時切り替え可能） */}
      <div
        style={{
          marginBottom: isCollapsed ? 0 : 6,
          padding: "5px 7px",
          borderRadius: 5,
          background: "rgba(15, 23, 42, 0.65)",
          border: "1px solid rgba(56, 189, 248, 0.4)",
        }}
      >
        <label
          htmlFor="target-area-selector"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            fontSize: 11,
            color: "#bae6fd",
            fontWeight: "bold",
            marginBottom: 3,
          }}
        >
          <span>対象エリア切り替え</span>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: "normal" }}>
            {areaConfig.cityCode}
          </span>
        </label>
        <select
          id="target-area-selector"
          aria-label="対象エリア切り替え"
          value={selectedAreaId}
          onChange={(e) => onAreaChange(e.target.value as AreaId)}
          style={{
            width: "100%",
            padding: "5px 8px",
            fontSize: 12,
            fontWeight: "bold",
            borderRadius: 4,
            border: "1px solid rgba(125, 211, 252, 0.55)",
            background: "rgba(30, 41, 59, 0.95)",
            color: "#f8fafc",
            cursor: "pointer",
          }}
        >
          {AREA_LIST.map((area) => (
            <option key={area.id} value={area.id}>
              {area.selectorLabel}
            </option>
          ))}
        </select>
        {areaDataStatusNote && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10.5,
              color: "#fde68a",
              lineHeight: 1.35,
            }}
          >
            {areaDataStatusNote}
          </div>
        )}
      </div>
      {!isCollapsed && (
        <>
          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
            対象地域：{areaConfig.detailName}（周辺メッシュ：{areaConfig.meshCodes.join("・")}）。{areaConfig.descriptionText}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: "#7dd3fc",
              background: "rgba(2, 132, 199, 0.18)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: 4,
              padding: "3px 6px",
              marginBottom: 5,
            }}
          >
            エリア傾斜パラメータ：{areaConfig.slopeParams.slopeNote}
          </div>
      {COVERAGE_RANKS.map((rank) => (
        <div key={rank.legendLabel} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              background: rank.color.toCssColorString(),
              border: "1px solid rgba(255,255,255,0.6)",
              flexShrink: 0,
            }}
          />
          <span>{rank.legendLabel}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            background: NEWLY_COVERED_BUILDING_COLOR_HEX,
            border: "1px solid rgba(255,255,255,0.6)",
            flexShrink: 0,
          }}
        />
        <span>新規カバー（自由配置した停留所で解消）</span>
      </div>
      {isMobilityHubActive && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              background: MOBILITY_HUB_PIN_COLOR_HEX,
              border: "1px solid rgba(255,255,255,0.6)",
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#fbbf24", fontWeight: "bold" }}>
            モビリティ・ハブ救済（オレンジ）
          </span>
        </div>
      )}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ opacity: 0.85 }}>勾配・歩行速度のプロファイル:</span>
          <button
            type="button"
            onClick={() => setShowSlopeCalculationModal(true)}
            style={{
              background: "rgba(56, 189, 248, 0.18)",
              border: "1px solid rgba(56, 189, 248, 0.45)",
              color: "#38bdf8",
              borderRadius: 4,
              fontSize: 10.5,
              padding: "1px 6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 3,
              lineHeight: 1.4,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.18)")}
            title="勾配ペナルティ係数と上り坂割増の計算根拠を見る"
          >
            <span style={{ fontSize: 11 }}>ℹ️</span>
            <span>計算のしくみ</span>
          </button>
        </div>
        {(Object.keys(areaWalkProfiles) as WalkProfile[]).map((key) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="walkProfile"
              checked={walkProfile === key}
              onChange={() => onWalkProfileChange(key)}
            />
            <span>{areaWalkProfiles[key].label}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 4 }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onToggleExperimentalDistanceModel(!showExperimentalDistanceModel)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggleExperimentalDistanceModel(!showExperimentalDistanceModel);
          }}
          onMouseEnter={() => setExperimentalHeaderHovered(true)}
          onMouseLeave={() => setExperimentalHeaderHovered(false)}
          style={{
            marginBottom: 2,
            marginLeft: -4,
            marginRight: -4,
            padding: "3px 4px",
            borderRadius: 4,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            userSelect: "none",
            background: experimentalHeaderHovered ? "rgba(255,255,255,0.14)" : "transparent",
            transition: "background 0.1s ease",
          }}
        >
          <span style={{ fontSize: 13, color: "#6ecbf5", fontWeight: "bold", lineHeight: 1 }}>
            {showExperimentalDistanceModel ? "▼" : "▶"}
          </span>
          <span style={{ opacity: 0.9 }}>距離モデル（直線／道路網・クリックで詳細）</span>
        </div>
        {showExperimentalDistanceModel && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                name="distanceModel"
                checked={distanceModel === "straight"}
                disabled={loadingNetworkScores}
                onChange={() => onDistanceModelChange("straight")}
              />
              <span>直線距離（既定の判定基準）</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                name="distanceModel"
                checked={distanceModel === "network"}
                disabled={loadingNetworkScores}
                onChange={() => onDistanceModelChange("network")}
              />
              <span>道路網距離{loadingNetworkScores ? "（読み込み中…）" : ""}</span>
            </label>
            <div
              style={{
                fontSize: 10.5,
                opacity: 0.75,
                marginTop: 4,
                padding: "4px 6px",
                background: "rgba(255,255,255,0.08)",
                borderRadius: 4,
              }}
            >
              「道路網距離」に切り替えると、実際の歩行道路に沿った迂回距離で再評価でき、直線距離では圏内と判定されていた建物のうち、実態として交通空白地に該当するエリアを確認できます。
            </div>
            <div style={{ marginTop: 6, opacity: distanceModel === "network" ? 1 : 0.5 }}>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>道路網距離モデルの判定基準の緩和倍率: {networkThresholdMultiplier.toFixed(1)}倍</span>
              </label>
              <input
                type="range"
                min={1}
                max={1.5}
                step={0.1}
                value={networkThresholdMultiplier}
                disabled={distanceModel !== "network"}
                onChange={(e) => onNetworkThresholdMultiplierChange(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 2 }}>
                道路網距離は直線距離より系統的に長くなるため、バス停400m・鉄道駅800mの参考基準にこの倍率をかけて判定を緩和できます（直線距離モデルは400m／800mの閾値で固定）。
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.3)", margin: "8px 0 6px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: STATION_PIN_COLOR.toCssColorString(),
            border: "1.5px solid #ffffff",
            flexShrink: 0,
          }}
        />
        <span>{areaConfig.stationLegendLabel}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: BUS_STOP_COLOR.toCssColorString(),
            border: "1px solid rgba(255,255,255,0.6)",
            flexShrink: 0,
          }}
        />
        <span>{areaConfig.majorBusLegendLabel}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: BUS_STOP_COLOR_MINOR.toCssColorString(),
            border: "1px solid rgba(255,255,255,0.6)",
            flexShrink: 0,
          }}
        />
        <span>バス停（その他事業者・コミュニティバス。参考表示のみ）</span>
      </div>
      {SHOW_AUTO_CANDIDATE_AND_COMPARISON_UI && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              background: DEMAND_TRANSIT_COLOR,
              border: "1px solid rgba(255,255,255,0.6)",
              flexShrink: 0,
            }}
          />
          <span>デマンド交通 乗り場候補（本PoCの提案）</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: EXISTING_DEMAND_TRANSIT_COLOR.toCssColorString(),
            border: "1px solid rgba(255,255,255,0.6)",
            flexShrink: 0,
          }}
        />
        <span>地域交通・乗合タクシー等（既存運行）</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: CUSTOM_STOP_PIN_COLOR_HEX,
            border: "1.5px solid #ffffff",
            flexShrink: 0,
          }}
        />
        <span>仮設停留所（地図クリックで自由配置）</span>
      </div>
      {SHOW_HELLO_CYCLING_UI && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: HELLO_CYCLING_COLOR,
              border: "1px solid rgba(255,255,255,0.6)",
              flexShrink: 0,
            }}
          />
          <span>ハローサイクリング ステーション</span>
        </div>
      )}
      <div
        style={{
          marginTop: 10,
          padding: "9px 10px",
          borderRadius: 6,
          background: isAddingCustomStop
            ? "linear-gradient(180deg, rgba(14, 165, 233, 0.28) 0%, rgba(2, 132, 199, 0.2) 100%)"
            : "linear-gradient(180deg, rgba(56, 189, 248, 0.16) 0%, rgba(15, 23, 42, 0.5) 100%)",
          border: isAddingCustomStop
            ? "2px solid #38bdf8"
            : "1.5px solid #0284c7",
          boxShadow: isAddingCustomStop
            ? "0 0 12px rgba(56, 189, 248, 0.45)"
            : "0 2px 8px rgba(2, 132, 199, 0.25)",
        }}
      >
        <div style={{ fontWeight: "bold", color: "#38bdf8", fontSize: 12.5, letterSpacing: "0.02em" }}>
          エリア対策シミュレーション（自由配置）
        </div>
        <div style={{ fontSize: 10.5, color: "#cbd5e1", marginTop: 3 }}>
          対策したい空白地エリアの任意の場所に停留所を複数置いて、カバー建物の変化を確認できます。
        </div>
        <button
          type="button"
          onClick={onToggleAddingCustomStop}
          style={{
            width: "100%",
            marginTop: 7,
            padding: "7px 8px",
            border: isAddingCustomStop ? "1.5px solid #bae6fd" : "1px solid #38bdf8",
            borderRadius: 4,
            background: isAddingCustomStop
              ? "linear-gradient(180deg, #0284c7 0%, #0369a1 100%)"
              : "linear-gradient(180deg, rgba(2, 132, 199, 0.7) 0%, rgba(3, 105, 161, 0.7) 100%)",
            color: "#fff",
            fontWeight: "bold",
            fontSize: 12,
            cursor: "pointer",
            boxShadow: isAddingCustomStop ? "0 0 8px rgba(56, 189, 248, 0.6)" : "none",
          }}
        >
          {isAddingCustomStop ? "📍 追加モード中（クリックで配置 / 終了）" : "＋ 地図クリックで停留所を追加"}
        </button>
        {customStopCount > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <span>
              配置中: <b>{customStopCount}箇所</b>（新規カバー <b style={{ color: "#38bdf8" }}>+{customStopNewlyCoveredCount}棟</b>）
            </span>
            <button
              type="button"
              onClick={onClearCustomStops}
              style={{
                padding: "2px 7px",
                fontSize: 10.5,
                borderRadius: 3,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              クリア
            </button>
          </div>
        )}
        <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(125, 211, 252, 0.28)" }}>
          <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
            <span>
              カバー判定の実効距離基準:{" "}
              {distanceModel === "network"
                ? `${networkThresholdMultiplier.toFixed(1)}倍（道路網基準と連動・バス${Math.round(BUS_COVERAGE_THRESHOLD_METERS * networkThresholdMultiplier)}m圏）`
                : `${analysisThresholdMultiplier.toFixed(1)}倍（バス${Math.round(BUS_COVERAGE_THRESHOLD_METERS * analysisThresholdMultiplier)}m圏）`}
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={1.5}
            step={0.1}
            value={distanceModel === "network" ? networkThresholdMultiplier : analysisThresholdMultiplier}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (distanceModel === "network") {
                onNetworkThresholdMultiplierChange(val);
              } else {
                onAnalysisThresholdMultiplierChange(val);
              }
            }}
            style={{ width: "100%", marginTop: 2 }}
          />
          <div style={{ fontSize: 10.5, opacity: 0.82, marginTop: 2 }}>
            {distanceModel === "network"
              ? "道路網距離モデル選択中は、道路網の判定緩和倍率と自動で同期します。"
              : "傾斜補正込みで400m圏は厳しい場合などに緩和できます。変更すると水色のカバー範囲が即座に更新されます。"}
          </div>
        </div>
      </div>
      {SHOW_MOBILITY_HUB_UI && (
        <div
          style={{
            marginTop: 10,
            padding: "9px 10px",
            borderRadius: 6,
            background: isMobilityHubActive
              ? "linear-gradient(180deg, rgba(245, 158, 11, 0.28) 0%, rgba(217, 119, 6, 0.2) 100%)"
              : "linear-gradient(180deg, rgba(245, 158, 11, 0.16) 0%, rgba(15, 23, 42, 0.5) 100%)",
            border: isMobilityHubActive
              ? "2px solid #f59e0b"
              : "1.5px solid #d97706",
            boxShadow: isMobilityHubActive
              ? "0 0 12px rgba(245, 158, 11, 0.45)"
              : "0 2px 8px rgba(217, 119, 6, 0.25)",
          }}
        >
          <div style={{ fontWeight: "bold", color: "#fbbf24", fontSize: 12.5, letterSpacing: "0.02em" }}>
            🚲 モビリティ・ハブ検討（毘沙門台候補地）
          </div>
          <div style={{ fontSize: 10.5, color: "#cbd5e1", marginTop: 3 }}>
            広島市安佐南区 毘沙門台エリアの候補地4箇所（毘沙門台駅〜団地1〜4丁目）にシェアサイクル等を導入した場合の救済効果を試算します。
          </div>
          <button
            type="button"
            onClick={onToggleMobilityHubActive}
            style={{
              width: "100%",
              marginTop: 7,
              padding: "7px 8px",
              border: isMobilityHubActive ? "1.5px solid #fef3c7" : "1px solid #f59e0b",
              borderRadius: 4,
              background: isMobilityHubActive
                ? "linear-gradient(180deg, #d97706 0%, #b45309 100%)"
                : "linear-gradient(180deg, rgba(217, 119, 6, 0.7) 0%, rgba(180, 83, 9, 0.7) 100%)",
              color: "#fff",
              fontWeight: "bold",
              fontSize: 12,
              cursor: "pointer",
              boxShadow: isMobilityHubActive ? "0 0 8px rgba(245, 158, 11, 0.6)" : "none",
            }}
          >
            {isMobilityHubActive ? "🚲 ハブ検討中（パネルを表示中）" : "🚲 モビリティ・ハブ検討を開始"}
          </button>
          {isMobilityHubActive && mobilityHubRescuedCount != null && mobilityHubRescuedCount > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#fef3c7" }}>
              救済効果: <b style={{ color: "#fbbf24" }}>+{mobilityHubRescuedCount.toLocaleString()}棟</b>
              {mobilityHubRescuedArea != null && mobilityHubRescuedArea > 0 && (
                <span>（延床 約{Math.round(mobilityHubRescuedArea).toLocaleString()}m²）</span>
              )}
            </div>
          )}
        </div>
      )}
      {SHOW_AUTO_CANDIDATE_AND_COMPARISON_UI && (
        <>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>乗り場候補の数: {clusterCount}箇所</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={clusterCount}
              onChange={(e) => onClusterCountChange(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginTop: 7, color: isDemandTransitAnalysisRunning ? "#d8b4fe" : "rgba(255,255,255,0.7)", fontSize: 11 }}>
            {isDemandTransitAnalysisRunning ? "比較条件を反映中…" : "この倍率を変えると、比較グラフや自由配置の水色カバーが自動で更新されます。"}
          </div>
          {!isDemandTransitPanelVisible && (
            <button
              type="button"
              onClick={onShowDemandTransitPanel}
              disabled={isDemandTransitAnalysisRunning}
              style={{
                width: "100%", marginTop: 6, padding: "5px 8px", border: "1px solid rgba(216,180,254,0.8)",
                borderRadius: 4, background: isDemandTransitAnalysisRunning ? "rgba(126,34,206,0.25)" : "rgba(126,34,206,0.42)",
                color: "#fff", fontSize: 11,
                cursor: isDemandTransitAnalysisRunning ? "wait" : "pointer",
              }}
            >
              {isDemandTransitAnalysisRunning ? "比較データを計算中…" : "比較グラフを表示"}
            </button>
          )}
        </>
      )}
      {SHOW_HELLO_CYCLING_UI && (
        <div style={{ marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showHelloCycling}
              onChange={(e) => onShowHelloCyclingChange(e.target.checked)}
            />
            <span>ハローサイクリング ステーションを表示</span>
          </label>
        </div>
      )}
        </>
      )}
      <SlopeCalculationModal
        isOpen={showSlopeCalculationModal}
        onClose={() => setShowSlopeCalculationModal(false)}
        selectedAreaId={selectedAreaId}
      />
    </div>
  );
}

// 自由配置した仮設停留所のシミュレーション結果・個別操作パネル（画面右上に表示）。
function CustomStopSimulationPanel({
  isVisible,
  isAddingCustomStop,
  isEvaluating,
  summary,
  analysisThresholdMultiplier,
  onToggleAddingCustomStop,
  onClearStops,
  onRemoveStop,
  onFlyToStop,
  onExportGeoJson,
  onClose,
}: {
  isVisible: boolean;
  isAddingCustomStop: boolean;
  isEvaluating: boolean;
  summary: CustomStopSimulationSummary | null;
  analysisThresholdMultiplier: number;
  onToggleAddingCustomStop: () => void;
  onClearStops: () => void;
  onRemoveStop: (id: number) => void;
  onFlyToStop: (id: number) => void;
  onExportGeoJson?: () => void;
  onClose: () => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  if (!isVisible) return null;
  const stopCount = summary?.stopCount ?? 0;
  const newlyCovered = summary?.newlyCoveredBuildings ?? 0;
  const newlyCoveredArea = summary?.newlyCoveredFloorArea ?? 0;
  const severeReduction =
    summary != null ? summary.severeGapBeforeBuildings - summary.severeGapAfterBuildings : 0;
  const busThreshold = Math.round(BUS_COVERAGE_THRESHOLD_METERS * analysisThresholdMultiplier);

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        zIndex: 14,
        width: "min(360px, calc(100vw - 24px))",
        maxHeight: "calc(100vh - 110px)",
        overflowY: "auto",
        boxSizing: "border-box",
        background: "rgba(15, 23, 42, 0.92)",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 12.5,
        lineHeight: 1.5,
        fontFamily: "sans-serif",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)",
        border: isAddingCustomStop
          ? "1.5px solid #38bdf8"
          : "1px solid rgba(56, 189, 248, 0.4)",
        pointerEvents: "auto",
      }}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div
          onClick={() => setIsCollapsed((prev) => !prev)}
          style={{ cursor: "pointer", flex: 1, userSelect: "none" }}
        >
          <div style={{ color: "#38bdf8", fontWeight: "bold", fontSize: 14 }}>
            停留所の自由配置シミュレーション
          </div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 1 }}>
            バス停基準: 実効距離{busThreshold}m圏（基準{analysisThresholdMultiplier.toFixed(1)}倍・傾斜補正込み）
          </div>
          {isCollapsed && (
            <div style={{ fontSize: 11.5, color: "#e2e8f0", marginTop: 4 }}>
              配置中: <b>{stopCount}箇所</b> ／ 新規カバー:{" "}
              <b style={{ color: "#38bdf8" }}>+{newlyCovered.toLocaleString()}棟</b>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <button
            type="button"
            aria-label={isCollapsed ? "パネルを展開" : "パネルを折りたたむ"}
            title={isCollapsed ? "展開する" : "折りたたむ"}
            onClick={() => setIsCollapsed((prev) => !prev)}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.4)",
              borderRadius: 4,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
              padding: "4px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {isCollapsed ? "▼ 展開" : "▲ 縮小"}
          </button>
          <button
            type="button"
            aria-label="シミュレーションを終了して閉じる"
            title="シミュレーションを終了して閉じる"
            onClick={onClose}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.4)",
              borderRadius: 4,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
              padding: "4px 6px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              type="button"
              onClick={onToggleAddingCustomStop}
              style={{
                flex: 1,
                padding: "7px 10px",
                borderRadius: 5,
                border: isAddingCustomStop ? "1px solid #bae6fd" : "1px solid rgba(56, 189, 248, 0.7)",
                background: isAddingCustomStop ? "#0284c7" : "rgba(2, 132, 199, 0.35)",
                color: "#fff",
                fontWeight: "bold",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {isAddingCustomStop ? "📍 ピン配置モード中（配置を完了する）" : "＋ 地図クリックで停留所を追加"}
            </button>
          </div>

          {isAddingCustomStop && (
            <div
              style={{
                marginTop: 8,
                padding: "6px 8px",
                borderRadius: 4,
                background: "rgba(56, 189, 248, 0.16)",
                border: "1px dashed rgba(125, 211, 252, 0.6)",
                color: "#e0f2fe",
                fontSize: 11.5,
              }}
            >
              地図上の設置したい場所（道路沿いや赤い空白地の中）をクリックすると、停留所ピン（#1, #2…）が追加され、新たにカバーされる建物が<b style={{ color: "#38bdf8" }}>水色</b>に変わります。配置が終わったら上のボタンで完了してください。
            </div>
          )}

          {isEvaluating && (
            <div style={{ marginTop: 8, color: "#7dd3fc", fontSize: 11.5 }}>
              周辺の地形傾斜とカバー建物を計算中…
            </div>
          )}

          {stopCount === 0 ? (
            <div style={{ marginTop: 10, color: "#94a3b8", fontSize: 12 }}>
              まだ仮設停留所が配置されていません。地図上をクリックすると、何棟の建物がカバー圏内に入るか即座に試算できます。
            </div>
          ) : (
            <>
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "rgba(2, 132, 199, 0.18)",
                  border: "1px solid rgba(56, 189, 248, 0.5)",
                }}
              >
                <div style={{ fontSize: 11.5, color: "#bae6fd" }}>
                  追加した停留所（{stopCount}箇所）の合算効果
                </div>
                <div style={{ marginTop: 2, fontSize: 22, fontWeight: "bold", color: "#38bdf8" }}>
                  +{newlyCovered.toLocaleString()}棟{" "}
                  <span style={{ fontSize: 13, fontWeight: "normal", color: "#e2e8f0" }}>
                    が新規カバー（水色）
                  </span>
                </div>
                {newlyCoveredArea > 0 && (
                  <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>
                    新規カバー建物の延床面積合計: 約{Math.round(newlyCoveredArea).toLocaleString()}m²
                  </div>
                )}
                {summary && (
                  <div style={{ marginTop: 6, fontSize: 12, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 6 }}>
                    <div>
                      交通空白地（全体）: {summary.totalGapBuildingsBefore.toLocaleString()}棟 →{" "}
                      <b>{summary.remainingGapBuildings.toLocaleString()}棟</b>
                    </div>
                    <div>
                      非常に遠い空白地（濃い赤）: {summary.severeGapBeforeBuildings.toLocaleString()}棟 →{" "}
                      <b>{summary.severeGapAfterBuildings.toLocaleString()}棟</b>
                      {severeReduction > 0 && (
                        <span style={{ color: "#86efac", fontWeight: "bold" }}>
                          （-{severeReduction.toLocaleString()}棟）
                        </span>
                      )}
                    </div>
                    {summary.averageImprovedBusBeforeMeters != null &&
                      summary.averageImprovedBusAfterMeters != null && (
                        <div style={{ marginTop: 2 }}>
                          周辺改善建物（{summary.improvedGapBuildingsCount}棟）の平均バス実効距離: 約
                          {Math.round(summary.averageImprovedBusBeforeMeters)}m →{" "}
                          <b style={{ color: "#7dd3fc" }}>
                            約{Math.round(summary.averageImprovedBusAfterMeters)}m
                          </b>
                        </div>
                      )}
                  </div>
                )}
                {onExportGeoJson && (
                  <button
                    type="button"
                    onClick={onExportGeoJson}
                    title="配置した仮設停留所と新規カバー建物をGeoJSON形式でダウンロードします（QGIS等で開けます）"
                    style={{
                      marginTop: 8,
                      width: "100%",
                      padding: "6px 10px",
                      fontSize: 11.5,
                      fontWeight: "bold",
                      borderRadius: 4,
                      border: "1px solid rgba(56, 189, 248, 0.6)",
                      background: "rgba(2, 132, 199, 0.35)",
                      color: "#e0f2fe",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span>📥</span>
                    <span>シミュレーション結果を出力 (GeoJSON)</span>
                  </button>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: "bold", fontSize: 12, color: "#e2e8f0" }}>
                    配置した停留所一覧（{stopCount}箇所）
                  </span>
                  <button
                    type="button"
                    onClick={onClearStops}
                    style={{
                      padding: "3px 8px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: "1px solid rgba(248,113,113,0.5)",
                      background: "rgba(127,29,29,0.4)",
                      color: "#fecaca",
                      cursor: "pointer",
                    }}
                  >
                    すべてクリア
                  </button>
                </div>
                <div style={{ display: "grid", gap: 5 }}>
                  {summary?.perStopStats.map((stat) => (
                    <div
                      key={stat.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        padding: "5px 8px",
                        borderRadius: 5,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        fontSize: 11.5,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: "bold", color: "#38bdf8" }}>{stat.label}</span>
                        <span style={{ marginLeft: 6, color: "#e2e8f0" }}>
                          単独カバー: <b>{stat.standaloneCoveredBuildings}棟</b>
                        </span>
                        {stopCount > 1 && (
                          <span style={{ marginLeft: 4, color: "#94a3b8", fontSize: 10.5 }}>
                            （最寄り貢献 {stat.primaryCoveredBuildings}棟）
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => onFlyToStop(stat.id)}
                          style={{
                            padding: "2px 6px",
                            fontSize: 10.5,
                            borderRadius: 3,
                            border: "1px solid rgba(125,211,252,0.45)",
                            background: "rgba(2,132,199,0.28)",
                            color: "#e0f2fe",
                            cursor: "pointer",
                          }}
                        >
                          移動
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveStop(stat.id)}
                          aria-label={`${stat.label}を削除`}
                          style={{
                            padding: "2px 6px",
                            fontSize: 10.5,
                            borderRadius: 3,
                            border: "1px solid rgba(255,255,255,0.25)",
                            background: "rgba(255,255,255,0.08)",
                            color: "#cbd5e1",
                            cursor: "pointer",
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// モビリティ・ハブ実証検討シミュレーション用パネル（画面右上に表示）。
function MobilityHubSimulationPanel({
  isVisible,
  selectedMode,
  minMeters,
  maxMeters,
  activeHubIds,
  hubModes,
  summary,
  onSelectMode,
  onChangeMinMeters,
  onChangeMaxMeters,
  onToggleHub,
  onUpdateHubMode,
  onFlyToHub,
  onExportGeoJson,
  onClose,
}: {
  isVisible: boolean;
  selectedMode: MobilityHubMode;
  minMeters: number;
  maxMeters: number;
  activeHubIds: number[];
  hubModes: Record<number, MobilityHubMode>;
  summary: MobilityHubSimulationSummary | null;
  onSelectMode: (mode: MobilityHubMode) => void;
  onChangeMinMeters: (val: number) => void;
  onChangeMaxMeters: (val: number) => void;
  onToggleHub: (hubId: number) => void;
  onUpdateHubMode: (hubId: number, mode: MobilityHubMode) => void;
  onFlyToHub: (hubId: number) => void;
  onExportGeoJson?: () => void;
  onClose: () => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  if (!isVisible) return null;

  const rescuedCount = summary?.newlyCoveredBuildings ?? 0;
  const rescuedArea = summary?.newlyCoveredFloorArea ?? 0;
  const severeReduction = summary != null ? summary.severeGapCoveredBuildings : 0;

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        zIndex: 14,
        width: "min(390px, calc(100vw - 24px))",
        maxHeight: "calc(100vh - 110px)",
        overflowY: "auto",
        boxSizing: "border-box",
        background: "rgba(15, 23, 42, 0.94)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 12.5,
        lineHeight: 1.5,
        fontFamily: "sans-serif",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)",
        border: "1.5px solid #f59e0b",
        pointerEvents: "auto",
      }}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div
          onClick={() => setIsCollapsed((prev) => !prev)}
          style={{ cursor: "pointer", flex: 1, userSelect: "none" }}
        >
          <div style={{ color: "#fbbf24", fontWeight: "bold", fontSize: 13.5, whiteSpace: "nowrap" }}>
            モビリティ・ハブ検討シミュレーション
          </div>
          <div style={{ fontSize: 11, color: "#fcd34d", marginTop: 1, fontWeight: "500" }}>
            ※広島市安佐南区 毘沙門台エリア 検討候補地4箇所
          </div>
          {isCollapsed && (
            <div style={{ fontSize: 11.5, color: "#e2e8f0", marginTop: 4 }}>
              有効ハブ: <b>{activeHubIds.length}箇所</b> ／ 救済:{" "}
              <b style={{ color: "#fbbf24" }}>+{rescuedCount.toLocaleString()}棟</b>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <button
            type="button"
            aria-label={isCollapsed ? "パネルを展開" : "パネルを折りたたむ"}
            title={isCollapsed ? "展開する" : "折りたたむ"}
            onClick={() => setIsCollapsed((prev) => !prev)}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.4)",
              borderRadius: 4,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
              padding: "4px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {isCollapsed ? "▼ 展開" : "▲ 縮小"}
          </button>
          <button
            type="button"
            aria-label="ハブ検討モードを終了して閉じる"
            title="ハブ検討モードを終了して閉じる"
            onClick={onClose}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.4)",
              borderRadius: 4,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
              padding: "4px 6px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* モード選択プリセット */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 4, fontWeight: "bold" }}>
              交通モード・一括選択（全ハブに適用）:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {MOBILITY_HUB_MODES.map((modeDef) => {
                const isSelected = selectedMode === modeDef.id;
                return (
                  <button
                    key={modeDef.id}
                    type="button"
                    onClick={() => onSelectMode(modeDef.id)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 5,
                      border: isSelected ? "1.5px solid #fbbf24" : "1px solid rgba(255, 255, 255, 0.15)",
                      background: isSelected
                        ? "linear-gradient(180deg, rgba(245, 158, 11, 0.35) 0%, rgba(217, 119, 6, 0.35) 100%)"
                        : "rgba(255, 255, 255, 0.06)",
                      color: isSelected ? "#fef3c7" : "#e2e8f0",
                      fontWeight: isSelected ? "bold" : "normal",
                      fontSize: 11.5,
                      cursor: "pointer",
                      textAlign: "left",
                      lineHeight: 1.3,
                    }}
                  >
                    <div>{modeDef.label}</div>
                    <div style={{ fontSize: 10, color: isSelected ? "#fcd34d" : "#94a3b8" }}>
                      {modeDef.id === "custom"
                        ? "任意の距離帯"
                        : `${modeDef.minMeters}m〜${
                            modeDef.maxMeters >= 1000
                              ? `${modeDef.maxMeters / 1000}km`
                              : `${modeDef.maxMeters}m`
                          }`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 距離範囲スライダー */}
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 6,
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
              <span>
                ハブからの最小距離: <b>{minMeters}m</b>
              </span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>（徒歩圏の下限）</span>
            </div>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={minMeters}
              onChange={(e) => onChangeMinMeters(Number(e.target.value))}
              style={{ width: "100%", marginTop: 2 }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 11,
                marginTop: 6,
              }}
            >
              <span>
                ハブからの最大到達距離:{" "}
                <b>
                  {maxMeters >= 1000
                    ? `${(maxMeters / 1000).toFixed(1)}km (${maxMeters}m)`
                    : `${maxMeters}m`}
                </b>
              </span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>（モビリティ有効圏）</span>
            </div>
            <input
              type="range"
              min={200}
              max={4000}
              step={50}
              value={maxMeters}
              onChange={(e) => onChangeMaxMeters(Number(e.target.value))}
              style={{ width: "100%", marginTop: 2 }}
            />
            <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 3 }}>
              ※上のスライダーは「自由設定」や全体の基本距離帯を調整します。下の候補地リストからハブごとに別々の交通モード（例: H1はサイクル、H4はカーシェア）を個別に指定することも可能です。
            </div>
          </div>

          {/* シミュレーション結果カード */}
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 6,
              background: "rgba(245, 158, 11, 0.18)",
              border: "1px solid rgba(245, 158, 11, 0.5)",
            }}
          >
            <div style={{ fontSize: 11.5, color: "#fef3c7" }}>
              有効ハブ（{activeHubIds.length}箇所）による救済効果
            </div>
            <div style={{ marginTop: 2, fontSize: 22, fontWeight: "bold", color: "#fbbf24" }}>
              +{rescuedCount.toLocaleString()}棟{" "}
              <span style={{ fontSize: 13, fontWeight: "normal", color: "#e2e8f0" }}>
                が空白地から救済（オレンジ）
              </span>
            </div>
            {rescuedArea > 0 && (
              <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>
                救済建物の延床面積合計: 約{Math.round(rescuedArea).toLocaleString()}m²
              </div>
            )}
            {summary && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  borderTop: "1px solid rgba(255,255,255,0.15)",
                  paddingTop: 6,
                }}
              >
                <div>
                  交通空白地（全体）: {summary.totalGapBuildingsBefore.toLocaleString()}棟 →{" "}
                  <b>{(summary.totalGapBuildingsBefore - rescuedCount).toLocaleString()}棟</b>
                </div>
                <div>
                  深刻な空白地（非常に遠い/濃い赤）: {summary.severeGapBeforeBuildings.toLocaleString()}棟 →{" "}
                  <b>{(summary.severeGapBeforeBuildings - severeReduction).toLocaleString()}棟</b>
                  {severeReduction > 0 && (
                    <span style={{ color: "#86efac", fontWeight: "bold" }}>
                      （-{severeReduction.toLocaleString()}棟）
                    </span>
                  )}
                </div>
              </div>
            )}
            {onExportGeoJson && (
              <button
                type="button"
                onClick={onExportGeoJson}
                title="候補地と救済建物をGeoJSON形式でダウンロードします（QGIS等で開けます）"
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 11.5,
                  fontWeight: "bold",
                  borderRadius: 4,
                  border: "1px solid rgba(245, 158, 11, 0.7)",
                  background: "rgba(217, 119, 6, 0.35)",
                  color: "#fef3c7",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>ハブ検討結果を出力 (GeoJSON)</span>
              </button>
            )}
          </div>

          {/* 候補地一覧 */}
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontWeight: "bold", fontSize: 12, color: "#e2e8f0" }}>
                検討候補地一覧（全4箇所）
              </span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>モード個別変更可</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {MOBILITY_HUB_CANDIDATES.map((hub) => {
                const isActive = activeHubIds.includes(hub.id);
                const currentHubMode = hubModes[hub.id] ?? selectedMode;
                const hDef = MOBILITY_HUB_MODES.find((m) => m.id === currentHubMode);
                const hubMin = currentHubMode === "custom" ? minMeters : (hDef?.minMeters ?? minMeters);
                const hubMax = currentHubMode === "custom" ? maxMeters : (hDef?.maxMeters ?? maxMeters);
                const stat = summary?.perHubStats.find((s: { hubId: number }) => s.hubId === hub.id);
                return (
                  <div
                    key={hub.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: 5,
                      background: isActive
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(255, 255, 255, 0.02)",
                      border: isActive
                        ? "1px solid rgba(245, 158, 11, 0.4)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      opacity: isActive ? 1 : 0.6,
                      fontSize: 11.5,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                        cursor: "pointer",
                        flex: 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => onToggleHub(hub.id)}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div>
                          <b style={{ color: "#fbbf24" }}>H{hub.id}</b>{" "}
                          <span style={{ color: "#fff", fontWeight: "bold" }}>{hub.name}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: "#cbd5e1" }}>
                          {hub.address}
                          {isActive && stat && (
                            <div style={{ marginTop: 2 }}>
                              <span style={{ color: "#fcd34d", fontWeight: "bold" }}>
                                救済: {stat.coveredBuildings.toLocaleString()}棟
                              </span>
                              <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 5 }}>
                                （{hubMin}m〜{hubMax >= 1000 ? `${hubMax / 1000}km` : `${hubMax}m`}）
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => onFlyToHub(hub.id)}
                        style={{
                          padding: "2px 7px",
                          fontSize: 10.5,
                          borderRadius: 3,
                          border: "1px solid rgba(245, 158, 11, 0.5)",
                          background: "rgba(217, 119, 6, 0.3)",
                          color: "#fef3c7",
                          cursor: "pointer",
                        }}
                      >
                        移動
                      </button>
                      {isActive && (
                        <select
                          value={currentHubMode}
                          onChange={(e) => onUpdateHubMode(hub.id, e.target.value as MobilityHubMode)}
                          style={{
                            padding: "3px 5px",
                            fontSize: 11,
                            fontWeight: "500",
                            borderRadius: 4,
                            border: "1px solid rgba(245, 158, 11, 0.6)",
                            background: "rgba(15, 23, 42, 0.95)",
                            color: "#fbbf24",
                            cursor: "pointer",
                          }}
                        >
                          <option value="cycle">サイクル (400-1.5km)</option>
                          <option value="kickboard">特定小型 (400-1km)</option>
                          <option value="carshare">カーシェア (1-3km)</option>
                          <option value="custom">自由設定</option>
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 「なぜ白いままの建物が多いのか」の説明。左上のLegendは既に縦に長いため、
// 空いている右下に別枠で表示する（右上はInfoPopupが使う）。
function UncoloredBuildingsNote() {
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 10,
        background: "rgba(20, 20, 20, 0.75)",
        color: "#fff",
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 11,
        lineHeight: 1.5,
        fontFamily: "sans-serif",
        maxWidth: 260,
        pointerEvents: "none",
      }}
    >
      白い建物は住宅系以外・用途不明・未評価です。読み込み中、通信失敗、道路網データ未収録の場合も白く表示されます。
    </div>
  );
}



// 道路網距離データ読み込みやプロファイル切り替え時に、画面中央のごく一部にコンパクトに表示するローディングバッジ。
// 全面オーバーレイと異なり、画面全体のマップや建物の色の変化を遮らずに見ることができる。
function CenterLoadingIndicator({
  loadingState,
}: {
  loadingState: { title: string; subtitle?: string } | null;
}) {
  if (!loadingState) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: "12px 20px",
        background: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(56, 189, 248, 0.35)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        color: "#fff",
        pointerEvents: "none",
        fontFamily: "sans-serif",
      }}
    >
      <style>{"@keyframes center-loading-spin { to { transform: rotate(360deg); } }"}</style>
      <div
        style={{
          width: 30,
          height: 30,
          flexShrink: 0,
          border: "3.5px solid rgba(56, 189, 248, 0.25)",
          borderTopColor: "#38bdf8",
          borderRadius: "50%",
          animation: "center-loading-spin 0.85s linear infinite",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: "bold", letterSpacing: "0.02em" }}>
          {loadingState.title}
        </div>
        {loadingState.subtitle && (
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            {loadingState.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}





// 追加数を増やしたときの改善の伸びを、数値と小さな棒グラフで同時に見せる。
// 「最適数」は費用・用地・運行体制で変わるため断定せず、現在スライダーで選んだ案を
// 地図上の紫ピンと対応させて比較する。
function DemandTransitRecommendationPanel({
  analysis,
  selectedCount,
  isRunning,
  pendingThresholdMultiplier,
  isVisible,
  onClose,
}: {
  analysis: DemandTransitPlanAnalysis | null;
  selectedCount: number;
  isRunning: boolean;
  pendingThresholdMultiplier: number;
  isVisible: boolean;
  onClose: () => void;
}) {
  if (!isVisible) return null;
  if (!analysis && !isRunning) return null;
  if (!analysis) {
    const busThreshold = Math.round(BUS_COVERAGE_THRESHOLD_METERS * pendingThresholdMultiplier);
    const stationThreshold = Math.round(STATION_COVERAGE_THRESHOLD_METERS * pendingThresholdMultiplier);
    return (
      <div
        style={{
          position: "absolute", right: 12, bottom: 82, zIndex: 10,
          width: "min(620px, calc(100vw - 24px))", minHeight: 300,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxSizing: "border-box", background: "rgba(20, 20, 20, 0.92)", color: "#fff",
          padding: 30, borderRadius: 6, fontFamily: "sans-serif", pointerEvents: "auto",
        }}
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="アクセス改善比較を閉じる"
          onClick={onClose}
          style={{
            position: "absolute", top: 12, right: 14, border: 0, background: "transparent", color: "#fff",
            fontSize: 28, lineHeight: 1, cursor: "pointer", pointerEvents: "auto",
          }}
        >
          ×
        </button>
        <style>{"@keyframes demand-transit-analysis-spin { to { transform: rotate(360deg); } }"}</style>
        <div style={{ width: 64, height: 64, border: "7px solid rgba(216,180,254,0.25)", borderTopColor: "#d8b4fe", borderRadius: "50%", animation: "demand-transit-analysis-spin 0.9s linear infinite" }} />
        <div style={{ marginTop: 22, color: "#d8b4fe", fontSize: 22, fontWeight: "bold" }}>アクセス改善案を比較中…</div>
        <div style={{ marginTop: 8, fontSize: 15, color: "#e5e7eb" }}>実効距離・基準{pendingThresholdMultiplier.toFixed(1)}倍（バス{busThreshold}m／駅{stationThreshold}m相当）</div>
      </div>
    );
  }
  const selected = analysis.results.find((result) => result.count === selectedCount) ?? analysis.results.at(-1);
  if (!selected) return null;
  const maxReduction = Math.max(
    ...analysis.results.map((result) => result.averageBeforeMeters - result.averageAfterMeters),
    1
  );
  const maxFarthestReduction = Math.max(
    ...analysis.results.map(
      (result) => result.farthestTenPercentBeforeMeters - result.farthestTenPercentAfterMeters
    ),
    1
  );
  const reduction = selected.averageBeforeMeters - selected.averageAfterMeters;
  const comparisonBusThreshold = Math.round(BUS_COVERAGE_THRESHOLD_METERS * analysis.thresholdMultiplier);
  const comparisonStationThreshold = Math.round(STATION_COVERAGE_THRESHOLD_METERS * analysis.thresholdMultiplier);

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 82,
        zIndex: 10,
        // 成果を説明する主パネルなので、従来の幅310pxから約2.5倍に広げる。小さい
        // 画面では画面内に収め、縦方向も必要に応じてパネル内でスクロールさせる。
        width: "min(620px, calc(100vw - 24px))",
        minHeight: "min(700px, calc(100vh - 94px))",
        maxHeight: "calc(100vh - 94px)",
        overflowY: "auto",
        boxSizing: "border-box",
        background: "rgba(20, 20, 20, 0.88)",
        color: "#fff",
        padding: "24px 30px",
        borderRadius: 6,
        fontSize: 16,
        lineHeight: 1.5,
        fontFamily: "sans-serif",
        pointerEvents: "auto",
      }}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="アクセス改善比較を閉じる"
        onClick={onClose}
        style={{
          position: "absolute", top: 12, right: 14, zIndex: 2, border: 0, background: "transparent", color: "#fff",
          fontSize: 28, lineHeight: 1, cursor: "pointer", pointerEvents: "auto",
        }}
      >
        ×
      </button>
      <div style={{ color: "#d8b4fe", fontSize: 17, fontWeight: "bold" }}>追加乗り場数ごとのアクセス改善比較</div>
      <div
        style={{
          marginTop: 12,
          padding: "12px 14px",
          border: "1px solid rgba(216,180,254,0.75)",
          borderRadius: 6,
          background: "rgba(126,34,206,0.18)",
        }}
      >
        <div style={{ color: "#d8b4fe", fontSize: 14, fontWeight: "bold" }}>現在選択中の案</div>
        <div style={{ marginTop: 2, fontSize: 24, fontWeight: "bold" }}>{selected.count}か所を追加した場合</div>
        <div style={{ marginTop: 4, color: "#ddd", fontSize: 13 }}>
          比較条件：実効距離・基準{analysis.thresholdMultiplier.toFixed(1)}倍（バス{comparisonBusThreshold}m／駅{comparisonStationThreshold}m相当）
        </div>
        <div style={{ marginTop: 3 }}>
          対象建物の平均実効距離: 約{Math.round(selected.averageBeforeMeters)}m → 約
          {Math.round(selected.averageAfterMeters)}m
          <span style={{ color: "#86efac", fontWeight: "bold" }}>（約{Math.round(reduction)}m短縮）</span>
        </div>
        <div>新たに比較基準内のバス圏に入る住宅: {selected.newlyCoveredBuildings.toLocaleString()}棟</div>
        <div style={{ marginTop: 5 }}>
          遠い上位10%の平均実効距離: 約{Math.round(selected.farthestTenPercentBeforeMeters)}m → 約
          {Math.round(selected.farthestTenPercentAfterMeters)}m
          <span style={{ color: "#fcd34d", fontWeight: "bold" }}>
            （約{Math.round(selected.farthestTenPercentBeforeMeters - selected.farthestTenPercentAfterMeters)}m短縮）
          </span>
        </div>
        <div>
          比較基準を1.5倍超過する住宅: {selected.severeGapBeforeBuildings.toLocaleString()}棟 → {selected.severeGapAfterBuildings.toLocaleString()}棟
        </div>
      </div>
      <div style={{ marginTop: 16, borderTop: "2px solid rgba(255,255,255,0.4)", paddingTop: 12 }}>
        <div style={{ color: "#fff", fontSize: 20, fontWeight: "bold" }}>全案の比較（1〜10か所）</div>
        <div style={{ marginTop: 2, marginBottom: 10, fontSize: 13, opacity: 0.8 }}>
          現在選択中の案だけでなく、追加数ごとの短縮幅を並べています。棒が長いほど改善が大きいことを示します。
        </div>
        {analysis.results.map((result) => {
          const resultReduction = result.averageBeforeMeters - result.averageAfterMeters;
          const farthestReduction = result.farthestTenPercentBeforeMeters - result.farthestTenPercentAfterMeters;
          const isSelected = result.count === selectedCount;
          return (
            <div
              key={result.count}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                minHeight: 48,
                marginBottom: 5,
                boxSizing: "border-box",
                padding: "3px 7px",
                border: isSelected ? "2px solid #d8b4fe" : "2px solid transparent",
                borderRadius: 7,
                background: isSelected ? "rgba(192,132,252,0.16)" : "transparent",
                boxShadow: isSelected ? "0 0 0 1px rgba(216,180,254,0.2)" : "none",
              }}
            >
              <span
                style={{
                  width: 66,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  color: isSelected ? "#d8b4fe" : "#ddd",
                  fontWeight: isSelected ? "bold" : "normal",
                }}
              >
                {result.count}か所
              </span>
              <div style={{ display: "grid", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                  <span style={{ width: 50 }}>平均</span>
                  <span style={{ width: 240, height: 12, background: "rgba(255,255,255,0.15)", borderRadius: 6, overflow: "hidden" }}>
                    <span
                      style={{
                        display: "block",
                        width: `${Math.max(2, (resultReduction / maxReduction) * 100)}%`,
                        height: "100%",
                        background: "#60a5fa",
                      }}
                    />
                  </span>
                  <span>−{Math.round(resultReduction)}m</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#fcd34d" }}>
                  <span style={{ width: 50 }}>遠い10%</span>
                  <span style={{ width: 240, height: 12, background: "rgba(255,255,255,0.15)", borderRadius: 6, overflow: "hidden" }}>
                    <span
                      style={{
                        display: "block",
                        width: `${Math.max(2, (farthestReduction / maxFarthestReduction) * 100)}%`,
                        height: "100%",
                        background: "#f59e0b",
                      }}
                    />
                  </span>
                  <span>−{Math.round(farthestReduction)}m</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, color: "#cbd5e1", fontSize: 13 }}>
        各行は、前の案で選んだ地点を残したまま、概算上の短縮量が最も大きい地点を一つずつ追加した案です。
      </div>
      <div style={{ marginTop: 12, fontSize: 13, opacity: 0.7 }}>
        {analysis.scopeLabel}の比較対象 {analysis.targetBuildingCount.toLocaleString()}棟を比較。遠い10%は追加前に最も遠かった建物群を固定して比較しています。{analysis.methodLabel} 用地・運行費用は含みません。
      </div>
      {isRunning && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", borderRadius: 6,
            background: "rgba(11, 16, 19, 0.86)", color: "#fff",
          }}
        >
          <style>{"@keyframes demand-transit-analysis-spin { to { transform: rotate(360deg); } }"}</style>
          <div style={{ width: 68, height: 68, border: "8px solid rgba(216,180,254,0.28)", borderTopColor: "#d8b4fe", borderRadius: "50%", animation: "demand-transit-analysis-spin 0.9s linear infinite" }} />
          <div style={{ marginTop: 22, color: "#d8b4fe", fontSize: 22, fontWeight: "bold" }}>条件を反映して比較中…</div>
          <div style={{ marginTop: 8, fontSize: 15, color: "#e5e7eb" }}>実効距離・基準{pendingThresholdMultiplier.toFixed(1)}倍で再計算しています</div>
        </div>
      )}
    </div>
  );
}

export default function PlateauViewer() {
  const popupRequestRef = useRef(0);
  const candidatePopupRef = useRef(false);
  const [selectedAreaId, setSelectedAreaId] = useState<AreaId>(DEFAULT_AREA_ID);
  const [areaDataStatusNote, setAreaDataStatusNote] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [roadSnapNotice, setRoadSnapNotice] = useState<{ message: string; isError: boolean } | null>(null);
  const roadSnapNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRoadSnapNoticeRef = useRef<(message: string, isError?: boolean) => void>(() => {});

  const showRoadSnapNotice = useCallback((message: string, isError = false) => {
    if (roadSnapNoticeTimerRef.current) {
      clearTimeout(roadSnapNoticeTimerRef.current);
    }
    setRoadSnapNotice({ message, isError });
    // エラー時は2.6秒、成功時は邪魔にならないよう短め（1.8秒）に自動消去
    roadSnapNoticeTimerRef.current = setTimeout(() => {
      setRoadSnapNotice(null);
    }, isError ? 2600 : 1800);
  }, []);
  showRoadSnapNoticeRef.current = showRoadSnapNotice;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const [demandTransitClusterCount, setDemandTransitClusterCount] = useState(
    DEMAND_TRANSIT_CLUSTER_COUNT_DEFAULT
  );
  const [demandTransitAnalysisThresholdMultiplier, setDemandTransitAnalysisThresholdMultiplier] = useState(
    DEMAND_TRANSIT_ANALYSIS_THRESHOLD_MULTIPLIER_DEFAULT
  );
  const [showHelloCycling, setShowHelloCycling] = useState(false);
  const [walkProfile, setWalkProfile] = useState<WalkProfile>(WALK_PROFILE_DEFAULT);
  const [distanceModel, setDistanceModel] = useState<DistanceModel>(DISTANCE_MODEL_DEFAULT);
  const [loadingNetworkScores, setLoadingNetworkScores] = useState(false);
  const [centerLoading, setCenterLoading] = useState<{ title: string; subtitle?: string } | null>(
    null
  );
  const [networkThresholdMultiplier, setNetworkThresholdMultiplier] = useState(
    NETWORK_THRESHOLD_MULTIPLIER_DEFAULT
  );
  const [showExperimentalDistanceModel, setShowExperimentalDistanceModel] = useState(false);
  const [demandTransitPlanAnalysis, setDemandTransitPlanAnalysis] = useState<DemandTransitPlanAnalysis | null>(null);
  const [isDemandTransitAnalysisRunning, setIsDemandTransitAnalysisRunning] = useState(false);
  const [isDemandTransitPanelVisible, setIsDemandTransitPanelVisible] = useState(false);
  const [isAddingCustomStop, setIsAddingCustomStop] = useState(false);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  const [isEvaluatingCustomStops, setIsEvaluatingCustomStops] = useState(false);
  const [customStopSummary, setCustomStopSummary] = useState<CustomStopSimulationSummary | null>(null);

  // モビリティ・ハブ実証検討シミュレーション用のstate。
  const [isMobilityHubActive, setIsMobilityHubActive] = useState(false);
  const [mobilityHubMode, setMobilityHubMode] = useState<MobilityHubMode>("cycle");
  const [mobilityHubMinMeters, setMobilityHubMinMeters] = useState(400);
  const [mobilityHubMaxMeters, setMobilityHubMaxMeters] = useState(1500);
  const [activeMobilityHubIds, setActiveMobilityHubIds] = useState<number[]>([1, 2, 3, 4]);
  const [hubModes, setHubModes] = useState<Record<number, MobilityHubMode>>({
    1: "cycle",
    2: "cycle",
    3: "cycle",
    4: "cycle",
  });
  const [mobilityHubSummary, setMobilityHubSummary] = useState<MobilityHubSimulationSummary | null>(null);

  const selectedAreaIdRef = useRef<AreaId>(selectedAreaId);
  const demandTransitClusterCountRef = useRef(demandTransitClusterCount);
  const demandTransitAnalysisThresholdMultiplierRef = useRef(demandTransitAnalysisThresholdMultiplier);
  const walkProfileRef = useRef(walkProfile);
  const distanceModelRef = useRef(distanceModel);
  const networkThresholdMultiplierRef = useRef(networkThresholdMultiplier);
  const isAddingCustomStopRef = useRef(isAddingCustomStop);
  const isMobilityHubActiveRef = useRef(isMobilityHubActive);
  const mobilityHubModeRef = useRef(mobilityHubMode);
  const mobilityHubMinMetersRef = useRef(mobilityHubMinMeters);
  const mobilityHubMaxMetersRef = useRef(mobilityHubMaxMeters);
  const activeMobilityHubIdsRef = useRef(activeMobilityHubIds);
  const hubModesRef = useRef(hubModes);
  const mobilityHubSummaryRef = useRef<MobilityHubSimulationSummary | null>(null);

  const showHelloCyclingRef = useRef(showHelloCycling);
  useEffect(() => {
    selectedAreaIdRef.current = selectedAreaId;
    demandTransitClusterCountRef.current = demandTransitClusterCount;
    demandTransitAnalysisThresholdMultiplierRef.current = demandTransitAnalysisThresholdMultiplier;
    walkProfileRef.current = walkProfile;
    distanceModelRef.current = distanceModel;
    networkThresholdMultiplierRef.current = networkThresholdMultiplier;
    showHelloCyclingRef.current = showHelloCycling;
    isAddingCustomStopRef.current = isAddingCustomStop;
    isMobilityHubActiveRef.current = isMobilityHubActive;
    mobilityHubModeRef.current = mobilityHubMode;
    mobilityHubMinMetersRef.current = mobilityHubMinMeters;
    mobilityHubMaxMetersRef.current = mobilityHubMaxMeters;
    activeMobilityHubIdsRef.current = activeMobilityHubIds;
    hubModesRef.current = hubModes;
    mobilityHubSummaryRef.current = mobilityHubSummary;
  }, [
    selectedAreaId,
    demandTransitClusterCount,
    demandTransitAnalysisThresholdMultiplier,
    walkProfile,
    distanceModel,
    networkThresholdMultiplier,
    showHelloCycling,
    isAddingCustomStop,
    isMobilityHubActive,
    mobilityHubMode,
    mobilityHubMinMeters,
    mobilityHubMaxMeters,
    activeMobilityHubIds,
    hubModes,
    mobilityHubSummary,
  ]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const area = getAreaConfig(selectedAreaId);
      document.title = `PLATEAU 交通空白地可視化・施策シミュレーション（${area.selectorLabel}）`;
    }
  }, [selectedAreaId]);
  const scheduleDemandTransitRecomputeRef = useRef<(() => void) | null>(null);
  const scheduleDemandTransitAnalysisRef = useRef<((delayMs?: number) => void) | null>(null);
  const applyAreaChangeRef = useRef<((areaId: AreaId) => void) | null>(null);
  const applyWalkProfileRef = useRef<((profile: WalkProfile) => void) | null>(null);
  const applyDistanceModelRef = useRef<((model: DistanceModel) => void) | null>(null);
  const applyNetworkThresholdMultiplierRef = useRef<((multiplier: number) => void) | null>(null);
  // 自由配置した仮設停留所の操作用ref。
  const removeCustomStopRef = useRef<((id: number) => void) | null>(null);
  const undoLastCustomStopRef = useRef<(() => void) | null>(null);
  const clearCustomStopsRef = useRef<(() => void) | null>(null);
  const flyToCustomStopRef = useRef<((id: number) => void) | null>(null);
  const reapplyCustomStopScoresRef = useRef<(() => void) | null>(null);
  const exportCustomStopSimulationGeoJsonRef = useRef<(() => void) | null>(null);
  const customStopSummaryRef = useRef<CustomStopSimulationSummary | null>(null);

  // モビリティ・ハブ操作用ref。
  const reapplyMobilityHubScoresRef = useRef<(() => void) | null>(null);
  const flyToMobilityHubRef = useRef<((hubId: number) => void) | null>(null);
  const exportMobilityHubGeoJsonRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    customStopSummaryRef.current = customStopSummary;
  }, [customStopSummary]);

  const handleSelectMobilityHubMode = (mode: MobilityHubMode) => {
    setMobilityHubMode(mode);
    mobilityHubModeRef.current = mode;
    const def = MOBILITY_HUB_MODES.find((m) => m.id === mode);
    if (def) {
      setMobilityHubMinMeters(def.minMeters);
      mobilityHubMinMetersRef.current = def.minMeters;
      setMobilityHubMaxMeters(def.maxMeters);
      mobilityHubMaxMetersRef.current = def.maxMeters;
    }
    const nextHubModes: Record<number, MobilityHubMode> = { 1: mode, 2: mode, 3: mode, 4: mode };
    setHubModes(nextHubModes);
    hubModesRef.current = nextHubModes;
    reapplyMobilityHubScoresRef.current?.();
  };

  const handleUpdateHubMode = (hubId: number, mode: MobilityHubMode) => {
    const next = { ...hubModesRef.current, [hubId]: mode };
    hubModesRef.current = next;
    setHubModes(next);
    reapplyMobilityHubScoresRef.current?.();
  };

  const handleChangeMobilityHubMinMeters = (val: number) => {
    setMobilityHubMinMeters(val);
    mobilityHubMinMetersRef.current = val;
    setMobilityHubMode("custom");
    mobilityHubModeRef.current = "custom";
    reapplyMobilityHubScoresRef.current?.();
  };

  const handleChangeMobilityHubMaxMeters = (val: number) => {
    setMobilityHubMaxMeters(val);
    mobilityHubMaxMetersRef.current = val;
    setMobilityHubMode("custom");
    mobilityHubModeRef.current = "custom";
    reapplyMobilityHubScoresRef.current?.();
  };

  const handleToggleMobilityHub = (hubId: number) => {
    const prev = activeMobilityHubIdsRef.current;
    const next = prev.includes(hubId) ? prev.filter((id) => id !== hubId) : [...prev, hubId];
    activeMobilityHubIdsRef.current = next;
    setActiveMobilityHubIds(next);
    reapplyMobilityHubScoresRef.current?.();
  };

  const handleToggleMobilityHubActive = () => {
    setIsMobilityHubActive((prev) => {
      const next = !prev;
      isMobilityHubActiveRef.current = next;
      if (next) {
        setIsLegendCollapsed(true);
        if (isAddingCustomStopRef.current) {
          setIsAddingCustomStop(false);
          isAddingCustomStopRef.current = false;
        }
      } else {
        setIsLegendCollapsed(false);
      }
      reapplyMobilityHubScoresRef.current?.();
      return next;
    });
  };

  const handleCloseMobilityHub = () => {
    setIsMobilityHubActive(false);
    isMobilityHubActiveRef.current = false;
    setIsLegendCollapsed(false);
    reapplyMobilityHubScoresRef.current?.();
  };
  const helloCyclingEntitiesRef = useRef<Cesium.Entity[]>([]);
  useEffect(() => {
    for (const entity of helloCyclingEntitiesRef.current) {
      entity.show = showHelloCycling;
    }
  }, [showHelloCycling]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    let cancelled = false;
    let disposeRuntime = () => {};

    async function init() {
      let terrainProvider: Cesium.TerrainProvider;
      try {
        terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(TERRAIN_URL);
      } catch (err) {
        console.error("PLATEAU-Terrainの読み込みに失敗しました。平坦な地形で継続します。", err);
        terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }
      if (cancelled || !containerRef.current) return;

      const viewer = new Cesium.Viewer(containerRef.current, {
        terrainProvider,
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
          Promise.resolve(
            new Cesium.UrlTemplateImageryProvider({
              url: ORTHO_URL,
              credit: "Project PLATEAU (国土交通省)",
              maximumLevel: 19,
            })
          ),
          {}
        ),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        animation: false,
        timeline: false,
        infoBox: false,
        selectionIndicator: false,
      });
      viewerRef.current = viewer;

      try {
        const osmRoadsLayer = viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: OSM_URL,
            credit: "OpenStreetMap contributors",
            maximumLevel: 19,
          })
        );
        osmRoadsLayer.alpha = 0.42;
      } catch (err) {
        console.warn("道路網オーバーレイの読み込みに失敗しました", err);
      }

      viewer.scene.globe.baseColor = Cesium.Color.DARKSLATEGRAY;

      let busStopList: BusStop[] = [];
      let majorOperatorStopList: BusStop[] = [];
      let trainStationList: TrainStation[] = [];
      let areaEntities: Cesium.Entity[] = [];
      let areaDataSources: Cesium.DataSource[] = [];
      let currentTileset: Cesium.Cesium3DTileset | undefined;
      let removeLoad: (() => void) | undefined;
      let removeVisible: (() => void) | undefined;
      let removeUnload: (() => void) | undefined;
      let areaLoadGeneration = 0;

      const getCurrentAreaConfig = () => getAreaConfig(selectedAreaIdRef.current);
      const getCurrentWalkProfile = () =>
        getCurrentAreaConfig().slopeParams.walkProfiles[walkProfileRef.current];

      const parseTransitGeoJsonFeatures = (features: unknown[], defaultOperator: string) => {
        const parsedStops: BusStop[] = [];
        const parsedStations: TrainStation[] = [];
        for (const raw of features) {
          const f = raw as {
            geometry?: { type?: string; coordinates?: [number, number] };
            properties?: Record<string, unknown>;
          };
          if (f?.geometry?.type !== "Point" || !Array.isArray(f.geometry.coordinates)) continue;
          const [lng, lat] = f.geometry.coordinates;
          if (typeof lng !== "number" || typeof lat !== "number") continue;
          const props = f.properties ?? {};
          const facilityType = String(props.facility_type ?? props.facilityType ?? props.type ?? "bus_stop");
          const name = String(props.name ?? "名称未設定");
          if (facilityType === "station" || facilityType === "train_station") {
            parsedStations.push({
              name,
              lat,
              lng,
              line: typeof props.line === "string" ? props.line : typeof props.operator === "string" ? props.operator : defaultOperator,
            });
          } else {
            const rawRoutes = Array.isArray(props.routes) ? props.routes : [];
            const routes: BusRoute[] = rawRoutes.map((r) =>
              typeof r === "string"
                ? { name: r, classCode: null }
                : {
                    name: String((r as { name?: unknown })?.name ?? ""),
                    classCode:
                      typeof (r as { classCode?: unknown })?.classCode === "string"
                        ? ((r as { classCode: string }).classCode)
                        : null,
                  }
            ).filter((r) => r.name.length > 0);
            parsedStops.push({
              name,
              lat,
              lng,
              operator: String(props.operator ?? defaultOperator),
              routes,
            });
          }
        }
        return { parsedStops, parsedStations };
      };

      // ハローサイクリングのステーションを黄色い自転車ピンで表示する（表示のみ、色分けロジックには未組み込み）
      try {
        const res = await fetch(HELLO_CYCLING_STATIONS_API_URL);
        if (!res.ok) throw new Error(`hellocycling-stations API returned ${res.status}`);
        const data: { stations: HelloCyclingStation[] } = await res.json();
        if (cancelled) return;
        const bicycleIconUrl = createBicycleIconDataUrl(HELLO_CYCLING_COLOR);
        for (const station of data.stations) {
          const entity = viewer.entities.add({
            name: station.name,
            position: Cesium.Cartesian3.fromDegrees(station.lng, station.lat),
            properties: { isHelloCyclingStation: true, capacity: station.capacity },
            show: showHelloCyclingRef.current,
            billboard: {
              image: bicycleIconUrl,
              width: 22,
              height: 22,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          helloCyclingEntitiesRef.current.push(entity);
        }
      } catch (err) {
        console.warn("ハローサイクリングのステーションデータの読み込みに失敗しました。ピン表示なしで継続します。", err);
      }

      // モビリティ・ハブ実証検討候補地（4箇所）のピン。
      type MobilityHubRuntime = {
        hub: MobilityHubSite;
        entity: Cesium.Entity;
      };
      const mobilityHubEntities: MobilityHubRuntime[] = [];
      for (const hub of MOBILITY_HUB_CANDIDATES) {
        const entity = viewer.entities.add({
          name: `モビリティ・ハブ候補地 H${hub.id}（${hub.name}）`,
          position: Cesium.Cartesian3.fromDegrees(hub.lng, hub.lat),
          show: isMobilityHubActiveRef.current && activeMobilityHubIdsRef.current.includes(hub.id),
          properties: {
            isMobilityHub: true,
            hubId: hub.id,
            hubData: hub,
          },
          billboard: {
            image: createMobilityHubPinIconDataUrl(hub.id),
            width: 32,
            height: 32,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            eyeOffset: new Cesium.Cartesian3(0, 0, -100),
          },
        });
        mobilityHubEntities.push({ hub, entity });
      }

      function updateMobilityHubEntityVisibility() {
        const isActive = isMobilityHubActiveRef.current;
        const activeIds = activeMobilityHubIdsRef.current;
        for (const { hub, entity } of mobilityHubEntities) {
          entity.show = isActive && activeIds.includes(hub.id);
        }
      }

      type CachedScore = {
        baseColor: Cesium.Color;
        baseInfo: BuildingScoreInfo;
        color: Cesium.Color;
        info: BuildingScoreInfo;
      };
      const buildingScoreCache = new Map<string, CachedScore>();
      let featureScoreMap = new WeakMap<Cesium.Cesium3DTileFeature, BuildingScoreInfo>();
      const loadedTiles = new Set<Cesium.Cesium3DTile>();
      let networkScoreMap: Map<string, BuildingNetworkScoreRow> | null = null;
      let routingGraphCache: RoutingGraph | null = null;
      let routingGraphPromise: Promise<RoutingGraph | null> | null = null;
      const tileWork = new TileWorkGate<Cesium.Cesium3DTile>();

      // 自由配置した仮設停留所（複数配置可）のランタイム状態。
      type CustomStopRuntime = CustomStopSite & {
        entity: Cesium.Entity;
        buildingDistances: Map<string, number>;
        evaluatedBuildingIds: Set<string>;
        routedNodeDistances?: Float64Array;
      };
      let customStops: CustomStopRuntime[] = [];
      let nextCustomStopId = 1;
      let customStopEvalGeneration = 0;
      let customStopEvalTimer: ReturnType<typeof setTimeout> | null = null;

      async function ensureRoutingGraph(): Promise<RoutingGraph | null> {
        if (routingGraphCache) return routingGraphCache;
        if (routingGraphPromise) return routingGraphPromise;
        const graphUrl = getCurrentAreaConfig().dataPaths.routingGraphJsonUrl;
        routingGraphPromise = (async () => {
          try {
            const res = await fetch(graphUrl);
            if (!res.ok) throw new Error(`routing-graph: ${res.status}`);
            const graph: RoutingGraph = await res.json();
            if (cancelled) return null;
            routingGraphCache = graph;
            return graph;
          } catch (err) {
            console.warn("道路網グラフの取得に失敗しました", err);
            return null;
          } finally {
            routingGraphPromise = null;
          }
        })();
        return routingGraphPromise;
      }

      function refreshLoadedTileFeatureColors() {
        for (const tile of loadedTiles) {
          const content = tile.content;
          if (!content || content.featuresLength === 0) continue;
          for (let i = 0; i < content.featuresLength; i++) {
            const feature = content.getFeature(i);
            const usage = extractResidentialUsage(feature);
            if (!usage) continue;
            const lng = feature.getProperty("_x") as number | undefined;
            const lat = feature.getProperty("_y") as number | undefined;
            if (typeof lng !== "number" || typeof lat !== "number") continue;
            const buildingId =
              (feature.getProperty("uro:BuildingIDAttribute_uro:buildingID") as string | undefined) ??
              `${lng},${lat}`;
            const cached = buildingScoreCache.get(buildingId);
            if (cached) {
              feature.color = cached.color;
              featureScoreMap.set(feature, cached.info);
            }
          }
        }
        viewer.scene.requestRender();
      }

      function reapplyCustomStopScoresToBuildings() {
        if (cancelled) return;
        if (customStops.length === 0) {
          for (const cached of buildingScoreCache.values()) {
            cached.color = cached.baseColor;
            cached.info = cached.baseInfo;
          }
          setCustomStopSummary(null);
          customStopSummaryRef.current = null;
          refreshLoadedTileFeatureColors();
          return;
        }

        const records: CustomStopBuildingRecord[] = [];
        for (const [buildingId, cached] of buildingScoreCache.entries()) {
          records.push({
            buildingId,
            lat: cached.baseInfo.lat,
            lng: cached.baseInfo.lng,
            baseBusEffectiveDistanceMeters: cached.baseInfo.busEffectiveDistanceMeters,
            baseStationEffectiveDistanceMeters: cached.baseInfo.stationEffectiveDistanceMeters,
            baseCoverageRatio: cached.baseInfo.coverageRatio,
            totalFloorArea: cached.baseInfo.totalFloorArea,
          });
        }

        const stopDistanceMap = new Map<number, ReadonlyMap<string, number>>();
        for (const stop of customStops) {
          stopDistanceMap.set(stop.id, stop.buildingDistances);
        }

        const effectiveMultiplier =
          distanceModelRef.current === "network"
            ? networkThresholdMultiplierRef.current
            : demandTransitAnalysisThresholdMultiplierRef.current;
        const thresholdMultiplier = effectiveMultiplier;
        const { outcomes, summary } = evaluateCustomStopsSimulation(
          records,
          customStops,
          stopDistanceMap,
          thresholdMultiplier
        );
        const walkSpeed = getCurrentWalkProfile().walkSpeedMPerMin;

        for (const [buildingId, cached] of buildingScoreCache.entries()) {
          const outcome = outcomes.get(buildingId);
          if (outcome && outcome.bestStopId != null && outcome.bestStopLabel != null) {
            cached.color = outcome.isNewlyCovered
              ? NEWLY_COVERED_BUILDING_COLOR
              : colorForCoverageRatio(outcome.afterCoverageRatio);
            cached.info = {
              ...cached.baseInfo,
              customStopImprovement: {
                stopId: outcome.bestStopId,
                stopLabel: outcome.bestStopLabel,
                afterBusEffectiveDistanceMeters: outcome.afterBusEffectiveDistanceMeters,
                afterBusWalkMinutes: outcome.afterBusEffectiveDistanceMeters / walkSpeed,
                afterCoverageRatio: outcome.afterCoverageRatio,
                isNewlyCovered: outcome.isNewlyCovered,
              },
            };
          } else {
            cached.color = cached.baseColor;
            cached.info = cached.baseInfo;
          }
        }

        setCustomStopSummary(summary);
        customStopSummaryRef.current = summary;
        refreshLoadedTileFeatureColors();
      }

      let mobilityHubSimulationTimer: ReturnType<typeof setTimeout> | null = null;
      function scheduleMobilityHubSimulation(delayMs = 60) {
        if (!isMobilityHubActiveRef.current) return;
        if (mobilityHubSimulationTimer) clearTimeout(mobilityHubSimulationTimer);
        mobilityHubSimulationTimer = setTimeout(() => {
          mobilityHubSimulationTimer = null;
          reapplyMobilityHubScoresToBuildings();
        }, delayMs);
      }

      function reapplyMobilityHubScoresToBuildings() {
        if (cancelled) return;
        updateMobilityHubEntityVisibility();
        if (!isMobilityHubActiveRef.current) {
          // ハブ検討が無効化された場合はベース色・情報に戻す
          for (const cached of buildingScoreCache.values()) {
            cached.color = cached.baseColor;
            cached.info = cached.baseInfo;
          }
          setMobilityHubSummary(null);
          mobilityHubSummaryRef.current = null;
          refreshLoadedTileFeatureColors();
          return;
        }

        const activeHubs = MOBILITY_HUB_CANDIDATES.filter((h) =>
          activeMobilityHubIdsRef.current.includes(h.id)
        );

        const records: MobilityHubBuildingRecord[] = [];
        for (const [buildingId, cached] of buildingScoreCache.entries()) {
          records.push({
            buildingId,
            lat: cached.baseInfo.lat,
            lng: cached.baseInfo.lng,
            baseCoverageRatio: cached.baseInfo.coverageRatio,
            totalFloorArea: cached.baseInfo.totalFloorArea,
            baseBusEffectiveDistanceMeters: cached.baseInfo.busEffectiveDistanceMeters,
            usage: cached.baseInfo.usage,
          });
        }

        const minMeters = mobilityHubMinMetersRef.current;
        const maxMeters = mobilityHubMaxMetersRef.current;
        const modeKey = mobilityHubModeRef.current;
        const modeDef = MOBILITY_HUB_MODES.find((m) => m.id === modeKey);
        const modeLabel = modeDef?.label ?? "自由設定";

        const hubConfigs = new Map<number, MobilityHubSiteConfig>();
        for (const hub of activeHubs) {
          const hMode = hubModesRef.current[hub.id] ?? modeKey;
          const hDef = MOBILITY_HUB_MODES.find((m) => m.id === hMode);
          const hMin = hMode === "custom" ? minMeters : (hDef?.minMeters ?? minMeters);
          const hMax = hMode === "custom" ? maxMeters : (hDef?.maxMeters ?? maxMeters);
          hubConfigs.set(hub.id, {
            hubId: hub.id,
            mode: hMode,
            minDistanceMeters: hMin,
            maxDistanceMeters: hMax,
          });
        }

        const { outcomes, summary } = evaluateMobilityHubSimulation(
          records,
          activeHubs,
          minMeters,
          maxMeters,
          modeKey,
          hubConfigs
        );

        const hubRescuedColor = Cesium.Color.fromCssColorString(MOBILITY_HUB_PIN_COLOR_HEX);

        for (const [buildingId, cached] of buildingScoreCache.entries()) {
          const outcome = outcomes.get(buildingId);
          if (outcome && outcome.isCoveredByHub && outcome.nearestHubId != null && outcome.nearestHubName != null) {
            const nearestHub = activeHubs.find((h) => h.id === outcome.nearestHubId);
            cached.color = hubRescuedColor;
            cached.info = {
              ...cached.baseInfo,
              mobilityHubImprovement: {
                hubId: outcome.nearestHubId,
                hubName: outcome.nearestHubName,
                hubAddress: nearestHub?.address ?? "",
                hubDistanceMeters: outcome.hubDistanceMeters,
                modeLabel: outcome.modeLabel ?? modeLabel,
              },
            };
          } else {
            cached.color = cached.baseColor;
            cached.info = cached.baseInfo;
          }
        }

        setMobilityHubSummary(summary);
        mobilityHubSummaryRef.current = summary;
        refreshLoadedTileFeatureColors();
      }

      async function evaluatePendingBuildingsForCustomStops() {
        if (cancelled) return;
        if (customStops.length === 0) {
          setIsEvaluatingCustomStops(false);
          reapplyCustomStopScoresToBuildings();
          return;
        }

        const evalGen = ++customStopEvalGeneration;
        const areaConfig = getCurrentAreaConfig();
        const profile = getCurrentWalkProfile();

        if (distanceModelRef.current === "network" && networkScoreMap && networkScoreMap.size > 0) {
          setIsEvaluatingCustomStops(true);
          const graph = await ensureRoutingGraph();
          if (cancelled || evalGen !== customStopEvalGeneration) return;
          if (graph && Array.isArray(graph.nodes) && graph.nodes.length > 0) {
            const router = new NetworkRouter(graph, walkProfileRef.current);
            for (const stop of customStops) {
              if (!stop.routedNodeDistances) {
                try {
                  const routed = router.fromCandidate(stop.lat, stop.lng);
                  stop.routedNodeDistances = routed.distances;
                } catch (err) {
                  console.warn("仮設停留所の道路網スナップに失敗しました", err);
                }
              }
              if (stop.routedNodeDistances) {
                for (const [buildingId, cached] of buildingScoreCache.entries()) {
                  const row = networkScoreMap.get(buildingId);
                  if (!row) continue;
                  if (stop.evaluatedBuildingIds.has(buildingId)) continue;
                  stop.evaluatedBuildingIds.add(buildingId);
                  const dist = stop.routedNodeDistances[row.networkNode];
                  if (Number.isFinite(dist) && dist < cached.baseInfo.busEffectiveDistanceMeters) {
                    stop.buildingDistances.set(buildingId, dist);
                  }
                }
              }
            }
          }
        }

        const isNetworkLiveFallback = distanceModelRef.current === "network";
        const detourFactor = isNetworkLiveFallback ? areaConfig.slopeParams.roadNetworkDetourFactor : 1;

        type PendingPairTask = {
          stop: CustomStopRuntime;
          buildingId: string;
          baseInfo: BuildingScoreInfo;
          pair: EffectiveDistancePair;
        };
        const tasks: PendingPairTask[] = [];

        for (const stop of customStops) {
          for (const [buildingId, cached] of buildingScoreCache.entries()) {
            if (stop.evaluatedBuildingIds.has(buildingId)) continue;
            stop.evaluatedBuildingIds.add(buildingId);
            const straight = haversineMeters(
              cached.baseInfo.lat,
              cached.baseInfo.lng,
              stop.lat,
              stop.lng
            );
            if (straight >= cached.baseInfo.busEffectiveDistanceMeters) continue;
            tasks.push({
              stop,
              buildingId,
              baseInfo: cached.baseInfo,
              pair: {
                originLat: cached.baseInfo.lat,
                originLng: cached.baseInfo.lng,
                destLat: stop.lat,
                destLng: stop.lng,
              },
            });
          }
        }

        if (tasks.length === 0) {
          setIsEvaluatingCustomStops(false);
          reapplyCustomStopScoresToBuildings();
          return;
        }

        setIsEvaluatingCustomStops(true);
        try {
          const results = await computeEffectiveDistances(
            terrainProvider,
            tasks.map((t) => t.pair),
            profile.slopePenaltyFactor,
            profile.uphillDistanceMultiplier,
            profile.downhillDistanceMultiplier,
            areaConfig.slopeParams.gradientCap
          );
          if (cancelled || evalGen !== customStopEvalGeneration) return;
          tasks.forEach((task, idx) => {
            const eff = results[idx].effectiveDistanceMeters * detourFactor;
            if (eff < task.baseInfo.busEffectiveDistanceMeters) {
              task.stop.buildingDistances.set(task.buildingId, eff);
            }
          });
        } catch (err) {
          console.warn(
            "仮設停留所の地形サンプリングに失敗したため、建物の既存勾配倍率で概算します。",
            err
          );
          if (cancelled || evalGen !== customStopEvalGeneration) return;
          for (const task of tasks) {
            const straight = haversineMeters(
              task.pair.originLat,
              task.pair.originLng,
              task.pair.destLat,
              task.pair.destLng
            );
            const slopeFactor = Math.max(
              1,
              task.baseInfo.busEffectiveDistanceMeters /
                Math.max(task.baseInfo.busStraightDistanceMeters, 1)
            );
            const eff = straight * slopeFactor * detourFactor;
            if (eff < task.baseInfo.busEffectiveDistanceMeters) {
              task.stop.buildingDistances.set(task.buildingId, eff);
            }
          }
        } finally {
          if (!cancelled && evalGen === customStopEvalGeneration) {
            setIsEvaluatingCustomStops(false);
            reapplyCustomStopScoresToBuildings();
          }
        }
      }

      function scheduleCustomStopEvaluation(delayMs = 80) {
        if (customStops.length === 0) return;
        if (customStopEvalTimer) clearTimeout(customStopEvalTimer);
        customStopEvalTimer = setTimeout(() => {
          customStopEvalTimer = null;
          void evaluatePendingBuildingsForCustomStops();
        }, delayMs);
      }

      function reindexCustomStops() {
        customStops.forEach((stop, index) => {
          const num = index + 1;
          stop.label = `仮設停留所 #${num}`;
          stop.entity.name = stop.label;
          if (stop.entity.billboard) {
            stop.entity.billboard.image = new Cesium.ConstantProperty(
              createCustomStopPinIconDataUrl(num)
            );
          }
        });
      }

      function addCustomStop(lat: number, lng: number) {
        const id = nextCustomStopId++;
        const num = customStops.length + 1;
        const label = `仮設停留所 #${num}`;
        const entity = viewer.entities.add({
          name: label,
          position: Cesium.Cartesian3.fromDegrees(lng, lat),
          properties: { isCustomStop: true, customStopId: id },
          billboard: {
            image: createCustomStopPinIconDataUrl(num),
            width: 28,
            height: 28,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            eyeOffset: new Cesium.Cartesian3(0, 0, -100),
          },
        });
        customStops.push({
          id,
          label,
          lat,
          lng,
          entity,
          buildingDistances: new Map(),
          evaluatedBuildingIds: new Set(),
        });
        void evaluatePendingBuildingsForCustomStops();
      }

      function removeCustomStop(id: number) {
        const idx = customStops.findIndex((s) => s.id === id);
        if (idx < 0) return;
        const [removed] = customStops.splice(idx, 1);
        viewer.entities.remove(removed.entity);
        reindexCustomStops();
        ++customStopEvalGeneration;
        setIsEvaluatingCustomStops(false);
        ++popupRequestRef.current;
        setPopup(null);
        reapplyCustomStopScoresToBuildings();
      }

      function undoLastCustomStop() {
        if (customStops.length === 0) return;
        const last = customStops[customStops.length - 1];
        removeCustomStop(last.id);
      }

      function clearCustomStops() {
        for (const stop of customStops) {
          viewer.entities.remove(stop.entity);
        }
        customStops = [];
        nextCustomStopId = 1;
        ++customStopEvalGeneration;
        setIsEvaluatingCustomStops(false);
        ++popupRequestRef.current;
        setPopup(null);
        reapplyCustomStopScoresToBuildings();
      }

      function flyToCustomStop(id: number) {
        const stop = customStops.find((s) => s.id === id);
        if (!stop) return;
        const view = getCurrentAreaConfig().initialView;
        const center = Cesium.Cartesian3.fromDegrees(stop.lng, stop.lat);
        const sphere = new Cesium.BoundingSphere(center, 550);
        viewer.camera.flyToBoundingSphere(sphere, {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(view.headingDeg),
            Cesium.Math.toRadians(view.pitchDeg)
          ),
          duration: 0.9,
        });
      }

      function exportCustomStopSimulationGeoJson() {
        if (customStops.length === 0) return;

        const stopExportItems: CustomStopExportItem[] = customStops.map((stop) => {
          const stat = customStopSummaryRef.current?.perStopStats.find((s) => s.id === stop.id);
          return {
            id: stop.id,
            label: stop.label,
            lat: stop.lat,
            lng: stop.lng,
            standaloneCoveredBuildings: stat?.standaloneCoveredBuildings ?? 0,
            primaryCoveredBuildings: stat?.primaryCoveredBuildings ?? 0,
          };
        });

        const newlyCoveredBuildings: NewlyCoveredBuildingExportItem[] = [];
        for (const [buildingId, cached] of buildingScoreCache) {
          if (cached.info.customStopImprovement?.isNewlyCovered) {
            const imp = cached.info.customStopImprovement;
            newlyCoveredBuildings.push({
              buildingId,
              lat: cached.baseInfo.lat,
              lng: cached.baseInfo.lng,
              usage: cached.baseInfo.usage,
              totalFloorArea: cached.baseInfo.totalFloorArea,
              assignedStopLabel: imp.stopLabel,
              originalNearestStopName: cached.baseInfo.nearestStopName,
              beforeBusEffectiveDistanceMeters: cached.baseInfo.busEffectiveDistanceMeters,
              afterBusEffectiveDistanceMeters: imp.afterBusEffectiveDistanceMeters,
              beforeBusWalkMinutes: cached.baseInfo.busWalkMinutes,
              afterBusWalkMinutes: imp.afterBusWalkMinutes,
              walkProfileLabel: cached.baseInfo.walkProfileLabel,
            });
          }
        }

        const geoJson = buildCustomStopSimulationGeoJson({
          stops: stopExportItems,
          newlyCoveredBuildings,
        });

        const jsonStr = JSON.stringify(geoJson, null, 2);
        const blob = new Blob([jsonStr], { type: "application/geo+json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        a.href = url;
        a.download = `plateau_simulation_${timestamp}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      removeCustomStopRef.current = removeCustomStop;
      undoLastCustomStopRef.current = undoLastCustomStop;
      clearCustomStopsRef.current = clearCustomStops;
      flyToCustomStopRef.current = flyToCustomStop;
      reapplyCustomStopScoresRef.current = reapplyCustomStopScoresToBuildings;
      exportCustomStopSimulationGeoJsonRef.current = exportCustomStopSimulationGeoJson;

      function exportMobilityHubSimulationGeoJson() {
        const activeHubs = MOBILITY_HUB_CANDIDATES.filter((h) =>
          activeMobilityHubIdsRef.current.includes(h.id)
        );
        const records: MobilityHubBuildingRecord[] = [];
        for (const [buildingId, cached] of buildingScoreCache.entries()) {
          records.push({
            buildingId,
            lat: cached.baseInfo.lat,
            lng: cached.baseInfo.lng,
            baseCoverageRatio: cached.baseInfo.coverageRatio,
            totalFloorArea: cached.baseInfo.totalFloorArea,
            baseBusEffectiveDistanceMeters: cached.baseInfo.busEffectiveDistanceMeters,
            usage: cached.baseInfo.usage,
          });
        }
        const minMeters = mobilityHubMinMetersRef.current;
        const maxMeters = mobilityHubMaxMetersRef.current;
        const modeKey = mobilityHubModeRef.current;
        const modeDef = MOBILITY_HUB_MODES.find((m) => m.id === modeKey);
        const modeLabel = modeDef?.label ?? "自由設定";

        const hubConfigs = new Map<number, MobilityHubSiteConfig>();
        for (const hub of activeHubs) {
          const hMode = hubModesRef.current[hub.id] ?? modeKey;
          const hDef = MOBILITY_HUB_MODES.find((m) => m.id === hMode);
          const hMin = hMode === "custom" ? minMeters : (hDef?.minMeters ?? minMeters);
          const hMax = hMode === "custom" ? maxMeters : (hDef?.maxMeters ?? maxMeters);
          hubConfigs.set(hub.id, {
            hubId: hub.id,
            mode: hMode,
            minDistanceMeters: hMin,
            maxDistanceMeters: hMax,
          });
        }

        const { outcomes } = evaluateMobilityHubSimulation(
          records,
          activeHubs,
          minMeters,
          maxMeters,
          modeKey,
          hubConfigs
        );

        const coveredBuildings: MobilityHubCoveredBuildingExportItem[] = [];
        for (const r of records) {
          const outcome = outcomes.get(r.buildingId);
          if (outcome && outcome.isCoveredByHub && outcome.nearestHubName != null) {
            coveredBuildings.push({
              buildingId: r.buildingId,
              lat: r.lat,
              lng: r.lng,
              usage: r.usage,
              totalFloorArea: r.totalFloorArea,
              nearestHubName: outcome.nearestHubName,
              hubDistanceMeters: outcome.hubDistanceMeters,
              originalBusDistanceMeters: r.baseBusEffectiveDistanceMeters,
              appliedModeLabel: outcome.modeLabel,
            });
          }
        }

        const geoJson = buildMobilityHubSimulationGeoJson({
          hubs: activeHubs,
          modeLabel,
          minDistanceMeters: minMeters,
          maxDistanceMeters: maxMeters,
          coveredBuildings,
        });

        const jsonStr = JSON.stringify(geoJson, null, 2);
        const blob = new Blob([jsonStr], { type: "application/geo+json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        a.href = url;
        a.download = `mobility_hub_simulation_${modeKey}_${minMeters}m-${maxMeters}m_${timestamp}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      function flyToMobilityHub(hubId: number) {
        const hub = MOBILITY_HUB_CANDIDATES.find((h) => h.id === hubId);
        if (!hub) return;
        const center = Cesium.Cartesian3.fromDegrees(hub.lng, hub.lat);
        viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 700), {
          offset: new Cesium.HeadingPitchRange(
            viewer.camera.heading,
            Cesium.Math.toRadians(-35),
            1000
          ),
          duration: 1.0,
        });
      }

      reapplyMobilityHubScoresRef.current = reapplyMobilityHubScoresToBuildings;
      flyToMobilityHubRef.current = flyToMobilityHub;
      exportMobilityHubGeoJsonRef.current = exportMobilityHubSimulationGeoJson;

      type DemandTransitCandidate = {
        entity: Cesium.Entity;
        centroidLat: number;
        centroidLng: number;
        members: DemandTransitMember[];
        estimatedAfter?: number;
      };
      let demandTransitCandidates: DemandTransitCandidate[] = [];
      let demandTransitAnalysisMembers: DemandTransitMember[] | null = null;
      let demandTransitAnalysisSites: DemandTransitPlanSite[] | null = null;
      let demandTransitRecomputeTimer: ReturnType<typeof setTimeout> | null = null;

      const demandTransitIconUrl = createSquareIconDataUrl(DEMAND_TRANSIT_COLOR);

      function recomputeDemandTransitCandidates() {
        if (cancelled) return;
        ++popupRequestRef.current;
        if (candidatePopupRef.current) { setPopup(null); candidatePopupRef.current = false; }
        const gapBuildings: DemandTransitMember[] = demandTransitAnalysisMembers
          ? demandTransitAnalysisMembers
          : [];
        if (!demandTransitAnalysisMembers) {
          for (const { baseInfo } of buildingScoreCache.values()) {
            if (baseInfo.coverageRatio > DEMAND_TRANSIT_GAP_RATIO_THRESHOLD) {
              gapBuildings.push({
                lat: baseInfo.lat,
                lng: baseInfo.lng,
                busStraightDistanceMeters: baseInfo.busStraightDistanceMeters,
                busEffectiveDistanceMeters: baseInfo.busEffectiveDistanceMeters,
                stationEffectiveDistanceMeters: baseInfo.stationEffectiveDistanceMeters,
                coverageRatio: baseInfo.coverageRatio,
              });
            }
          }
        }

        for (const candidate of demandTransitCandidates) {
          viewer.entities.remove(candidate.entity);
        }
        demandTransitCandidates = [];

        if (!SHOW_AUTO_CANDIDATE_AND_COMPARISON_UI) return;
        if (gapBuildings.length < DEMAND_TRANSIT_MIN_BUILDINGS) return;

        const refLat = gapBuildings.reduce((sum, b) => sum + b.lat, 0) / gapBuildings.length;
        const refLng = gapBuildings.reduce((sum, b) => sum + b.lng, 0) / gapBuildings.length;
        const projected = gapBuildings.map((b) => projectToLocalMeters(b.lat, b.lng, refLat, refLng));
        let clusters: { centroid: [number, number]; indices: number[] }[];
        if (demandTransitAnalysisSites) {
          const selectedSites = demandTransitAnalysisSites.slice(0, demandTransitClusterCountRef.current);
          const sitePoints = selectedSites.map((site) => projectToLocalMeters(site.lat, site.lng, refLat, refLng));
          const indices = sitePoints.map(() => [] as number[]);
          projected.forEach((point, buildingIndex) => {
            let closestSite = 0;
            let closestDistance = Infinity;
            sitePoints.forEach((sitePoint, siteIndex) => {
              const dx = point[0] - sitePoint[0];
              const dy = point[1] - sitePoint[1];
              const distance = dx * dx + dy * dy;
              if (distance < closestDistance) {
                closestDistance = distance;
                closestSite = siteIndex;
              }
            });
            if (sitePoints.length > 0) indices[closestSite].push(buildingIndex);
          });
          clusters = sitePoints.map((centroid, index) => ({ centroid, indices: indices[index] }));
        } else {
          clusters = kMeans(projected, demandTransitClusterCountRef.current);
        }

        for (const [clusterIndex, cluster] of clusters.entries()) {
          const [centroidLat, centroidLng] = unprojectFromLocalMeters(
            cluster.centroid[0],
            cluster.centroid[1],
            refLat,
            refLng
          );
          const members = cluster.indices.map((i) => gapBuildings[i]);
          if (!members.length) continue;
          const entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(centroidLng, centroidLat),
            properties: { isDemandTransitCandidate: true },
            billboard: {
              image: demandTransitIconUrl,
              width: 22,
              height: 22,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          const distances = demandTransitAnalysisSites?.[clusterIndex]?.distances;
          const estimatedAfter = distances && members.length ? cluster.indices.reduce((sum,i) =>
            sum + Math.min(gapBuildings[i].busEffectiveDistanceMeters, distances[i]),0)/members.length : undefined;
          demandTransitCandidates.push({ entity, centroidLat, centroidLng, members, estimatedAfter });
        }
      }

      function scheduleDemandTransitRecompute() {
        if (demandTransitRecomputeTimer) clearTimeout(demandTransitRecomputeTimer);
        demandTransitRecomputeTimer = setTimeout(() => {
          demandTransitRecomputeTimer = null;
          recomputeDemandTransitCandidates();
        }, DEMAND_TRANSIT_RECOMPUTE_DEBOUNCE_MS);
      }
      scheduleDemandTransitRecomputeRef.current = scheduleDemandTransitRecompute;

      let networkScoresPromise: Promise<Map<string, BuildingNetworkScoreRow> | null> | null = null;
      async function ensureNetworkScoreMap(): Promise<Map<string, BuildingNetworkScoreRow> | null> {
        if (networkScoreMap) return networkScoreMap;
        if (networkScoresPromise) return networkScoresPromise;
        setLoadingNetworkScores(true);
        const scoresUrl = getCurrentAreaConfig().dataPaths.buildingNetworkScoresJsonUrl;
        networkScoresPromise = (async () => {
          try {
            const res = await fetch(scoresUrl);
            if (!res.ok) throw new Error(`network scores: ${res.status}`);
            const rows: BuildingNetworkScoreRow[] = await res.json();
            if (cancelled) return null;
            networkScoreMap = new Map(
              Array.isArray(rows) ? rows.map((row) => [row.buildingId, row]) : []
            );
            return networkScoreMap;
          } catch (error) {
            console.warn('道路網データの取得に失敗しました（ライブ迂回係数フォールバックを使用します）', error);
            networkScoreMap = new Map();
            return networkScoreMap;
          } finally {
            networkScoresPromise = null;
            if (!cancelled) setLoadingNetworkScores(false);
          }
        })();
        return networkScoresPromise;
      }

      let demandTransitAnalysisTimer: number | null = null;
      let demandTransitAnalysisRunId = 0;
      let analysisWorker: Worker | null = null;
      let analysisRequested = false;
      function runDemandTransitAnalysis(runId: number) {
        if (cancelled || runId !== demandTransitAnalysisRunId) return;
        analysisWorker?.terminate();
        setAnalysisError(null);
        const thresholdMultiplier = demandTransitAnalysisThresholdMultiplierRef.current;
        const areaConfig = getCurrentAreaConfig();
        const worker = new Worker(new URL('./workers/transit-analysis.worker.ts', import.meta.url));
        analysisWorker = worker;
        const fail = (message: string) => {
          if (cancelled || runId !== demandTransitAnalysisRunId) return;
          worker.terminate();
          analysisWorker = null;
          setAnalysisError(message);
          setIsDemandTransitAnalysisRunning(false);
          setDemandTransitPlanAnalysis(null);
          demandTransitAnalysisMembers = null;
          demandTransitAnalysisSites = null;
          scheduleDemandTransitRecompute();
        };
        worker.onerror = () => fail('比較処理に失敗しました。「比較グラフを表示」から再試行できます。');
        worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
          if (cancelled || runId !== demandTransitAnalysisRunId) return;
          const data = event.data;
          if ('error' in data) { fail(data.error); return; }
          worker.terminate();
          analysisWorker = null;
          demandTransitAnalysisMembers = data.members;
          demandTransitAnalysisSites = data.sites;
          if (!data.results.length) {
            setAnalysisError('この条件では比較対象の交通空白地がありません。');
            setDemandTransitPlanAnalysis(null);
          } else {
            setDemandTransitPlanAnalysis({
              targetBuildingCount: data.members.length,
              scopeLabel: `${areaConfig.name}全域（住宅系建物${data.total.toLocaleString()}棟）`,
              methodLabel: data.methodLabel,
              thresholdMultiplier,
              results: data.results,
            });
          }
          recomputeDemandTransitCandidates();
          setIsDemandTransitAnalysisRunning(false);
        };
        worker.postMessage({
          areaId: selectedAreaIdRef.current,
          profile: walkProfileRef.current,
          model: distanceModelRef.current,
          thresholdMultiplier,
          stops: majorOperatorStopList,
          stations: trainStationList,
        });
      }
      function scheduleDemandTransitAnalysis(delayMs = 450) {
        analysisRequested = true;
        analysisWorker?.terminate();
        analysisWorker = null;
        ++popupRequestRef.current;
        setPopup(null);
        demandTransitAnalysisRunId++;
        const scheduledRunId = demandTransitAnalysisRunId;
        if (demandTransitAnalysisTimer) window.clearTimeout(demandTransitAnalysisTimer);
        setIsDemandTransitAnalysisRunning(true);
        demandTransitAnalysisTimer = window.setTimeout(() => {
          demandTransitAnalysisTimer = null;
          void runDemandTransitAnalysis(scheduledRunId);
        }, delayMs);
      }
      scheduleDemandTransitAnalysisRef.current = scheduleDemandTransitAnalysis;

      async function processTile(tile: Cesium.Cesium3DTile, generation: number): Promise<boolean> {
        if (majorOperatorStopList.length === 0 || trainStationList.length === 0) return false;
        if (cancelled) return false;
        if (distanceModelRef.current === 'network' && !networkScoreMap) return false;
        const content = tile.content;
        const isCurrent = () => !cancelled && generation === tileWork.generation && tile.content === content;
        if (!content || content.featuresLength === 0) return true;
        loadedTiles.add(tile);

        const currentAreaId = selectedAreaIdRef.current;
        const areaConfig = getAreaConfig(currentAreaId);
        const profile = areaConfig.slopeParams.walkProfiles[walkProfileRef.current];

        type Candidate = {
          feature: Cesium.Cesium3DTileFeature;
          buildingId: string;
          lng: number;
          lat: number;
          usage: string;
          totalFloorArea: number | null;
        };
        const candidates: Candidate[] = [];

        for (let i = 0; i < content.featuresLength; i++) {
          const feature = content.getFeature(i);
          const usage = extractResidentialUsage(feature);
          if (!usage) continue;
          const lng = feature.getProperty("_x") as number | undefined;
          const lat = feature.getProperty("_y") as number | undefined;
          if (typeof lng !== "number" || typeof lat !== "number") continue;
          if (!isInsideAreaEvaluationBBox(currentAreaId, lng, lat)) continue;

          const buildingId =
            (feature.getProperty("uro:BuildingIDAttribute_uro:buildingID") as string | undefined) ??
            `${lng},${lat}`;

          const cached = buildingScoreCache.get(buildingId);
          if (cached) {
            feature.color = cached.color;
            featureScoreMap.set(feature, cached.info);
            continue;
          }
          feature.color = Cesium.Color.WHITE;
          featureScoreMap.delete(feature);
          if (buildingScoreCache.size + candidates.length >= MAX_SCORED_BUILDINGS) continue;

          const totalFloorArea = feature.getProperty(
            "uro:BuildingDetailAttribute_uro:totalFloorArea"
          ) as number | null | undefined;
          candidates.push({ feature, buildingId, lng, lat, usage, totalFloorArea: totalFloorArea ?? null });
        }

        if (candidates.length === 0) return true;

        function recordScore(feature: Cesium.Cesium3DTileFeature, buildingId: string, info: BuildingScoreInfo) {
          if (!isCurrent()) return;
          const color = colorForCoverageRatio(info.coverageRatio);
          feature.color = color;
          buildingScoreCache.set(buildingId, { baseColor: color, baseInfo: info, color, info });
          featureScoreMap.set(feature, info);
        }

        let liveCandidates = candidates;
        if (distanceModelRef.current === "network" && networkScoreMap) {
          liveCandidates = [];
          for (const c of candidates) {
            const row = networkScoreMap.get(c.buildingId);
            if (!row) {
              liveCandidates.push(c);
              continue;
            }
            const busEff =
              walkProfileRef.current === "general" ? row.busEffectiveDistanceM_general : row.busEffectiveDistanceM_elderly;
            const stationEff =
              walkProfileRef.current === "general"
                ? row.stationEffectiveDistanceM_general
                : row.stationEffectiveDistanceM_elderly;
            const multiplier = networkThresholdMultiplierRef.current;
            const coverageRatio = Math.min(
              busEff / (BUS_COVERAGE_THRESHOLD_METERS * multiplier),
              stationEff / (STATION_COVERAGE_THRESHOLD_METERS * multiplier)
            );
            const info: BuildingScoreInfo = {
              usage: c.usage,
              lat: c.lat,
              lng: c.lng,
              nearestStopName: row[`nearestStopName_${walkProfileRef.current}`],
              busStraightDistanceMeters: walkProfileRef.current === "general" ? row.busNetworkDistanceM : row.busNetworkDistanceM_elderly,
              busEffectiveDistanceMeters: busEff,
              busWalkMinutes: busEff / profile.walkSpeedMPerMin,
              nearestStationName: row[`nearestStationName_${walkProfileRef.current}`],
              stationStraightDistanceMeters: walkProfileRef.current === "general" ? row.stationNetworkDistanceM : row.stationNetworkDistanceM_elderly,
              stationEffectiveDistanceMeters: stationEff,
              stationWalkMinutes: stationEff / profile.walkSpeedMPerMin,
              coverageRatio,
              isCovered: coverageRatio <= 1,
              totalFloorArea: c.totalFloorArea,
              walkProfileLabel: `${profile.label}（道路網距離モデル）`,
            };
            recordScore(c.feature, c.buildingId, info);
          }
        }

        if (liveCandidates.length === 0) {
          viewer.scene.requestRender();
          scheduleDemandTransitRecompute();
          scheduleCustomStopEvaluation();
          scheduleMobilityHubSimulation();
          return true;
        }

        const withNearest = liveCandidates.map((c) => {
          let bestStop: BusStop | null = null;
          let bestStopDist = Infinity;
          for (const stop of majorOperatorStopList) {
            const d = haversineMeters(c.lat, c.lng, stop.lat, stop.lng);
            if (d < bestStopDist) {
              bestStopDist = d;
              bestStop = stop;
            }
          }
          let bestStation: TrainStation | null = null;
          let bestStationDist = Infinity;
          for (const station of trainStationList) {
            const d = haversineMeters(c.lat, c.lng, station.lat, station.lng);
            if (d < bestStationDist) {
              bestStationDist = d;
              bestStation = station;
            }
          }
          return { ...c, nearestStop: bestStop as BusStop, nearestStation: bestStation as TrainStation };
        });

        let results: EffectiveDistanceResult[];
        try {
          const busPairs = withNearest.map((c) => ({
            originLat: c.lat,
            originLng: c.lng,
            destLat: c.nearestStop.lat,
            destLng: c.nearestStop.lng,
          }));
          const stationPairs = withNearest.map((c) => ({
            originLat: c.lat,
            originLng: c.lng,
            destLat: c.nearestStation.lat,
            destLng: c.nearestStation.lng,
          }));
          results = await computeEffectiveDistances(
            terrainProvider,
            [...busPairs, ...stationPairs],
            profile.slopePenaltyFactor,
            profile.uphillDistanceMultiplier,
            profile.downhillDistanceMultiplier,
            areaConfig.slopeParams.gradientCap
          );
        } catch (err) {
          console.warn(
            "傾斜計算用の地形サンプリングに失敗しました。このタイルの建物群はスコア計算をスキップします。",
            err
          );
          return false;
        }
        if (!isCurrent()) return false;

        const n = withNearest.length;
        const isNetworkMode = distanceModelRef.current === "network";
        const detourMultiplier = isNetworkMode ? areaConfig.slopeParams.roadNetworkDetourFactor : 1;
        const thresholdMultiplier = isNetworkMode ? networkThresholdMultiplierRef.current : 1;
        withNearest.forEach((c, idx) => {
          const rawBusStraight = results[idx].straightDistanceMeters;
          const rawBusEff = results[idx].effectiveDistanceMeters;
          const rawStationStraight = results[n + idx].straightDistanceMeters;
          const rawStationEff = results[n + idx].effectiveDistanceMeters;

          const busStraightDistanceMeters = rawBusStraight * detourMultiplier;
          const busEffectiveDistanceMeters = rawBusEff * detourMultiplier;
          const stationStraightDistanceMeters = rawStationStraight * detourMultiplier;
          const stationEffectiveDistanceMeters = rawStationEff * detourMultiplier;

          const busWalkMinutes = busEffectiveDistanceMeters / profile.walkSpeedMPerMin;
          const stationWalkMinutes = stationEffectiveDistanceMeters / profile.walkSpeedMPerMin;
          const coverageRatio = Math.min(
            busEffectiveDistanceMeters / (BUS_COVERAGE_THRESHOLD_METERS * thresholdMultiplier),
            stationEffectiveDistanceMeters / (STATION_COVERAGE_THRESHOLD_METERS * thresholdMultiplier)
          );
          const isCovered = coverageRatio <= 1;
          const info: BuildingScoreInfo = {
            usage: c.usage,
            lat: c.lat,
            lng: c.lng,
            nearestStopName: c.nearestStop.name,
            busStraightDistanceMeters,
            busEffectiveDistanceMeters,
            busWalkMinutes,
            nearestStationName: c.nearestStation.name,
            stationStraightDistanceMeters,
            stationEffectiveDistanceMeters,
            stationWalkMinutes,
            coverageRatio,
            isCovered,
            totalFloorArea: c.totalFloorArea,
            walkProfileLabel: isNetworkMode
              ? `${profile.label}（道路網距離モデル）`
              : profile.label,
          };
          recordScore(c.feature, c.buildingId, info);
        });

        viewer.scene.requestRender();
        scheduleDemandTransitRecompute();
        scheduleCustomStopEvaluation();
        scheduleMobilityHubSimulation();
        return true;
      }

      function processTileIfNeeded(tile: Cesium.Cesium3DTile) {
        if (cancelled) return;
        void tileWork.run(tile, generation => processTile(tile, generation));
      }

      function invalidateScores() {
        const generation = tileWork.invalidate();
        buildingScoreCache.clear();
        featureScoreMap = new WeakMap();
        loadedTiles.clear();
        ++customStopEvalGeneration;
        for (const stop of customStops) {
          stop.buildingDistances.clear();
          stop.evaluatedBuildingIds.clear();
          delete stop.routedNodeDistances;
        }
        ++popupRequestRef.current;
        setPopup(null);
        demandTransitAnalysisMembers = null;
        demandTransitAnalysisSites = null;
        scheduleDemandTransitRecompute();
        scheduleMobilityHubSimulation();
        if (analysisRequested) scheduleDemandTransitAnalysis();
        return generation;
      }

      async function loadAreaResources(areaId: AreaId, isInitialLoad: boolean) {
        const loadGen = ++areaLoadGeneration;
        selectedAreaIdRef.current = areaId;
        const areaConfig = getAreaConfig(areaId);

        // 既存エリアのリソース・キャッシュをクリーンアップ
        removeLoad?.();
        removeVisible?.();
        removeUnload?.();
        removeLoad = undefined;
        removeVisible = undefined;
        removeUnload = undefined;
        if (currentTileset) {
          viewer.scene.primitives.remove(currentTileset);
          currentTileset = undefined;
        }
        for (const entity of areaEntities) {
          viewer.entities.remove(entity);
        }
        areaEntities = [];
        for (const ds of areaDataSources) {
          viewer.dataSources.remove(ds, true);
        }
        areaDataSources = [];
        clearCustomStops();
        networkScoreMap = null;
        networkScoresPromise = null;
        routingGraphCache = null;
        routingGraphPromise = null;
        invalidateScores();
        setAnalysisError(null);

        // カメラを対象エリアの初期視点へ移動
        const view = areaConfig.initialView;
        const center = Cesium.Cartesian3.fromDegrees(view.centerLng, view.centerLat);
        const sphere = new Cesium.BoundingSphere(center, view.radiusMeters);
        viewer.camera.flyToBoundingSphere(sphere, {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(view.headingDeg),
            Cesium.Math.toRadians(view.pitchDeg),
            view.altitudeMeters
          ),
          duration: isInitialLoad ? 0 : 1.2,
        });

        const fallbackNotes: string[] = [];

        // 1. 道路ネットワーク GeoJSON 読み込み（未配置・空配列時は安全にフォールバック）
        try {
          const roadRes = await fetch(areaConfig.dataPaths.roadNetworkGeoJsonUrl);
          if (roadRes.ok) {
            const roadData = await roadRes.json();
            if (cancelled || loadGen !== areaLoadGeneration) return;
            if (!Array.isArray(roadData?.features) || roadData.features.length === 0) {
              fallbackNotes.push("道路網GeoJSON未配置（傾斜・迂回係数で評価中）");
            }
          } else {
            fallbackNotes.push("道路網GeoJSON読み込み待ち");
          }
        } catch {
          if (cancelled || loadGen !== areaLoadGeneration) return;
          fallbackNotes.push("道路網GeoJSON読み込み待ち");
        }

        // 2. 停留所・鉄道駅データの読み込み（統合ファイル、個別ファイル双方から網羅的に読み込みマージ）
        const stopMap = new Map<string, BusStop>();
        const stationMap = new Map<string, TrainStation>();
        const defaultOp = areaId === "kure_miyahara" ? "広電バス" : "広島交通";

        const mergeParsed = (parsedStops: BusStop[], parsedStations: TrainStation[]) => {
          for (const s of parsedStops) {
            const key = `${s.name}_${s.lat.toFixed(5)}_${s.lng.toFixed(5)}`;
            if (!stopMap.has(key)) stopMap.set(key, s);
          }
          for (const st of parsedStations) {
            const key = `${st.name}_${st.lat.toFixed(5)}_${st.lng.toFixed(5)}`;
            if (!stationMap.has(key)) stationMap.set(key, st);
          }
        };

        // 2-a. バス停個別GeoJSON
        try {
          const res = await fetch(areaConfig.dataPaths.busStopsGeoJsonUrl);
          if (res.ok) {
            const data = await res.json();
            if (cancelled || loadGen !== areaLoadGeneration) return;
            if (Array.isArray(data?.features)) {
              const { parsedStops, parsedStations } = parseTransitGeoJsonFeatures(data.features, defaultOp);
              mergeParsed(parsedStops, parsedStations);
            } else if (Array.isArray(data?.busStops)) {
              mergeParsed(data.busStops, []);
            }
          }
        } catch (err) {
          console.warn("バス停GeoJSONの読み込みをスキップしました", err);
        }

        // 2-b. 鉄道駅個別GeoJSON
        try {
          const res = await fetch(areaConfig.dataPaths.stationsGeoJsonUrl);
          if (res.ok) {
            const data = await res.json();
            if (cancelled || loadGen !== areaLoadGeneration) return;
            if (Array.isArray(data?.features)) {
              const { parsedStops, parsedStations } = parseTransitGeoJsonFeatures(data.features, defaultOp);
              mergeParsed(parsedStops, parsedStations);
            } else if (Array.isArray(data?.stations)) {
              mergeParsed([], data.stations);
            }
          }
        } catch (err) {
          console.warn("鉄道駅GeoJSONの読み込みをスキップしました", err);
        }

        // 2-c. 統合交通施設GeoJSON
        try {
          const res = await fetch(areaConfig.dataPaths.transitFacilitiesGeoJsonUrl);
          if (res.ok) {
            const geojson = await res.json();
            if (cancelled || loadGen !== areaLoadGeneration) return;
            const features = Array.isArray(geojson?.features) ? geojson.features : [];
            const { parsedStops, parsedStations } = parseTransitGeoJsonFeatures(features, defaultOp);
            mergeParsed(parsedStops, parsedStations);
          }
        } catch (err) {
          console.warn("統合交通施設GeoJSONの読み込みをスキップしました", err);
        }

        let nextBusStops = Array.from(stopMap.values());
        let nextStations = Array.from(stationMap.values());

        if (nextBusStops.length === 0) {
          nextBusStops =
            areaId === "kure_miyahara" ? DEFAULT_KURE_BUS_STOPS : DEFAULT_BISHAMONDAI_BUS_STOPS;
          fallbackNotes.push("バス停内蔵データ使用中");
        }
        if (nextStations.length === 0) {
          nextStations =
            areaId === "kure_miyahara" ? DEFAULT_KURE_STATIONS : DEFAULT_BISHAMONDAI_STATIONS;
        }

        busStopList = nextBusStops;
        trainStationList = nextStations;
        majorOperatorStopList = busStopList.filter((s) => isMajorOperatorStop(s, areaId));
        if (majorOperatorStopList.length === 0) {
          majorOperatorStopList = busStopList;
        }

        for (const stop of busStopList) {
          const position = Cesium.Cartesian3.fromDegrees(stop.lng, stop.lat);
          const isMajor = isMajorOperatorStop(stop, areaId);
          const entity = viewer.entities.add({
            name: stop.name,
            position,
            properties: {
              isBusStop: true,
              operator: stop.operator,
              routes: stop.routes,
              isMajorOperator: isMajor,
            },
            point: {
              pixelSize: isMajor ? BUS_STOP_PIXEL_SIZE : BUS_STOP_PIXEL_SIZE_MINOR,
              color: isMajor ? BUS_STOP_COLOR : BUS_STOP_COLOR_MINOR,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          areaEntities.push(entity);
        }

        for (const station of trainStationList) {
          const position = Cesium.Cartesian3.fromDegrees(station.lng, station.lat);
          const stationDisplayName = station.name.endsWith("駅")
            ? station.name
            : `${station.name}駅`;
          const defaultLine = areaId === "kure_miyahara" ? "JR呉線" : "アストラムライン";
          const entity = viewer.entities.add({
            name: stationDisplayName,
            position,
            properties: {
              isBusStop: true,
              operator: station.line ?? defaultLine,
              routes: [{ name: station.line ?? defaultLine, classCode: null }],
              isMajorOperator: true,
            },
            point: {
              pixelSize: 13,
              color: STATION_PIN_COLOR,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          areaEntities.push(entity);
        }

        if (distanceModelRef.current === "network") {
          await ensureNetworkScoreMap();
          if (cancelled || loadGen !== areaLoadGeneration) return;
        }

        // 3. PLATEAU 3D Tiles / ローカルメッシュ建物データの読み込み
        let loadedTileset: Cesium.Cesium3DTileset | undefined;
        for (const candidateUrl of [
          areaConfig.dataPaths.remoteBuildingTilesetUrl,
          ...areaConfig.dataPaths.localBuildingTilesetUrls,
        ]) {
          try {
            loadedTileset = await Cesium.Cesium3DTileset.fromUrl(candidateUrl);
            if (cancelled || loadGen !== areaLoadGeneration) return;
            loadedTileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.REPLACE;
            viewer.scene.primitives.add(loadedTileset);
            currentTileset = loadedTileset;
            break;
          } catch (err) {
            console.warn(`PLATEAU 建物3D Tiles (${candidateUrl}) の読み込みをスキップしました`, err);
          }
        }

        if (!loadedTileset) {
          fallbackNotes.push("建物3D Tilesデータ読み込み待ち");
        } else {
          removeLoad = loadedTileset.tileLoad.addEventListener(processTileIfNeeded);
          removeVisible = loadedTileset.tileVisible.addEventListener(processTileIfNeeded);
          removeUnload = loadedTileset.tileUnload.addEventListener((tile) => {
            loadedTiles.delete(tile);
            tileWork.forget(tile);
          });
        }

        for (const meshGeoJsonUrl of areaConfig.dataPaths.localBuildingGeoJsonUrls) {
          try {
            const meshRes = await fetch(meshGeoJsonUrl);
            if (!meshRes.ok) continue;
            const meshGeoJson = await meshRes.json();
            if (cancelled || loadGen !== areaLoadGeneration) return;
            if (Array.isArray(meshGeoJson?.features) && meshGeoJson.features.length > 0) {
              const bldgDataSource = await Cesium.GeoJsonDataSource.load(meshGeoJson, {
                clampToGround: true,
              });
              if (!cancelled && loadGen === areaLoadGeneration) {
                viewer.dataSources.add(bldgDataSource);
                areaDataSources.push(bldgDataSource);
              }
            }
          } catch (err) {
            console.warn(`ローカル建物GeoJSON (${meshGeoJsonUrl}) の読み込みをスキップしました`, err);
          }
        }

        // 4. 地名ラベルの読み込み
        try {
          const res = await fetch(areaConfig.dataPaths.placeLabelsJsonUrl);
          if (res.ok) {
            const data: { places: PlaceLabel[] } = await res.json();
            if (cancelled || loadGen !== areaLoadGeneration) return;
            for (const place of Array.isArray(data?.places) ? data.places : []) {
              const entity = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(place.lng, place.lat),
                label: {
                  text: place.name,
                  font: "bold 16px sans-serif",
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: Cesium.VerticalOrigin.TOP,
                  pixelOffset: new Cesium.Cartesian2(0, 18),
                  heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
              });
              areaEntities.push(entity);
            }
          }
        } catch (err) {
          console.warn("地名ラベルデータの読み込みをスキップしました", err);
        }

        // 5. 既存地域交通・乗合タクシーデータの読み込み
        try {
          const res = await fetch(areaConfig.dataPaths.existingDemandTransitJsonUrl);
          if (res.ok) {
            const data: { services: ExistingDemandTransitService[] } = await res.json();
            if (cancelled || loadGen !== areaLoadGeneration) return;
            const existingDemandTransitIconUrl = createCircleIconDataUrl(
              EXISTING_DEMAND_TRANSIT_COLOR.toCssColorString()
            );
            for (const service of Array.isArray(data?.services) ? data.services : []) {
              for (const stop of Array.isArray(service?.stops) ? service.stops : []) {
                const entity = viewer.entities.add({
                  name: `${service.name}（${stop.name}）`,
                  position: Cesium.Cartesian3.fromDegrees(stop.lng, stop.lat),
                  properties: { isExistingDemandTransit: true, service, stopName: stop.name },
                  billboard: {
                    image: existingDemandTransitIconUrl,
                    width: 20,
                    height: 20,
                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  },
                });
                areaEntities.push(entity);
              }
            }
          }
        } catch (err) {
          console.warn("既存デマンド交通データの読み込みをスキップしました", err);
        }

        if (!cancelled && loadGen === areaLoadGeneration) {
          setAreaDataStatusNote(
            fallbackNotes.length > 0 ? `※ ${fallbackNotes.join(" / ")}` : null
          );
          setCenterLoading(null);
          viewer.scene.requestRender();
        }
      }

      applyAreaChangeRef.current = (nextAreaId: AreaId) => {
        void loadAreaResources(nextAreaId, false);
      };

      async function applyWalkProfile(profile: WalkProfile) {
        walkProfileRef.current = profile;
        const generation = invalidateScores();
        viewer.scene.requestRender();
        await new Promise<void>(resolve => window.setTimeout(resolve, 800));
        if (!cancelled && generation === tileWork.generation) setCenterLoading(null);
      }
      applyWalkProfileRef.current = profile => { void applyWalkProfile(profile); };
      async function applyDistanceModel(model: DistanceModel) {
        distanceModelRef.current = model;
        if (model === 'network') {
          await ensureNetworkScoreMap();
          if (cancelled || distanceModelRef.current !== model) return;
        }
        const generation = invalidateScores();
        viewer.scene.requestRender();
        await new Promise<void>(resolve => window.setTimeout(resolve, 600));
        if (!cancelled && generation === tileWork.generation && distanceModelRef.current === model) setCenterLoading(null);
      }
      applyDistanceModelRef.current = model => { void applyDistanceModel(model); };
      applyNetworkThresholdMultiplierRef.current = multiplier => {
        networkThresholdMultiplierRef.current = multiplier;
        invalidateScores();
        viewer.scene.requestRender();
      };
      disposeRuntime = () => {
        removeLoad?.(); removeVisible?.(); removeUnload?.();
        clickHandler.destroy();
        analysisWorker?.terminate();
        if (demandTransitRecomputeTimer) clearTimeout(demandTransitRecomputeTimer);
        if (demandTransitAnalysisTimer) clearTimeout(demandTransitAnalysisTimer);
        if (customStopEvalTimer) clearTimeout(customStopEvalTimer);
        if (mobilityHubSimulationTimer) clearTimeout(mobilityHubSimulationTimer);
        tileWork.invalidate();
      };

      const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        ++popupRequestRef.current;
        candidatePopupRef.current = false;
        const picked = viewer.scene.pick(movement.position);
        const entity = picked?.id;

        if (entity instanceof Cesium.Entity && entity.properties?.isCustomStop?.getValue()) {
          const customStopId: number = entity.properties.customStopId?.getValue();
          const stop = customStops.find((s) => s.id === customStopId);
          if (!stop) {
            setPopup(null);
            return;
          }
          const requestId = ++popupRequestRef.current;
          const effectiveMultiplier =
            distanceModelRef.current === "network"
              ? networkThresholdMultiplierRef.current
              : demandTransitAnalysisThresholdMultiplierRef.current;
          const busThreshold = BUS_COVERAGE_THRESHOLD_METERS * effectiveMultiplier;
          let standaloneCount = 0;
          for (const [buildingId, dist] of stop.buildingDistances.entries()) {
            const cached = buildingScoreCache.get(buildingId);
            if (cached && cached.baseInfo.coverageRatio > 1 && dist <= busThreshold) {
              standaloneCount++;
            }
          }
          let areaNameText = "取得中…";
          const buildCustomStopLines = (): ReactNode[] => [
            `推定地区名: ${areaNameText}`,
            <span key="cov">
              単独でカバー圏内に入る空白地建物:{" "}
              <b style={{ color: "#38bdf8" }}>{standaloneCount}棟</b>
            </span>,
            <button
              key="del"
              type="button"
              onClick={() => removeCustomStop(stop.id)}
              style={{
                marginTop: 6,
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid rgba(248,113,113,0.6)",
                background: "rgba(127,29,29,0.55)",
                color: "#fecaca",
                cursor: "pointer",
              }}
            >
              この仮設停留所を削除
            </button>,
          ];
          setPopup({ title: `${stop.label}（自由配置）`, lines: buildCustomStopLines() });

          void (async () => {
            try {
              const res = await fetch(`/api/reverse-geocode?lat=${stop.lat}&lng=${stop.lng}`);
              if (!res.ok) throw new Error(`reverse-geocode API returned ${res.status}`);
              const data: { areaName: string | null } = await res.json();
              if (cancelled || requestId !== popupRequestRef.current) return;
              areaNameText = data.areaName ?? "不明";
              setPopup({ title: `${stop.label}（自由配置）`, lines: buildCustomStopLines() });
            } catch {
              if (cancelled || requestId !== popupRequestRef.current) return;
              areaNameText = "取得できませんでした";
              setPopup({ title: `${stop.label}（自由配置）`, lines: buildCustomStopLines() });
            }
          })();
          return;
        }

        if (isAddingCustomStopRef.current) {
          const groundPos = pickGroundLatLng(viewer, movement.position);
          if (groundPos) {
            void (async () => {
              try {
                const res = await fetch(
                  `/api/snap-road?lat=${groundPos.lat}&lng=${groundPos.lng}&area=${encodeURIComponent(
                    selectedAreaIdRef.current
                  )}&maxDistance=60`
                );
                if (!res.ok) {
                  addCustomStop(groundPos.lat, groundPos.lng);
                  return;
                }
                const data: {
                  snapped: boolean;
                  distanceMeters: number | null;
                  snappedTo: { lat: number; lng: number } | null;
                  areaNotSupported?: boolean;
                } = await res.json();

                if (data.areaNotSupported) {
                  addCustomStop(groundPos.lat, groundPos.lng);
                  return;
                }

                if (data.snapped && data.snappedTo) {
                  addCustomStop(data.snappedTo.lat, data.snappedTo.lng);
                  if (typeof data.distanceMeters === "number" && data.distanceMeters >= 3) {
                    showRoadSnapNoticeRef.current(
                      `最寄りの道路（${data.distanceMeters}m）に自動吸着して配置しました`
                    );
                  } else {
                    showRoadSnapNoticeRef.current("道路上に停留所を配置しました");
                  }
                } else {
                  const distInfo =
                    typeof data.distanceMeters === "number"
                      ? `（道路から約${data.distanceMeters}m）`
                      : "";
                  showRoadSnapNoticeRef.current(
                    `道路がない場所には配置できません${distInfo}。道路沿いをクリックしてください`,
                    true
                  );
                }
              } catch {
                addCustomStop(groundPos.lat, groundPos.lng);
              }
            })();
          }
          return;
        }

        if (entity instanceof Cesium.Entity && entity.properties?.isBusStop?.getValue()) {
          const operator: string = entity.properties.operator?.getValue();
          const routes: BusRoute[] = entity.properties.routes?.getValue() ?? [];
          const lines = [`事業者: ${operator}`];
          if (routes.length > 0) {
            lines.push(`系統: ${routes.map((r) => r.name).join("、")}`);
          }
          setPopup({ title: entity.name ?? "バス停", lines });
        } else if (entity instanceof Cesium.Entity && entity.properties?.isDemandTransitCandidate?.getValue()) {
          const candidate = demandTransitCandidates.find((c) => c.entity === entity);
          if (!candidate) {
            setPopup(null);
          } else {
            candidatePopupRef.current = true;
            const requestId = ++popupRequestRef.current;
            const avgCurrentDistance =
              candidate.members.reduce((sum, m) => sum + m.busEffectiveDistanceMeters, 0) / candidate.members.length;

            let areaNameText = "取得中…";
            let newDistanceLine = "新設した場合の推定実効距離: 計算中…";
            const buildLines = () => [
              `推定地区名: ${areaNameText}`,
              `対象建物数: ${candidate.members.length}棟`,
              `現状の平均実効距離（バス基準）: 約${Math.round(avgCurrentDistance)}m`,
              newDistanceLine,
            ];

            setPopup({ title: "デマンド交通 乗り場候補", lines: buildLines() });

            void (async () => {
              try {
                const res = await fetch(
                  `/api/reverse-geocode?lat=${candidate.centroidLat}&lng=${candidate.centroidLng}`
                );
                if (!res.ok) throw new Error(`reverse-geocode API returned ${res.status}`);
                const data: { areaName: string | null } = await res.json();
                if (cancelled || requestId !== popupRequestRef.current) return;
                areaNameText = data.areaName ?? "不明";
                setPopup({ title: "デマンド交通 乗り場候補", lines: buildLines() });
              } catch (err) {
                console.warn("デマンド交通乗り場候補の地区名取得に失敗しました", err);
                if (cancelled || requestId !== popupRequestRef.current) return;
                areaNameText = "取得できませんでした";
                setPopup({ title: "デマンド交通 乗り場候補", lines: buildLines() });
              }
            })();

            void (async () => {
              try {
                if (candidate.estimatedAfter !== undefined) {
                  newDistanceLine = `新設後の平均実効距離（比較と同じ計算）: 約${Math.round(candidate.estimatedAfter)}m`;
                  if (!cancelled && requestId === popupRequestRef.current) setPopup({ title: "デマンド交通 乗り場候補", lines: buildLines() });
                  return;
                }
                if (distanceModelRef.current === "network") {
                  newDistanceLine = "道路網での効果は「比較グラフを表示」で計算してください";
                  if (!cancelled && requestId === popupRequestRef.current) setPopup({ title: "デマンド交通 乗り場候補", lines: buildLines() });
                  return;
                }
                const currentProfile = getCurrentWalkProfile();
                const currentAreaConfig = getCurrentAreaConfig();
                const results = await computeEffectiveDistances(
                  terrainProvider,
                  candidate.members.map((m) => ({
                    originLat: m.lat,
                    originLng: m.lng,
                    destLat: candidate.centroidLat,
                    destLng: candidate.centroidLng,
                  })),
                  currentProfile.slopePenaltyFactor,
                  currentProfile.uphillDistanceMultiplier,
                  currentProfile.downhillDistanceMultiplier,
                  currentAreaConfig.slopeParams.gradientCap
                );
                if (cancelled || requestId !== popupRequestRef.current) return;
                const avgNewDistance =
                  results.reduce((sum, r, i) => sum + Math.min(candidate.members[i].busEffectiveDistanceMeters, r.effectiveDistanceMeters), 0) / results.length;
                newDistanceLine = `新設した場合の推定実効距離: 約${Math.round(avgNewDistance)}m`;
                setPopup({ title: "デマンド交通 乗り場候補", lines: buildLines() });
              } catch (err) {
                console.warn("デマンド交通乗り場候補の再計算に失敗しました", err);
                if (cancelled || requestId !== popupRequestRef.current) return;
                newDistanceLine = "新設した場合の推定実効距離: 計算に失敗しました";
                setPopup({ title: "デマンド交通 乗り場候補", lines: buildLines() });
              }
            })();
          }
        } else if (entity instanceof Cesium.Entity && entity.properties?.isExistingDemandTransit?.getValue()) {
          const service: ExistingDemandTransitService = entity.properties.service.getValue();
          const stopName: string = entity.properties.stopName.getValue();
          setPopup({
            title: `${service.name}（${stopName}）`,
            lines: [
              `種別: ${service.type}`,
              `事業者: ${service.operator}`,
              `運行開始: ${service.startDate}`,
              service.description,
              <a key="src" href={service.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>
                公式情報ページ
              </a>,
            ],
          });
        } else if (entity instanceof Cesium.Entity && entity.properties?.isHelloCyclingStation?.getValue()) {
          const capacity: number | null = entity.properties.capacity?.getValue() ?? null;
          setPopup({
            title: entity.name ?? "ハローサイクリング ステーション",
            lines: [...(capacity != null ? [`収容可能台数: ${capacity}台`] : [])],
          });
        } else if (entity instanceof Cesium.Entity && entity.properties?.isMobilityHub?.getValue()) {
          const hub: MobilityHubSite = entity.properties.hubData.getValue();
          const hubMode = hubModesRef.current[hub.id] ?? mobilityHubModeRef.current;
          const modeDef = MOBILITY_HUB_MODES.find((m) => m.id === hubMode);
          const stat = mobilityHubSummaryRef.current?.perHubStats.find((s: { hubId: number }) => s.hubId === hub.id);
          const hubMin = stat?.minMeters ?? (hubMode === "custom" ? mobilityHubMinMetersRef.current : (modeDef?.minMeters ?? 400));
          const hubMax = stat?.maxMeters ?? (hubMode === "custom" ? mobilityHubMaxMetersRef.current : (modeDef?.maxMeters ?? 1500));
          setPopup({
            title: `モビリティ・ハブ検討候補地 H${hub.id}`,
            lines: [
              `名称: ${hub.name}`,
              `所在地: ${hub.address}`,
              <span key="note" style={{ color: "#fcd34d", fontSize: 11 }}>
                ※広島市安佐南区 毘沙門台エリアの施策検討候補地
              </span>,
              `設定モード: ${modeDef?.label ?? "自由設定"}（${hubMin}m〜${hubMax >= 1000 ? `${hubMax / 1000}km` : `${hubMax}m`}）`,
              ...(stat
                ? [
                    <span key="stat" style={{ color: "#fbbf24", fontWeight: "bold" }}>
                      単独救済建物: {stat.coveredBuildings}棟
                    </span>,
                  ]
                : []),
              `座標: 北緯${hub.lat.toFixed(6)}, 東経${hub.lng.toFixed(6)}`,
            ],
          });
        } else if (picked instanceof Cesium.Cesium3DTileFeature) {
          const info = featureScoreMap.get(picked);
          if (info) {
            const hubImp = info.mobilityHubImprovement;
            const imp = info.customStopImprovement;
            const statusNode: ReactNode = hubImp ? (
              <span key="status" style={{ color: "#f59e0b", fontWeight: "bold" }}>
                判定: モビリティ・ハブ救済（H{hubImp.hubId} {hubImp.hubName} の{hubImp.modeLabel}圏内）
              </span>
            ) : imp?.isNewlyCovered ? (
              <span key="status" style={{ color: "#38bdf8", fontWeight: "bold" }}>
                判定: 新規カバー（{imp.stopLabel} により空白地解消）
              </span>
            ) : (
              `判定: ${info.isCovered ? "カバーされている" : "交通空白地"}`
            );
            setPopup({
              title: info.usage,
              lines: [
                statusNode,
                ...(hubImp
                  ? [
                      <span key="hubImp" style={{ color: "#fbbf24" }}>
                        最寄りハブ: H{hubImp.hubId} {hubImp.hubName}（直線距離 約
                        {Math.round(hubImp.hubDistanceMeters)}m・{hubImp.modeLabel}）
                      </span>,
                    ]
                  : []),
                ...(imp
                  ? [
                      <span key="customStop" style={{ color: "#7dd3fc" }}>
                        最寄り仮設停留所: {imp.stopLabel}（実効距離 約
                        {Math.round(imp.afterBusEffectiveDistanceMeters)}m・徒歩
                        {Math.round(imp.afterBusWalkMinutes)}分）
                      </span>,
                    ]
                  : []),
                `既存最寄りバス停: ${info.nearestStopName}（実効距離 約${Math.round(info.busEffectiveDistanceMeters)}m・徒歩${Math.round(info.busWalkMinutes)}分）`,
                `最寄り鉄道駅: ${info.nearestStationName}（実効距離 約${Math.round(info.stationEffectiveDistanceMeters)}m・徒歩${Math.round(info.stationWalkMinutes)}分）`,
                ...(info.totalFloorArea != null ? [`延床面積: 約${Math.round(info.totalFloorArea)}m²`] : []),
                `プロファイル: ${info.walkProfileLabel}`,
              ],
            });
          } else {
            setPopup(null);
          }
        } else {
          setPopup(null);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // 初期対象エリア（デフォルト：広島市安佐南区 毘沙門台）のリソースおよびカメラを読み込む
      await loadAreaResources(selectedAreaIdRef.current, true);
    }

    init();

    return () => {
      cancelled = true;
      disposeRuntime();
      scheduleDemandTransitRecomputeRef.current = null;
      scheduleDemandTransitAnalysisRef.current = null;
      applyAreaChangeRef.current = null;
      applyWalkProfileRef.current = null;
      applyDistanceModelRef.current = null;
      applyNetworkThresholdMultiplierRef.current = null;
      removeCustomStopRef.current = null;
      undoLastCustomStopRef.current = null;
      clearCustomStopsRef.current = null;
      flyToCustomStopRef.current = null;
      reapplyCustomStopScoresRef.current = null;
      exportCustomStopSimulationGeoJsonRef.current = null;
      reapplyMobilityHubScoresRef.current = null;
      flyToMobilityHubRef.current = null;
      exportMobilityHubGeoJsonRef.current = null;
      helloCyclingEntitiesRef.current = [];
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          cursor: isAddingCustomStop ? "crosshair" : "default",
        }}
      />
      <Legend
        selectedAreaId={selectedAreaId}
        areaDataStatusNote={areaDataStatusNote}
        onAreaChange={(nextAreaId) => {
          if (nextAreaId === selectedAreaIdRef.current) return;
          const nextArea = getAreaConfig(nextAreaId);
          setSelectedAreaId(nextAreaId);
          selectedAreaIdRef.current = nextAreaId;
          setIsAddingCustomStop(false);
          isAddingCustomStopRef.current = false;
          setCenterLoading({
            title: `${nextArea.selectorLabel}へ切り替え中…`,
            subtitle: "カメラ移動・建物データ・交通施設データを更新しています",
          });
          applyAreaChangeRef.current?.(nextAreaId);
        }}
        clusterCount={demandTransitClusterCount}
        analysisThresholdMultiplier={demandTransitAnalysisThresholdMultiplier}
        showHelloCycling={showHelloCycling}
        walkProfile={walkProfile}
        distanceModel={distanceModel}
        loadingNetworkScores={loadingNetworkScores}
        networkThresholdMultiplier={networkThresholdMultiplier}
        showExperimentalDistanceModel={showExperimentalDistanceModel}
        onClusterCountChange={(value) => {
          demandTransitClusterCountRef.current = value;
          setDemandTransitClusterCount(value);
          scheduleDemandTransitRecomputeRef.current?.();
        }}
        onAnalysisThresholdMultiplierChange={(value) => {
          demandTransitAnalysisThresholdMultiplierRef.current = value;
          setDemandTransitAnalysisThresholdMultiplier(value);
          reapplyCustomStopScoresRef.current?.();
          if (demandTransitPlanAnalysis || isDemandTransitPanelVisible) {
            scheduleDemandTransitAnalysisRef.current?.();
          }
        }}
        onShowHelloCyclingChange={setShowHelloCycling}
        onWalkProfileChange={(value) => {
          setWalkProfile(value);
          const profileLabel = getAreaConfig(selectedAreaIdRef.current).slopeParams.walkProfiles[value].label;
          setCenterLoading({
            title: `${profileLabel}を反映中…`,
            subtitle: "建物の坂道負荷・歩行速度を再計算しています",
          });
          applyWalkProfileRef.current?.(value);
        }}
        onDistanceModelChange={(value) => {
          setDistanceModel(value);
          setCenterLoading({
            title: value === "network" ? "道路網距離を反映中…" : "直線距離モデルを反映中…",
            subtitle: "建物の距離基準を切り替えています",
          });
          applyDistanceModelRef.current?.(value);
        }}
        onNetworkThresholdMultiplierChange={(value) => {
          setNetworkThresholdMultiplier(value);
          applyNetworkThresholdMultiplierRef.current?.(value);
          reapplyCustomStopScoresRef.current?.();
        }}
        onToggleExperimentalDistanceModel={setShowExperimentalDistanceModel}
        isDemandTransitAnalysisRunning={isDemandTransitAnalysisRunning}
        isDemandTransitPanelVisible={isDemandTransitPanelVisible}
        onShowDemandTransitPanel={() => {
          setIsDemandTransitPanelVisible(true);
          if (!demandTransitPlanAnalysis && !isDemandTransitAnalysisRunning) {
            scheduleDemandTransitAnalysisRef.current?.(0);
          }
        }}
        isAddingCustomStop={isAddingCustomStop}
        customStopCount={customStopSummary?.stopCount ?? 0}
        customStopNewlyCoveredCount={customStopSummary?.newlyCoveredBuildings ?? 0}
        isMobilityHubActive={isMobilityHubActive}
        onToggleMobilityHubActive={handleToggleMobilityHubActive}
        mobilityHubRescuedCount={mobilityHubSummary?.newlyCoveredBuildings}
        mobilityHubRescuedArea={mobilityHubSummary?.newlyCoveredFloorArea}
        isCollapsed={isLegendCollapsed}
        onToggleCollapsed={() => setIsLegendCollapsed((prev) => !prev)}
        onToggleAddingCustomStop={() => {
          setIsAddingCustomStop((prev) => {
            const next = !prev;
            if (next) {
              setIsLegendCollapsed(true);
              if (isMobilityHubActiveRef.current) {
                handleCloseMobilityHub();
              }
            } else if ((customStopSummary?.stopCount ?? 0) === 0) {
              setIsLegendCollapsed(false);
            }
            return next;
          });
        }}
        onClearCustomStops={() => {
          setIsAddingCustomStop(false);
          clearCustomStopsRef.current?.();
          setIsLegendCollapsed(false);
        }}
      />
      <CustomStopSimulationPanel
        isVisible={isAddingCustomStop || (customStopSummary?.stopCount ?? 0) > 0}
        isAddingCustomStop={isAddingCustomStop}
        isEvaluating={isEvaluatingCustomStops}
        summary={customStopSummary}
        analysisThresholdMultiplier={
          distanceModel === "network" ? networkThresholdMultiplier : demandTransitAnalysisThresholdMultiplier
        }
        onToggleAddingCustomStop={() => {
          setIsAddingCustomStop((prev) => {
            const next = !prev;
            if (next && isMobilityHubActiveRef.current) {
              handleCloseMobilityHub();
            }
            if (!next && (customStopSummary?.stopCount ?? 0) === 0) {
              setIsLegendCollapsed(false);
            }
            return next;
          });
        }}
        onClearStops={() => {
          setIsAddingCustomStop(true);
          clearCustomStopsRef.current?.();
          setIsLegendCollapsed(true);
        }}
        onRemoveStop={(id) => removeCustomStopRef.current?.(id)}
        onFlyToStop={(id) => flyToCustomStopRef.current?.(id)}
        onExportGeoJson={() => exportCustomStopSimulationGeoJsonRef.current?.()}
        onClose={() => {
          setIsAddingCustomStop(false);
          clearCustomStopsRef.current?.();
          setIsLegendCollapsed(false);
        }}
      />
      {SHOW_MOBILITY_HUB_UI && (
        <MobilityHubSimulationPanel
          isVisible={isMobilityHubActive}
          selectedMode={mobilityHubMode}
          minMeters={mobilityHubMinMeters}
          maxMeters={mobilityHubMaxMeters}
          activeHubIds={activeMobilityHubIds}
          hubModes={hubModes}
          summary={mobilityHubSummary}
          onSelectMode={handleSelectMobilityHubMode}
          onChangeMinMeters={handleChangeMobilityHubMinMeters}
          onChangeMaxMeters={handleChangeMobilityHubMaxMeters}
          onToggleHub={handleToggleMobilityHub}
          onUpdateHubMode={handleUpdateHubMode}
          onFlyToHub={(id) => flyToMobilityHubRef.current?.(id)}
          onExportGeoJson={() => exportMobilityHubGeoJsonRef.current?.()}
          onClose={handleCloseMobilityHub}
        />
      )}
      {analysisError && <div role="alert" style={{position:'absolute',right:12,top:12,zIndex:20,maxWidth:360,padding:12,background:'#7f1d1d',color:'white'}}>{analysisError}<button onClick={()=>setAnalysisError(null)} aria-label="通知を閉じる">×</button></div>}
      {roadSnapNotice && (
        <div
          role="status"
          style={
            roadSnapNotice.isError
              ? {
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 200,
                  padding: "14px 22px",
                  background: "rgba(185, 28, 28, 0.94)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: "bold",
                  borderRadius: 8,
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  backdropFilter: "blur(8px)",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }
              : {
                  position: "absolute",
                  top: 16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 100,
                  padding: "8px 18px",
                  background: "rgba(14, 116, 144, 0.94)",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: "bold",
                  borderRadius: 6,
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  backdropFilter: "blur(6px)",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }
          }
        >
          <span>{roadSnapNotice.isError ? "⚠️" : "📍"}</span>
          <span>{roadSnapNotice.message}</span>
        </div>
      )}
      <UncoloredBuildingsNote />
      <DemandTransitRecommendationPanel
        analysis={demandTransitPlanAnalysis}
        selectedCount={demandTransitClusterCount}
        isRunning={isDemandTransitAnalysisRunning}
        pendingThresholdMultiplier={demandTransitAnalysisThresholdMultiplier}
        isVisible={isDemandTransitPanelVisible}
        onClose={() => setIsDemandTransitPanelVisible(false)}
      />
      {popup && <InfoPopup info={popup} onClose={() => { ++popupRequestRef.current; candidatePopupRef.current = false; setPopup(null); }} />}
      <CenterLoadingIndicator loadingState={centerLoading} />
    </div>
  );
}
