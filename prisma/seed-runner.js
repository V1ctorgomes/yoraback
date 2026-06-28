const { existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const compiledSeed = path.join(__dirname, '../dist/prisma/seed.js');

if (!existsSync(compiledSeed)) {
  execSync('npm run build:seed', { stdio: 'inherit' });
}

require(compiledSeed);
