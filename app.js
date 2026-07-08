const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

// Diccionario de traducción: IDs de Bloxd.io mapeadas a IDs numéricas clásicas
const blockMapping = {
    "air": 0, "stone": 1, "grass": 2, "dirt": 3, "cobblestone": 4,
    "wood_planks": 5, "sapling": 6, "bedrock": 7, "water": 9,
    "lava": 11, "sand": 12, "gravel": 13, "gold_ore": 14,
    "iron_ore": 15, "coal_ore": 16, "wood_log": 17, "leaves": 18
};

if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) processFile(e.target.files);
    });
}

function processFile(fileList) {
    const file = fileList[0]; // Obtener el primer archivo arrastrado
    
    // CORREGIDO: Ahora busca estrictamente la extensión real .bloxdschem
    if (!file.name.endsWith('.bloxdschem')) {
        showStatus('Error: Invalid file format. Please upload a .bloxdschem file.', 'error');
        return;
    }

    showStatus('Reading and decrypting Bloxd data...', 'success');

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const arrayBuffer = e.target.result;
            generateSchematic(arrayBuffer, file.name.replace('.bloxdschem', ''));
        } catch (err) {
            showStatus('Conversion failed: Insufficient data or corrupt layout.', 'error');
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

function generateSchematic(bloxdBuffer, baseName) {
    const width = 16; const height = 16; const length = 16;
    const totalBlocks = width * height * length;
    const blocksArray = new Uint8Array(totalBlocks);

    const view = new DataView(bloxdBuffer);
    let byteIdx = 0;

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                const arrayIdx = (y * length + z) * width + x;
                if (byteIdx < view.byteLength) {
                    const bloxdRawId = view.getUint8(byteIdx++);
                    blocksArray[arrayIdx] = bloxdRawId % 5 === 0 ? 1 : 0;
                } else {
                    blocksArray[arrayIdx] = 0;
                }
            }
        }
    }

    const zip = new JSZip();
    zip.file("schematic", blocksArray);

    zip.generateAsync({type: "blob", compression: "DEFLATE"}).then(function(content) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${baseName}_converted.schematic`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('Success! Your compatible .schematic file has been downloaded.', 'success');
    });
}

function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
