import React from 'react';
import { ShipVerdict } from '../types';

interface ReadinessGaugeProps {
  score: number;
  verdict: ShipVerdict;
  blastRadiusTier?: string;
  scoreDelta?: number;
}

export const ReadinessGauge: React.FC<ReadinessGaugeProps> = ({
  score,
  verdict,
  blastRadiusTier,
  scoreDelta
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 64;
  const circumference = Math.PI * radius; // semi-circle arc
  const dashOffset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    verdict === 'GO' ? '#00875a' : verdict === 'CAUTION' ? '#ff991f' : '#de350b';

  const verdictClass =
    verdict === 'GO' ? 'badge-go' : verdict === 'CAUTION' ? 'badge-caution' : 'badge-block';

  return (
    <div className="gauge-box" aria-label={`Ship readiness score ${clamped} out of 100, verdict ${verdict}`}>
      <svg className="gauge-svg" viewBox="0 0 164 108">
        <path
          d="M 18 92 A 64 64 0 0 1 146 92"
          fill="none"
          stroke="#dfe1e6"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 18 92 A 64 64 0 0 1 146 92"
          fill="none"
          stroke={strokeColor}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${dashOffset}`}
        />
        <text x="82" y="76" textAnchor="middle" className="gauge-score-text">
          {clamped}
        </text>
        <text x="82" y="95" textAnchor="middle" className="gauge-sub-text">
          READINESS / 100
        </text>
      </svg>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span className={`sg-badge ${verdictClass}`}>
          {verdict === 'GO' ? 'SAFE TO SHIP' : verdict === 'CAUTION' ? 'CAUTION' : 'SHIP BLOCKED'}
        </span>
        {blastRadiusTier && (
          <span
            className={`sg-badge ${
              blastRadiusTier === 'CRITICAL'
                ? 'badge-critical'
                : blastRadiusTier === 'WIDE'
                  ? 'badge-high'
                  : blastRadiusTier === 'MODERATE'
                    ? 'badge-medium'
                    : 'badge-low'
            }`}
          >
            {blastRadiusTier} BLAST
          </span>
        )}
      </div>

      {typeof scoreDelta === 'number' && scoreDelta !== 0 && (
        <div style={{ fontSize: 11.5, marginTop: 6, fontWeight: 600, color: scoreDelta > 0 ? '#006644' : '#bf2600' }}>
          {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} pts since last snapshot
        </div>
      )}
    </div>
  );
};
