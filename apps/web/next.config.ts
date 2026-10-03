import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@heist/shared'],
  // @heist/shared uses NodeNext-style `./x.js` specifiers that point at `.ts`
  // sources; teach webpack to resolve them (needed once a runtime value such
  // as BALANCE is imported, not just types).
  webpack(cfg) {
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

export default config;
