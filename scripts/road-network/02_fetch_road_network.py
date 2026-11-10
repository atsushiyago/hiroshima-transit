"""
osmnxで広島市安佐南区 毘沙門台エリアの歩行可能な道路網を取得し、graphmlおよびGeoJSON形式で保存する。
"""

import sys
from pathlib import Path

import osmnx as ox

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_GRAPHML = SCRIPT_DIR / "road_network.graphml"
OUTPUT_GEOJSON = REPO_ROOT / "public" / "data" / "hiroshima" / "road-network.geojson"

# 毘沙門台地区を包含する範囲（南西: 34.460, 132.472 / 北東: 34.478, 132.490）
NORTH = 34.478
SOUTH = 34.460
EAST = 132.490
WEST = 132.472


def main():
    print("osmnxで道路網を取得中（初回は数十秒かかる）...", file=sys.stderr)
    # simplify=False にしている理由: simplify=Trueだと、複数の実道路セグメントを1本のエッジに
    # まとめてしまい、そのエッジの`length`属性（実際の道のり長、曲線込み）と、ノード間の
    # 直線距離（03_compute_scores.pyの勾配計算で使う区間距離）が食い違ってしまう。
    # 具体的には、簡略化されたエッジのlengthは長いのにノード間の直線距離は短くなるため、
    # 標高差÷区間距離で求める勾配が過大評価され、実効距離が理論上限（1+係数×0.4）を
    # 超えてしまう不具合が実際に発生した。simplify=Falseなら各ノードが元のOSM座標点を
    # すべて保持するため、エッジはほぼ直線とみなせて整合する（グラフは大きくなるが、
    # ダイクストラ法は1回の走査で済むため計算量的には問題にならない）。
    graph = ox.graph_from_bbox((WEST, SOUTH, EAST, NORTH), network_type="walk", simplify=False)
    print(f"nodes={len(graph.nodes)} edges={len(graph.edges)}", file=sys.stderr)
    ox.save_graphml(graph, OUTPUT_GRAPHML)
    print(f"書き出し完了: {OUTPUT_GRAPHML}", file=sys.stderr)


if __name__ == "__main__":
    main()
