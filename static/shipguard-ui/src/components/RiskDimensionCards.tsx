import React from 'react';
import { DimensionScore } from '../types';

interface RiskDimensionCardsProps {
  dimensions: DimensionScore[];
}

export const RiskDimensionCards: React.FC<RiskDimensionCardsProps> = ({ dimensions }) => {
  return (
    <div className="dim-grid">
      {dimensions.map((dim) => {
        const tone = dim.status === 'GO' ? 'go' : dim.status === 'CAUTION' ? 'caution' : 'block';
        return (
          <div key={dim.key} className="dim-card">
            <div className="dim-top">
              <div>
                <div className="dim-name">{dim.label}</div>
                <div className="dim-weight">Weight {Math.round(dim.weight * 100)}%</div>
              </div>
              <div className={`dim-score ${tone}`}>{dim.score}</div>
            </div>
            <div className="progress-track">
              <div
                className={`progress-fill ${tone}`}
                style={{ width: `${Math.max(4, Math.min(100, dim.score))}%` }}
              />
            </div>
            <div className="dim-summary">{dim.summary}</div>
          </div>
        );
      })}
    </div>
  );
};
