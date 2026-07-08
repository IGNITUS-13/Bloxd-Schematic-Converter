const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

let bloxdToMinecraftMapping = {};

// Cargar mapeo rompiendo la caché
fetch('mapping.json?v=' + Date.now())
    .then(response => response.json())
    .then(data => {
        bloxdToMinecraftMapping = data;
        console.log("Database synced:", Object.keys(bloxdToMinecraftMapping).length);
    })
    .catch(err => console.error("Error loading JSON:", err));

if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]); // REPARADO: Se extrae el primer archivo real [0]
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]); // REPARADO: Se extrae el primer archivo real [0]
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

    showStatus('Processing structure...', 'success');

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
    const startByte = 8; // Saltar cabecera
    const availableBytes = view.byteLength - startByte;
    
    if (availableBytes <= 0) {
        showStatus('Error: Empty structure file.', 'error');
        return;
    }

    // Estructura lineal adaptada al tamaño exacto del archivo
    const width = Math.min(availableBytes, 8);
    const length = 1;
    const height = Math.ceil(availableBytes / width);
    const totalBlocks = width * height * length;
    
    const blocksArray = new Uint8Array(totalBlocks);
    let byteIdx = startByte; 

    for (let i = 0; i < totalBlocks; i++) {
        if (byteIdx < view.byteLength) {
            const bloxdBlockId = view.getUint8(byteIdx++);
            const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined ? bloxdToMinecraftMapping[bloxdBlockId] : 35;
            blocksArray[i] = mcId;
        } else {
            blocksArray[i] = 0;
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
        showStatus('Success! File downloaded.', 'success');
    });
}

// Mostrar alertas visuales
function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
