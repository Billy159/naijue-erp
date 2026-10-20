export function assertReleasePath(path) {
  // This is compiled credential-reading code, not a deployed credential file.
  const credentialModule = path === 'server/database/credentials.js';
  if (/^(?:inputs|backup|references|logs|work|node_modules|config|\.git|\.runtime)(?:\/|$)/i.test(path)
    || (!credentialModule && /(?:^|\/)(?:\.env[^/]*|credentials[^/]*|secrets[^/]*|id_rsa|id_ed25519)(?:\/|$)/i.test(path))
    || /\.(?:xlsx?|xlsm|csv|tsv|dump|bak|pem|key|p12|pfx|sqlite|db|ts|jsx|map)$/i.test(path)
    || /(?:^|\/)product-media(?:\/|$)/i.test(path)) throw new Error(`Forbidden release path: ${path}`);
  if (!(path.startsWith('web/') || path.startsWith('server/') || ['package.json', 'package-lock.json', 'build-manifest.json', 'frontend-manifest.json', 'release-manifest.json'].includes(path))) throw new Error(`Unexpected release path: ${path}`);
}
