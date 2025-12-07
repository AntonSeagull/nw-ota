import * as fs from 'node:fs';
import * as path from 'node:path';

import yazl from 'yazl';

export async function createZipFromDirectory(
  sourceDir: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();

    function addDirectory(dir: string, basePath: string = '') {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const relativePath = path.join(basePath, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          addDirectory(fullPath, relativePath);
        } else {
          zipfile.addFile(fullPath, relativePath);
        }
      }
    }

    addDirectory(sourceDir);

    zipfile.end();

    const writeStream = fs.createWriteStream(outputPath);
    zipfile.outputStream.pipe(writeStream);

    writeStream.on('close', () => {
      resolve();
    });

    writeStream.on('error', (error: Error) => {
      reject(error);
    });
  });
}

