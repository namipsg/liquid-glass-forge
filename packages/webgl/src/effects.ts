import { decodeSrgb, ContractError } from '@liquid-glass-forge/core';
export interface WebGLEffects {
  readonly model: 'rounded-material-v1'; readonly blurRadius?: number; readonly dispersion?: number;
  readonly tint?: readonly [number, number, number, number]; readonly rim?: number; readonly specular?: number;
  readonly light?: readonly [number, number];
}
export function effects(input?: WebGLEffects) {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input) ||
      Reflect.ownKeys(input).some(k => typeof k !== 'string' || !['model','blurRadius','dispersion','tint','rim','specular','light'].includes(k)) || input.model !== 'rounded-material-v1')) throw new ContractError('Invalid WebGL material');
  const blur = input?.blurRadius === undefined ? 0 : input.blurRadius, dispersion = input?.dispersion === undefined ? 0 : input.dispersion, rim = input?.rim === undefined ? 0 : input.rim, specular = input?.specular === undefined ? 0 : input.specular;
  if (!Number.isInteger(blur) || blur < 0 || blur > 16 || ![dispersion,rim,specular].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) throw new ContractError('Invalid WebGL effect range');
  const tint = input?.tint === undefined ? [0,0,0,0] : input.tint, light = input?.light === undefined ? [-Math.SQRT1_2,-Math.SQRT1_2] : input.light;
  if (!Array.isArray(tint) || tint.length !== 4 || !tint.every(v => Number.isFinite(v) && v >= 0 && v <= 1) || !Array.isArray(light) || light.length !== 2 || !light.every(Number.isFinite)) throw new ContractError('Invalid tint or light');
  const scale = Math.max(Math.abs(light[0]!),Math.abs(light[1]!)); if (!scale) throw new ContractError('Light must be nonzero');
  const x = light[0]! / scale, y = light[1]! / scale, length = Math.hypot(x,y);
  return Object.freeze({ blur, dispersion, rim, specular, tint: [decodeSrgb(tint[0]!),decodeSrgb(tint[1]!),decodeSrgb(tint[2]!),tint[3]!] as const, light: [x/length,y/length] as const });
}
