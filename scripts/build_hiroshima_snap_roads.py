import urllib.request
import xml.etree.ElementTree as ET
import math
import json
import time
import sys
from pathlib import Path

# Sub-boxes for Asaminami-ku (Hiroshima) - covers Tomo, Chorakuji, Takatori, Gion, Omachi, Bishamondai
LAT_STEPS = [
    (34.430, 34.445),
    (34.445, 34.460),
    (34.460, 34.475),
    (34.475, 34.492),
]
LNG_STEPS = [
    (132.405, 132.420),
    (132.420, 132.435),
    (132.435, 132.450),
    (132.450, 132.465),
    (132.465, 132.480),
    (132.480, 132.495),
]

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

            time.sleep(0.5)

    print(f"Collected total from OSM: {len(nodes)} nodes, {len(ways)} highway ways", file=sys.stderr)

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
    for wid, w in ways.items():
        wnodes = w["nodes"]
        for i in range(len(wnodes) - 1):
            n1 = wnodes[i]
            n2 = wnodes[i+1]
            if n1 in node_id_to_idx and n2 in node_id_to_idx:
                u = node_id_to_idx[n1]
                v = node_id_to_idx[n2]
                lat1, lon1 = nodes[n1]
                lat2, lon2 = nodes[n2]
                dist = haversine(lat1, lon1, lat2, lon2)
                edges_array.append([u, v, round(dist, 2), round(dist, 2), round(dist, 2), 1])

    repo_root = Path(__file__).parent.parent
    hiroshima_dir = repo_root / "public" / "data" / "hiroshima"

    # Also merge existing routing-graph.json road edges if present
    existing_graph_path = hiroshima_dir / "routing-graph.json"
    if existing_graph_path.exists():
        with open(existing_graph_path, "r", encoding="utf-8") as f:
            exist_d = json.load(f)
        exist_nodes = exist_d.get("nodes", [])
        exist_edges = exist_d.get("edges", [])
        offset = len(nodes_array)
        for n in exist_nodes:
            nodes_array.append([n[0], n[1], n[2] if len(n) > 2 else 0])
        for e in exist_edges:
            if len(e) > 5 and e[5] == 1:
                edges_array.append([e[0] + offset, e[1] + offset, e[2], e[3], e[4], 1])
        print(f"Merged with existing routing-graph road edges: now {len(nodes_array)} nodes, {len(edges_array)} edges", file=sys.stderr)

    snap_graph = {
        "version": "hiroshima-snap-v1",
        "nodes": nodes_array,
        "edges": edges_array
    }
    out_path = hiroshima_dir / "snap-roads.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(snap_graph, f, separators=(",", ":"))
    print(f"Saved {out_path} ({out_path.stat().st_size} bytes)", file=sys.stderr)

if __name__ == "__main__":
    main()
