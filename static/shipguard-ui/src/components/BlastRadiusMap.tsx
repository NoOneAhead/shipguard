import React, { useMemo, useState } from 'react';
import { TeamworkGraphEdge, TeamworkGraphNode } from '../types';

interface BlastRadiusMapProps {
  nodes: TeamworkGraphNode[];
  edges: TeamworkGraphEdge[];
  blastRadiusTier: string;
  graphSource: string;
}

const TYPE_COLORS: Record<TeamworkGraphNode['type'], { fill: string; stroke: string; short: string }> = {
  ISSUE: { fill: '#deebff', stroke: '#0052cc', short: 'JIRA' },
  PAGE: { fill: '#e6fcff', stroke: '#006677', short: 'CONF' },
  INCIDENT: { fill: '#ffebe6', stroke: '#de350b', short: 'INC' },
  TEAM: { fill: '#eae6ff', stroke: '#6554c0', short: 'TEAM' },
  USER: { fill: '#ebecf0', stroke: '#42526e', short: 'USER' },
  PULL_REQUEST: { fill: '#e3fcef', stroke: '#00875a', short: 'PR' },
  SERVICE: { fill: '#fffae6', stroke: '#ff991f', short: 'SVC' }
};

function riskStroke(risk: TeamworkGraphNode['risk']): string {
  switch (risk) {
    case 'CRITICAL':
      return '#de350b';
    case 'HIGH':
      return '#ff5630';
    case 'MEDIUM':
      return '#ff991f';
    default:
      return '#8993a4';
  }
}

