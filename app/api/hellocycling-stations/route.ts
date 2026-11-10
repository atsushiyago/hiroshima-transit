import { NextResponse } from "next/server";

// ODPT（公共交通オープンデータセンター）のGBFS形式データへのサーバーサイドプロキシ。
// クライアントから直接叩くとアクセストークン（ODPT_CONSUMER_KEY）がブラウザに露出してしまうため、
// /api/reverse-geocode と同じ方針でサーバー側にキーを隠蔽している。
const GBFS_STATION_INFO_URL = "https://api.odpt.org/api/v4/gbfs/hellocycling/station_information.json";

const ODPT_CONSUMER_KEY = process.env.ODPT_CONSUMER_KEY;
const ODPT_TIMEOUT_MS = 8000;

// 広島市安佐南区 毘沙門台エリアのバウンディングボックス（南西: 34.460, 132.472 / 北東: 34.478, 132.490）
const BISHAMONDAI_BBOX = { minLat: 34.460, maxLat: 34.478, minLng: 132.472, maxLng: 132.490 };

type GbfsStation = {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  capacity?: number;
};
type GbfsStationInformation = { data?: { stations?: GbfsStation[] } };

export async function GET() {
  if (!ODPT_CONSUMER_KEY) {
    console.error("ODPT_CONSUMER_KEY environment variable is not set");
    return NextResponse.json(
      { error: "ODPT_CONSUMER_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const url = new URL(GBFS_STATION_INFO_URL);
  url.searchParams.set("acl:consumerKey", ODPT_CONSUMER_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ODPT_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      console.warn("ODPT GBFS station_information.jsonの取得に失敗しました", res.status, await res.text());
      return NextResponse.json({ error: "ODPT GBFS request failed" }, { status: 502 });
    }

    const data: GbfsStationInformation = await res.json();
    const allStations = data.data?.stations ?? [];

    const stations = allStations
      .filter((s) => {
        if (
          s.lat < BISHAMONDAI_BBOX.minLat ||
          s.lat > BISHAMONDAI_BBOX.maxLat ||
          s.lon < BISHAMONDAI_BBOX.minLng ||
          s.lon > BISHAMONDAI_BBOX.maxLng
        ) {
          return false;
        }
        return true;
      })
      .map((s) => ({
        id: s.station_id,
        name: s.name,
        lat: s.lat,
        lng: s.lon,
        capacity: typeof s.capacity === "number" ? s.capacity : null,
      }));

    return NextResponse.json({ stations });
  } catch (err) {
    console.warn("ODPT GBFSへのリクエストに失敗しました", err);
    return NextResponse.json({ error: "ODPT GBFS request failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
