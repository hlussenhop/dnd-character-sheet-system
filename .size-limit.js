export default [
  {
    name: "App entry",
    path: "dist/assets/index-*.js",
    limit: "500 KB",
    gzip: true,
    running: false,
  },
  {
    // Statically imported game data (species, spells, SRD monsters, ...). Large content lanes must use
    // lazy chunks (src/services/contentChunks.ts) instead of growing this file.
    name: "Static game data",
    path: "dist/assets/dataService-*.js",
    limit: "520 KB",
    gzip: true,
    running: false,
  },
]
