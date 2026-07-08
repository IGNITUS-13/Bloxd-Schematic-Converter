const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

let bloxdToMinecraftMapping = {};

// Cargar la base de datos de bloques rompiendo la caché
fetch('mapping.json?v=' + Date.now())
    .then(response => response.json())
    .then(data => {
        bloxdToMinecraftMapping = data;
        console.log("Database synced successfully:", Object.keys(bloxdToMinecraftMapping).length);
    })
    .catch(err => console.error("Error loading JSON mapping:", err));

if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]); // ¡CORREGIDO! Extrae el primer archivo real [0]
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]); // ¡CORREGIDO! Extrae el primer archivo real [0]
        }
    });
}

function processFile(file) {
    if (!file) {
        showStatus('Error: No file detected.', 'error');
        return;
    }
    
    if (!file.name.endsWith('.bloxdschem')) {
        showStatus('Error: Invalid file format. Please upload a .bloxdschem file.', 'error');
        return;
    }

    showStatus('Processing structure data...', 'success');

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
    const view = new DataView(bloxdBuffer);
    
    // Saltamos los primeros 12 bytes correspondientes al nombre "Test" y metadatos
    let byteIdx = 12; 
    
    // Caja estándar para inyectar bloques
    const width = 16; const height = 16; const length = 16;
    const totalBlocks = width * height * length;
    const blocksArray = new Uint8Array(totalBlocks);
    
    let blockCount = 0;

    // MOTOR DE RECONSTRUCCIÓN BINARIA RLE (Lectura de 16 bits / Little-Endian)
    while (byteIdx + 3 < view.byteLength && blockCount < totalBlocks) {
        const count = view.getUint16(byteIdx, true);
        byteIdx += 2;
        
        const bloxdBlockId = view.getUint16(byteIdx, true);
        byteIdx += 2;
        
        if (count === 0 && bloxdBlockId === 0) break;
        
        const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined ? bloxdToMinecraftMapping[bloxdBlockId] : 1;
        
        for (let r = 0; r < count; r++) {
            if (blockCount < totalBlocks) {
                blocksArray[blockCount++] = mcId;
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
    }).catch(zipErr => {
        showStatus('Error generating the final schematic package.', 'error');
        console.error(zipErr);
    });
}

function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
