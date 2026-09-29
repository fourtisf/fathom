'use client';

import { useState, type CSSProperties } from 'react';
import { MODELS, CREDITS_PER_USDG, DEFAULT_MODEL } from '@fathom/config';

const PLAN_USD = 20;
const MIN = 5;
const MAX = 300;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

export function PricingCalc() {
  const [msgs, setMsgs] = useState(40);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const rate = MODELS.find((m) => m.id === model)!.avgMessageCredits;
  const credits = msgs * 30 * rate;
  const usd = credits / CREDITS_PER_USDG;

  return (
    <div className="pcard calc rv" style={{ transitionDelay: '.08s' }}>
      <h3>Estimate your month</h3>
      <div className="read">
        <b>${usd.toFixed(2)}</b>
        <span>{fmt(credits)} credits</span>
      </div>
      <div className="field">
        <label htmlFor="msgs">
          Messages per day <b>{msgs}</b>
        </label>
        <input
          type="range"
          id="msgs"
          min={MIN}
          max={MAX}
          step={5}
          value={msgs}
          onChange={(e) => setMsgs(Number(e.target.value))}
          style={{ '--p': `${((msgs - MIN) / (MAX - MIN)) * 100}%` } as CSSProperties}
        />
      </div>
      <div className="field">
        <label id="seg-label">Model</label>
        <div className="seg" role="radiogroup" aria-labelledby="seg-label">
          {MODELS.map((m) => (
            <button key={m.id} role="radio" aria-checked={m.id === model} onClick={() => setModel(m.id)}>
              {m.short}
            </button>
          ))}
        </div>
      </div>
      <div className="compare">
        <span>vs a ${PLAN_USD}/month AI plan</span>
        <b>{usd < PLAN_USD ? `Save $${(PLAN_USD - usd).toFixed(2)}` : 'No lock-in, stop anytime'}</b>
      </div>
    </div>
  );
}
