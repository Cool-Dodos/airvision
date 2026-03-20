const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'client-ng', 'src', 'assets', 'india-official.json');
const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

let changed = false;
let replaceIndex = -1;

const coords = data.geometry.coordinates;
for (let i = 0; i < coords.length; i++) {
  for (let j = 0; j < coords[i].length; j++) {
    const ring = coords[i][j];
    for (let k = 0; k < ring.length; k++) {
      const pt = ring[k];
      if (Math.abs(pt[0] - 73.45) < 0.2 && Math.abs(pt[1] - 31.8) < 0.2) {
        console.log('Found point to replace at index', k, ':', pt);
        
        // Remove this point and the next one (73.8, 32.5)
        // And insert [73.1, 32.2]
        ring.splice(k, 2, [73.1, 32.2]);
        changed = true;
        break;
      }
    }
  }
}

if (changed) {
  fs.writeFileSync(targetPath, JSON.stringify(data));
  console.log('Successfully updated india-official.json coordinates.');
} else {
  console.error('Could not find the specified coordinate points to replace.');
}
