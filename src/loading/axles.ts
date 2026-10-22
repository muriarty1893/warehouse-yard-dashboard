import type { AxleLoad, AxleReport, AxleStatus, CurvePoint, LoadState, Mass, VehicleSpec } from './types';
import { axleCoefficients, type AxleCoefficient } from './vehicles';

/**
 * Axle statics (spec §1.4): axle loads at departure and after every drop,
 * the load-distribution curve and the legal centre-of-gravity window.
 */

const EPS = 1e-9;
const tonnes = (kg: number) => `${+(kg / 1000).toFixed(2)} t`;
const when = (afterStop: number) => (afterStop === 0 ? 'at departure' : `after stop ${afterStop}`);

/** The steering axle, and the axles whose total it must carry a share of. */
function steerTerms(v: VehicleSpec, coefs: AxleCoefficient[]) {
  const steer = coefs.find((c) => c.id === 'front' || c.id === 'steer');
  if (!steer) throw new Error(`${v.id} has no steering axle`);
  const base = v.statics.kind === 'rigid' ? coefs : coefs.filter((c) => c.id === 'steer' || c.id === 'drive');
  const sum = base.reduce((s, c) => ({ t: s.t + c.tareKg, a: s.a + c.a, b: s.b + c.b }), { t: 0, a: 0, b: 0 });
  return { steer, sum };
}

const loadOf = (c: AxleCoefficient, kg: number, x: number) => c.tareKg + kg * (c.a + c.b * x);

export function axleLoads(v: VehicleSpec, masses: Mass[]): AxleLoad[] {
  const kg = masses.reduce((s, m) => s + m.kg, 0);
  const x = kg > 0 ? masses.reduce((s, m) => s + m.kg * m.x, 0) / kg : 0;
  const coefs = axleCoefficients(v);
  const { steer, sum } = steerTerms(v, coefs);
  const light = loadOf(steer, kg, x) < v.minSteerShare * (sum.t + kg * (sum.a + sum.b * x)) - EPS;
  return coefs.map((c) => {
    const load = loadOf(c, kg, x);
    const pct = (load / c.ratingKg) * 100;
    const status: AxleStatus = load > c.ratingKg * (1 + EPS) ? 'over' : c === steer && light ? 'light' : pct >= 90 ? 'near' : 'ok';
    return { id: c.id, label: c.label, kg: load, ratingKg: c.ratingKg, pct, status };
  });
}

export function loadState(v: VehicleSpec, masses: Mass[], afterStop: number): LoadState {
  const payloadKg = masses.reduce((s, m) => s + m.kg, 0);
  const cogX = payloadKg > 0 ? masses.reduce((s, m) => s + m.kg * m.x, 0) / payloadKg : null;
  const axles = axleLoads(v, masses);
  const issues: string[] = [];
  if (payloadKg > v.payloadKg * (1 + EPS)) issues.push(`Payload over ${tonnes(v.payloadKg)}`);
  for (const a of axles) {
    if (a.status === 'over') issues.push(`${a.label} over ${tonnes(a.ratingKg)} ${when(afterStop)}`);
    if (a.status === 'light') issues.push(`${a.label} too light ${when(afterStop)}`);
  }
  return { afterStop, label: afterStop === 0 ? 'Depart' : `After ${afterStop}`, payloadKg, cogX, axles, issues };
}

/** Departure, then after each drop but the last; masses of stops ≤ k are gone after stop k. */
export function axleReport(v: VehicleSpec, masses: Mass[], stops: number): AxleReport {
  const states: LoadState[] = [];
  for (let k = 0; k < Math.max(1, stops); k++) {
    states.push(
      loadState(
        v,
        masses.filter((m) => m.stop > k),
        k,
      ),
    );
  }
  const issues = states.flatMap((s) => s.issues);
  const payloadKg = states[0].payloadKg;
  return { states, ok: issues.length === 0, issues, curve: distributionCurve(v), window: payloadKg > 0 ? cogWindow(v, payloadKg) : null, cogX: states[0].cogX, payloadKg };
}

/** Most payload the vehicle can take with its centre of gravity at x (100 samples over the box). */
export function distributionCurve(v: VehicleSpec): CurvePoint[] {
  const coefs = axleCoefficients(v);
  const { steer, sum } = steerTerms(v, coefs);
  const m = v.minSteerShare;
  const tareLegal = coefs.every((c) => c.tareKg <= c.ratingKg) && steer.tareKg >= m * sum.t - EPS;
  const out: CurvePoint[] = [];
  for (let i = 0; i < 100; i++) {
    const x = (v.inner.l * i) / 99;
    if (!tareLegal) {
      out.push({ x, maxKg: 0 });
      continue;
    }
    let max = v.payloadKg;
    for (const c of coefs) {
      const k = c.a + c.b * x;
      if (k > EPS) max = Math.min(max, (c.ratingKg - c.tareKg) / k);
    }
    // Steer share: tS + P·kS ≥ m·(tD + P·kD)  ⇔  P·(kS − m·kD) ≥ m·tD − tS.
    const k = steer.a + steer.b * x - m * (sum.a + sum.b * x);
    const r = m * sum.t - steer.tareKg;
    if (k < -EPS) max = Math.min(max, r / k);
    out.push({ x, maxKg: Math.max(0, max) });
  }
  return out;
}

/** Box-frame x range where a payload of `kg` keeps every axle legal, or null. */
export function cogWindow(v: VehicleSpec, kg: number): [number, number] | null {
  if (kg > v.payloadKg * (1 + EPS)) return null;
  const coefs = axleCoefficients(v);
  const { steer, sum } = steerTerms(v, coefs);
  const m = v.minSteerShare;
  let lo = 0;
  let hi = v.inner.l;
  // coef·x ≤ rhs
  const bound = (coef: number, rhs: number) => {
    if (Math.abs(coef) < EPS) {
      if (rhs < -EPS) lo = Infinity;
    } else if (coef > 0) hi = Math.min(hi, rhs / coef);
    else lo = Math.max(lo, rhs / coef);
  };
  for (const c of coefs) bound(kg * c.b, c.ratingKg - c.tareKg - kg * c.a);
  bound(-kg * (steer.b - m * sum.b), kg * (steer.a - m * sum.a) + steer.tareKg - m * sum.t);
  return lo <= hi ? [lo, hi] : null;
}
