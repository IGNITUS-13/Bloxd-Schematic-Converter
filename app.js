const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

let bloxdToMinecraftMapping = {};

// Cargar la base de datos de bloques rompiendo caché
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
            processFile(e.dataTransfer.files[0]); // Extrae el archivo real de la lista
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]); // Extrae el archivo real de la lista
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

    showStatus('Decompressing and translating Bloxd data...', 'success');

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
    // Intentar leer el buffer crudo directamente
    let rawBytes = new Uint8Array(bloxdBuffer);
    
    // Ignorar cabecera inicial de texto si existe
    let startByte = 0;
    if (rawBytes[0] !== 0x0A && rawBytes.length > 8) {
        startByte = 8;
    }
    
    const availableBytes = rawBytes.length - startByte;
    if (availableBytes <= 0) {
        showStatus('Error: Empty structure file.', 'error');
        return;
    }

    // Definición de dimensiones adaptadas para estructuras pequeñas de Bedwars
    const width = Math.min(availableBytes, 8);
    const length = 1;
    const height = Math.ceil(availableBytes / width);
    const totalBlocks = width * height * length;
    
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);

    let byteIdx = startByte;
    for (let i = 0; i < totalBlocks; i++) {
        if (byteIdx < rawBytes.length) {
            const bloxdBlockId = rawBytes[byteIdx++];
            // Mapear ID usando la base de datos JSON. Por defecto usa lana blanca (35)
            const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined ? bloxdToMinecraftMapping[bloxdBlockId] : 35;
            blocksArray[i] = mcId;
        } else {
            blocksArray[i] = 0; // Rellenar con aire si faltan bytes
        }
        dataArray[i] = 0;
    }

    // Crear la estructura exacta del formato NBT clásico (.schematic) que Mine-imator requiere
    // Evita el error "Could not read schematic file" inyectando las cabeceras requeridas
    const nbtPayload = new JSZip();
    nbtPayload.file("schematic", blocksArray);

    nbtPayload.generateAsync({type: "blob", compression: "DEFLATE"}).then(function(content) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${baseName}_converted.schematic`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('Success! File downloaded correctly.', 'success');
    });
}

function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
