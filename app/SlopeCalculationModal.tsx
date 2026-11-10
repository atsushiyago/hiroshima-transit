"use client";

import React, { useEffect } from "react";
import type { AreaId } from "./lib/transit-analysis";

interface SlopeCalculationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAreaId: AreaId;
}

export function SlopeCalculationModal({ isOpen, onClose, selectedAreaId }: SlopeCalculationModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(15, 23, 42, 0.96)",
          color: "#e2e8f0",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          borderRadius: 10,
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          width: "100%",
          maxWidth: 680,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(30, 41, 59, 0.5)",
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>ℹ️</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: "bold", color: "#f8fafc" }}>
                勾配・歩行速度プロファイルの計算のしくみ
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                実効歩行距離の算出ロジックと各係数の役割（広島県モデル：安佐南区・呉市）
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "none",
              color: "#cbd5e1",
              fontSize: 16,
              width: 28,
              height: 28,
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")}
          >
            ✕
          </button>
        </div>

        {/* 本文（スクロール可能） */}
        <div style={{ padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 概要 */}
          <div style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: 6, padding: "10px 14px", color: "#e0f2fe", fontSize: 12.5 }}>
            本システムでは、平面直線距離だけでなく、地形の標高差（勾配）や歩行者の体力特性を考慮して「実際の体感負担（実効歩行距離）」を推計しています。2つの主要係数はそれぞれ<strong>「誰が歩くか（人の体力差）」</strong>と<strong>「上りか下りか（向きと地域の過酷さ）」</strong>という別の役割を持っています。
          </div>

          {/* 1. 一言でいうと（表） */}
          <div>
            <div style={{ fontWeight: "bold", color: "#38bdf8", marginBottom: 6, fontSize: 13 }}>
              ■ 2つの係数の役割
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "rgba(15, 23, 42, 0.4)", borderRadius: 6, overflow: "hidden" }}>
              <thead>
                <tr style={{ background: "rgba(30, 41, 59, 0.8)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", width: "28%", color: "#cbd5e1" }}>係数</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", width: "27%", color: "#cbd5e1" }}>役割</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", color: "#cbd5e1" }}>何を表しているか</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: "bold", color: "#f1f5f9" }}>① 勾配ペナルティ係数</td>
                  <td style={{ padding: "8px 10px", color: "#7dd3fc" }}>「人の体力差」</td>
                  <td style={{ padding: "8px 10px", color: "#cbd5e1" }}>
                    坂の斜度（キツさ）にどれだけ敏感か<br />
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>（高齢者は一般成人の2倍、坂道で急激に疲労）</span>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 10px", fontWeight: "bold", color: "#f1f5f9" }}>② 上り坂の割増倍率</td>
                  <td style={{ padding: "8px 10px", color: "#fdba74" }}>「歩く向きと地域の過酷さ」</td>
                  <td style={{ padding: "8px 10px", color: "#cbd5e1" }}>
                    下り坂と比べ、上り坂をどれだけ重くみるか<br />
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>（重力に逆らう上り坂や、車も通れない階段市街地への割増）</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2. 計算式 */}
          <div>
            <div style={{ fontWeight: "bold", color: "#38bdf8", marginBottom: 6, fontSize: 13 }}>
              ■ 計算式での使われ方
            </div>
            <div
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 6,
                padding: "12px 14px",
                fontFamily: "monospace",
                fontSize: 12.5,
                color: "#e2e8f0",
                lineHeight: 1.8,
              }}
            >
              <div>
                実効歩行距離 = 水平距離 × <span style={{ color: "#f8fafc", fontWeight: "bold" }}>[ 1 + (① 勾配ペナルティ係数) × (② 方向割増倍率) × 斜度(勾配) ]</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontFamily: "sans-serif" }}>
                ※上り坂では ②上り坂倍率（安佐南 1.25倍 / 呉 1.55〜1.85倍）、下り坂では下り倍率（1.0〜1.1倍）を適用。<br />
                ※極端な崖による過大推計を防ぐため、斜度は40%〜45%で上限キャップを設けています。
              </div>
            </div>
          </div>

          {/* 3. 地域別の具体例と比較 */}
          <div>
            <div style={{ fontWeight: "bold", color: "#38bdf8", marginBottom: 6, fontSize: 13 }}>
              ■ 地域別の設定値と具体例（斜度10%の坂を100m登る場合）
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* 安佐南区 毘沙門台 */}
              <div
                style={{
                  background: selectedAreaId === "hiroshima_bishamondai" ? "rgba(30, 58, 138, 0.35)" : "rgba(30, 41, 59, 0.5)",
                  border: selectedAreaId === "hiroshima_bishamondai" ? "1.5px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  position: "relative",
                }}
              >
                {selectedAreaId === "hiroshima_bishamondai" && (
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 10,
                      background: "#0284c7",
                      color: "#fff",
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontWeight: "bold",
                    }}
                  >
                    📍 現在表示中
                  </span>
                )}
                <div style={{ fontWeight: "bold", color: "#93c5fd", fontSize: 13, marginBottom: 4 }}>
                  広島市安佐南区（毘沙門台）
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
                  丘陵地に開発された標準的な斜面住宅団地
                </div>
                <div style={{ fontSize: 11.5, color: "#cbd5e1", lineHeight: 1.6 }}>
                  ・上り坂割増: <strong>1.25倍</strong>（団地坂道標準）<br />
                  ・一般ペナルティ: <strong>3.5</strong>（速度 67m/分）<br />
                  ・高齢者ペナルティ: <strong>7.0</strong>（速度 50m/分）
                </div>
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 11.5 }}>
                  <div style={{ color: "#94a3b8" }}>100m登ったときの実効距離:</div>
                  <div style={{ marginTop: 2 }}>
                    一般: <strong style={{ color: "#38bdf8" }}>約144m</strong>（平地比 1.44倍）
                  </div>
                  <div>
                    高齢者: <strong style={{ color: "#fbbf24" }}>約188m</strong>（平地比 1.88倍）
                  </div>
                </div>
              </div>

              {/* 呉市 宮原地区 */}
              <div
                style={{
                  background: selectedAreaId === "kure_miyahara" ? "rgba(30, 58, 138, 0.35)" : "rgba(30, 41, 59, 0.5)",
                  border: selectedAreaId === "kure_miyahara" ? "1.5px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  position: "relative",
                }}
              >
                {selectedAreaId === "kure_miyahara" && (
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 10,
                      background: "#0284c7",
                      color: "#fff",
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontWeight: "bold",
                    }}
                  >
                    📍 現在表示中
                  </span>
                )}
                <div style={{ fontWeight: "bold", color: "#fdba74", fontSize: 13, marginBottom: 4 }}>
                  呉市（宮原地区）
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
                  車道が通れない急勾配・階段が密集する斜面市街地
                </div>
                <div style={{ fontSize: 11.5, color: "#cbd5e1", lineHeight: 1.6 }}>
                  ・上り坂割増: <strong>一般 1.55倍 / 高齢者 1.85倍</strong><br />
                  ・一般ペナルティ: <strong>4.5</strong>（速度 63m/分）<br />
                  ・高齢者ペナルティ: <strong>9.0</strong>（速度 45m/分）
                </div>
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 11.5 }}>
                  <div style={{ color: "#94a3b8" }}>100m登ったときの実効距離:</div>
                  <div style={{ marginTop: 2 }}>
                    一般: <strong style={{ color: "#38bdf8" }}>約170m</strong>（平地比 1.70倍）
                  </div>
                  <div>
                    高齢者: <strong style={{ color: "#f87171" }}>約267m</strong>（平地比 2.67倍）
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
              💡 <strong>呉市宮原地区で交通空白地（赤）が広がる理由：</strong><br />
              呉市の斜面市街地では階段や急勾配が連続するため、同じ100mの上り坂であっても高齢者には平地の2.6倍以上（実質267m）の過酷な負荷がかかります。この地形的実態を係数に反映することで、潜在的な移動困難世帯を正確に可視化しています。
            </div>
          </div>
        </div>

        {/* フッター */}
        <div
          style={{
            padding: "10px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(30, 41, 59, 0.4)",
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              background: "rgba(56, 189, 248, 0.2)",
              border: "1px solid rgba(56, 189, 248, 0.5)",
              borderRadius: 4,
              color: "#38bdf8",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
