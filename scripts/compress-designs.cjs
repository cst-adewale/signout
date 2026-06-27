const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

function getDesignFiles() {
    return fs.readdirSync(assetsDir)
        .filter((file) => /^DES\d+\.(jpg|jpeg|png|webp)$/i.test(file))
        .sort((a, b) => {
            const aNum = parseInt(a.match(/\d+/)[0], 10);
            const bNum = parseInt(b.match(/\d+/)[0], 10);
            return aNum - bNum;
        });
}

async function compressAll() {
    const files = getDesignFiles();

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const inputPath = path.join(assetsDir, file);
        const outputPath = path.join(assetsDir, `des${index + 1}.webp`);

        console.log(`Processing: ${file} -> ${path.basename(outputPath)}...`);

        try {
            await sharp(inputPath)
                .resize({ width: 500, withoutEnlargement: true })
                .webp({ quality: 80, effort: 6 })
                .toFile(outputPath);

            const oldSize = (fs.statSync(inputPath).size / 1024).toFixed(1);
            const newSize = (fs.statSync(outputPath).size / 1024).toFixed(1);
            console.log(`✓ Compressed ${file} (${oldSize} KB) → ${path.basename(outputPath)} (${newSize} KB)`);
        } catch (err) {
            console.error(`❌ Failed to compress ${file}:`, err.message);
        }
    }
}

compressAll();
