import urllib.request
import xml.etree.ElementTree as ET
import math
import json
import time
import sys
from pathlib import Path

# Sub-boxes for Kure - covers Miyahara 1-13, Hirahara, Kami-hirahara, Kure Station, Washo, Hontori, Agha
LAT_STEPS = [(34.215, 34.235), (34.235, 34.255), (34.255, 34.275)]
LNG_STEPS = [(132.535, 132.555), (132.555, 132.575), (132.575, 132.595)]

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def main():
    nodes = {}  # id -> (lat, lon)
    ways = {}   # id -> {"nodes": [...], "tags": {...}}

    for lat_min, lat_max in LAT_STEPS:
        for lng_min, lng_max in LNG_STEPS:
            url = f"https://api.openstreetmap.org/api/0.6/map?bbox={lng_min:.4f},{lat_min:.4f},{lng_max:.4f},{lat_max:.4f}"
            print(f"Fetching {url}...", file=sys.stderr)
            req = urllib.request.Request(url, headers={"User-Agent": "AntigravityPlateauRoad/1.0"})
            success = False
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        content = resp.read()
                    root = ET.fromstring(content)
                    success = True
                    break
                except Exception as e:
                    print(f"  Attempt {attempt+1} failed: {e}", file=sys.stderr)
                    time.sleep(2)
            if not success:
                print(f"Failed to fetch tile [{lng_min}, {lat_min}]", file=sys.stderr)
                continue

            for node in root.findall("node"):
                nid = int(node.get("id"))
                lat = float(node.get("lat"))
                lon = float(node.get("lon"))
                nodes[nid] = (lat, lon)

            for way in root.findall("way"):
                wid = int(way.get("id"))
                if wid in ways:
                    continue
                tags = {}
                for tag in way.findall("tag"):
                    tags[tag.get("k")] = tag.get("v")

                if "highway" in tags:
                    wnodes = [int(nd.get("ref")) for nd in way.findall("nd")]
                    ways[wid] = {"nodes": wnodes, "tags": tags}

            time.sleep(1)

    print(f"Collected total: {len(nodes)} nodes, {len(ways)} highway ways", file=sys.stderr)

    # Filter used nodes
    used_node_ids = set()
    for w in ways.values():
        for nid in w["nodes"]:
            if nid in nodes:
                used_node_ids.add(nid)

    node_id_to_idx = {}
    nodes_array = []
    for nid in used_node_ids:
        lat, lon = nodes[nid]
        node_id_to_idx[nid] = len(nodes_array)
        nodes_array.append([lon, lat, 0])

    edges_array = []
    features = []

    for wid, w in ways.items():
        wnodes = w["nodes"]
        line_coords = []
        for i in range(len(wnodes) - 1):
            n1 = wnodes[i]
            n2 = wnodes[i+1]
            if n1 in node_id_to_idx and n2 in node_id_to_idx:
                u = node_id_to_idx[n1]
                v = node_id_to_idx[n2]
                lat1, lon1 = nodes[n1]
                lat2, lon2 = nodes[n2]
                dist = haversine(lat1, lon1, lat2, lon2)
                # [u, v, len, eff_gen, eff_eld, road]
                edges_array.append([u, v, round(dist, 2), round(dist, 2), round(dist, 2), 1])

        for nid in wnodes:
            if nid in nodes:
                line_coords.append([nodes[nid][1], nodes[nid][0]])

        if len(line_coords) >= 2:
            features.append({
                "type": "Feature",
                "properties": {
                    "highway": w["tags"].get("highway", "road"),
                    "name": w["tags"].get("name", "")
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": line_coords
                }
            })

    print(f"Result graph: {len(nodes_array)} nodes, {len(edges_array)} edges, {len(features)} GeoJSON features", file=sys.stderr)

    repo_root = Path(__file__).parent.parent
    kure_dir = repo_root / "public" / "data" / "kure"
    kure_dir.mkdir(parents=True, exist_ok=True)

    routing_graph = {
        "version": "kure-osm-v1",
        "nodes": nodes_array,
        "edges": edges_array,
        "missingElevationNodes": 0
    }
    graph_path = kure_dir / "routing-graph.json"
    with open(graph_path, "w", encoding="utf-8") as f:
        json.dump(routing_graph, f, separators=(",", ":"))
    print(f"Saved {graph_path} ({graph_path.stat().st_size} bytes)", file=sys.stderr)

    roads_geojson = {
        "type": "FeatureCollection",
        "name": "kure_miyahara_roads",
        "bbox": [132.540, 34.225, 132.580, 34.262],
        "features": features
    }
    roads_path = kure_dir / "roads.geojson"
    with open(roads_path, "w", encoding="utf-8") as f:
        json.dump(roads_geojson, f, separators=(",", ":"))
    print(f"Saved {roads_path} ({roads_path.stat().st_size} bytes)", file=sys.stderr)

if __name__ == "__main__":
    main()
