/** Audit declared package entry points against the files actually shipped.
 * Peer support is deliberately exact-version-only: ranges/tags/workspace aliases
 * are rejected instead of pretending to implement general npm semver resolution.
 */
export function auditPackage(manifest, files, { internalVersions = {}, installedPeers = {} } = {}) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const safePath = (value, label, exportTarget = false) => {
    if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.includes('*') || value.includes('?') || value.includes('#') || value.includes('%') || value.startsWith('/') || /^[a-z]+:/i.test(value)) {
      fail(`${label}: unsafe or unsupported file path ${JSON.stringify(value)} (wildcards are unsupported)`);
      return;
    }
    if (exportTarget && !value.startsWith('./')) {
      fail(`${label}: export targets must start with ./`);
      return;
    }
    const normalized = value.startsWith('./') ? value.slice(2) : value;
    if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..' || segment === 'node_modules')) {
      fail(`${label}: unsafe path traversal or empty segment in ${JSON.stringify(value)}`);
      return;
    }
    return normalized;
  };
  const shipped = new Set();
  for (const file of files) {
    const value = typeof file === 'string' ? file : file?.path;
    const normalized = safePath(value, 'packed file');
    if (normalized) shipped.add(normalized);
  }
  const reference = (value, label, exportTarget = false) => {
    const normalized = safePath(value, label, exportTarget);
    if (normalized && !shipped.has(normalized)) fail(`${label}: referenced file is missing from package: ${normalized}`);
  };
  const exportsTree = (value, label = 'exports') => {
    if (value === null) return;
    if (typeof value === 'string') return reference(value, label, true);
    if (Array.isArray(value)) return value.forEach((entry, index) => exportsTree(entry, `${label}[${index}]`));
    if (!value || typeof value !== 'object') return fail(`${label}: expected an export target, condition object, array, or null`);
    for (const [key, target] of Object.entries(value)) {
      if (key.includes('*') || key.includes('..') || key.includes('\\')) fail(`${label}: unsafe or unsupported export key ${JSON.stringify(key)}`);
      if (key !== '.' && (key.startsWith('.') || key.includes('/'))) safePath(key, `${label} key`, true);
      exportsTree(target, `${label}[${JSON.stringify(key)}]`);
    }
  };
  if (!manifest || typeof manifest !== 'object') throw new Error('Package manifest must be an object');
  if (manifest.exports !== undefined) exportsTree(manifest.exports);
  for (const field of ['main', 'module', 'types', 'typings', 'style', 'css', 'worker']) {
    if (manifest[field] !== undefined) reference(manifest[field], field);
  }
  for (const field of ['styles', 'workers']) {
    if (manifest[field] === undefined) continue;
    const values = typeof manifest[field] === 'string' ? [manifest[field]] : Array.isArray(manifest[field]) ? manifest[field] : Object.values(manifest[field] ?? {});
    values.forEach((value, index) => reference(value, `${field}[${index}]`));
  }
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (Object.hasOwn(manifest.scripts ?? {}, hook)) fail(`scripts.${hook}: lifecycle install hooks are forbidden in the shipped package`);
  }
  const exact = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  for (const [name, version] of Object.entries(manifest.peerDependencies ?? {})) {
    if (typeof version !== 'string' || !exact.test(version)) {
      fail(`peerDependencies.${name}: only exact versions are supported by this audit; received ${JSON.stringify(version)}`);
    } else if (!Object.hasOwn(installedPeers, name)) {
      fail(`peerDependencies.${name}: missing installed peer; requires exact ${version}`);
    } else if (installedPeers[name] !== version) {
      fail(`peerDependencies.${name}: incompatible installed peer ${installedPeers[name]}; requires exact ${version}`);
    }
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (Object.hasOwn(internalVersions, name) && version !== internalVersions[name]) fail(`${field}.${name}: internal dependency must use exact ${internalVersions[name]}; received ${version}`);
    }
  }
  if (errors.length) throw new Error(`Package audit failed:\n${errors.map((message) => `- ${message}`).join('\n')}`);
  return { name: manifest.name, version: manifest.version, files: [...shipped].sort() };
}
