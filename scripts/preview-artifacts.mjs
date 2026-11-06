import { loadDistribution } from './distribution-artifacts.mjs';

export function loadPreview(file) {
  return loadDistribution(file, { preview: true });
}