export const BlastRadiusMap: React.FC<BlastRadiusMapProps> = ({
  nodes,
  edges,
  blastRadiusTier,
  graphSource
}) => {
  const [selectedId, setSelectedId] = useState<string>(nodes[0]?.id ?? '');

  const positioned = useMemo(() => {
    const cx = 330;
    const cy = 205;
    const map = new Map<string, { x: number; y: number; node: TeamworkGraphNode }>();
    if (nodes.length === 0) return map;

    map.set(nodes[0].id, { x: cx, y: cy, node: nodes[0] });
    const satellites = nodes.slice(1);
    const total = satellites.length;

    satellites.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(1, total) - Math.PI / 2;
      const rx = total > 8 ? 245 : 220;
      const ry = total > 8 ? 155 : 142;
      map.set(node.id, {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        node
      });
    });

    return map;
  }, [nodes]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? nodes[0];
  const connectedEdges = selectedNode
    ? edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
    : [];

  return (
    <div className="blast-layout">
      <div className="blast-canvas-wrap">
        <svg className="blast-svg" viewBox="0 0 660 445" role="img" aria-label="Blast-Radius Dependency Graph">
          <defs>
            <pattern id="sg-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#dfe1e6" />
            </pattern>
          </defs>
          <rect width="660" height="445" fill="url(#sg-grid)" />

          {edges.map((edge, idx) => {
            const p1 = positioned.get(edge.from);
            const p2 = positioned.get(edge.to);
            if (!p1 || !p2) return null;
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const highlighted =
              selectedNode && (edge.from === selectedNode.id || edge.to === selectedNode.id);

            return (
              <g key={`${edge.from}-${edge.to}-${idx}`}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={riskStroke(edge.severity)}
                  strokeWidth={highlighted ? 2.6 : 1.6}
                  strokeDasharray={edge.severity === 'CRITICAL' ? '6 3' : undefined}
                  opacity={highlighted ? 0.95 : 0.65}
                />
                <rect
                  x={mx - 42}
                  y={my - 9}
                  width="84"
                  height="16"
                  rx="4"
                  fill="#ffffff"
                  stroke="#dfe1e6"
                  strokeWidth="0.8"
                />
                <text
                  x={mx}
                  y={my + 2.5}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="600"
                  fill="#42526e"
                >
                  {edge.relation.slice(0, 15)}
                </text>
              </g>
            );
          })}

          {nodes.map((node, idx) => {
            const pos = positioned.get(node.id);
            if (!pos) return null;
            const style = TYPE_COLORS[node.type];
            const isRoot = idx === 0;
            const isSelected = selectedNode?.id === node.id;
            const radius = isRoot ? 30 : 20;
            const shortLabel =
              node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label;
            const pillWidth = Math.max(66, shortLabel.length * 6.2 + 14);

            return (
              <g
                key={node.id}
                className="blast-node-group"
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => setSelectedId(node.id)}
              >
                {isSelected && (
                  <circle
                    r={radius + 6}
                    fill="none"
                    stroke="#0052cc"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                  />
                )}
                <circle
                  r={radius}
                  fill={style.fill}
                  stroke={node.risk === 'CRITICAL' ? '#de350b' : style.stroke}
                  strokeWidth={node.risk === 'CRITICAL' || isRoot ? 3 : 2}
                />
                <text
                  y={isRoot ? -2 : 3.5}
                  textAnchor="middle"
                  fontSize={isRoot ? '10' : '9'}
                  fontWeight="800"
                  fill={style.stroke}
                >
                  {style.short}
                </text>
                {isRoot ? (
                  <text
                    y={12}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight="800"
                    fill="#172b4d"
                  >
                    {node.label}
                  </text>
                ) : (
                  <g transform={`translate(0, ${radius + 11})`}>
                    <rect
                      x={-pillWidth / 2}
                      y={-8.5}
                      width={pillWidth}
                      height={16}
                      rx={8}
                      fill="#ffffff"
                      stroke={isSelected ? '#0052cc' : '#dfe1e6'}
                      strokeWidth={isSelected ? 1.4 : 1}
                    />
                    <text
                      y={2.5}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="700"
                      fill="#172b4d"
                    >
                      {shortLabel}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        <div className="blast-legend">
          <span><span className="legend-dot" style={{ background: '#0052cc' }} />Jira Issue</span>
          <span><span className="legend-dot" style={{ background: '#de350b' }} />Active Incident</span>
          <span><span className="legend-dot" style={{ background: '#006677' }} />Confluence Runbook</span>
          <span><span className="legend-dot" style={{ background: '#6554c0' }} />Teamwork Graph Team</span>
          <span><span className="legend-dot" style={{ background: '#00875a' }} />Linked PR</span>
          <span><span className="legend-dot" style={{ background: '#ff991f' }} />Impacted Service</span>
        </div>
      </div>

      <div className="blast-inspector">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="sg-badge badge-purple">{graphSource === 'TEAMWORK_GRAPH_API' ? 'TEAMWORK GRAPH LIVE' : 'HYBRID GRAPH'}</span>
          <span className="sg-badge badge-neutral">{blastRadiusTier}</span>
        </div>

        {selectedNode ? (
          <>
            <h4 style={{ margin: '6px 0 4px', fontSize: 15 }}>{selectedNode.label}</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span className="sg-badge badge-neutral">{selectedNode.type}</span>
              <span className={`sg-badge badge-${selectedNode.risk.toLowerCase()}`}>
                {selectedNode.risk} RISK
              </span>
              {selectedNode.status && <span className="sg-badge badge-low">{selectedNode.status}</span>}
            </div>
            {selectedNode.subtitle && (
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#42526e' }}>
                {selectedNode.subtitle}
              </p>
            )}

            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', marginBottom: 6 }}>
              Connected Edges ({connectedEdges.length})
            </div>
            {connectedEdges.map((edge, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: 12,
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: '#ffffff',
                  border: '1px solid #dfe1e6',
                  marginBottom: 6
                }}
              >
                <strong>{edge.relation}</strong> →{' '}
                <span>{edge.from === selectedNode.id ? edge.to : edge.from}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="empty-state">Select a node on the blast-radius graph to inspect details.</div>
        )}
      </div>
    </div>
  );
};
