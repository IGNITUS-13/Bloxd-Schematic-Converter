const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

let bloxdToMinecraftMapping = {};

// Cargar la base de datos de bloques rompiendo la caché del navegador
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
    
    // Saltamos los primeros 12 bytes correspondientes al nombre "Test" y metadatos reales
    let byteIdx = 12; 
    
    // Caja estándar para inyectar bloques
    const width = 16; const height = 16; const length = 16;
    const totalBlocks = width * height * length;
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);
    
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

    // CABECERA OFICIAL DE MINECRAFT LEGACY (Alineada con tu captura de Hexed.it)
    const nbtHeader = new Uint8Array([
        0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, // Cabecera GZIP oficial de Mojang / 1F 8B
        0x0A, 0x00, 0x09, 0x53, 0x63, 0x68, 0x65, 0x6D, 0x61, 0x74, 0x69, 0x63, // TAG_Compound "Schematic" raíz obligatoria
        0x02, 0x00, 0x05, 0x57, 0x69, 0x64, 0x74, 0x68, 0x00, 0x10, // Width (Short = 16)
        0x02, 0x00, 0x06, 0x48, 0x65, 0x69, 0x67, 0x68, 0x74, 0x00, 0x10, // Height (Short = 16)
        0x02, 0x00, 0x06, 0x4C, 0x65, 0x6E, 0x67, 0x74, 0x68, 0x00, 0x10, // Length (Short = 16)
        0x08, 0x00, 0x09, 0x4D, 0x61, 0x74, 0x65, 0x72, 0x69, 0x61, 0x6C, 0x73, 0x00, 0x05, 0x41, 0x6C, 0x70, 0x68, 0x61, // Materials ("Alpha")
        0x07, 0x00, 0x06, 0x42, 0x6C, 0x6F, 0x63, 0x6B, 0x73 // TAG_Byte_Array "Blocks"
    ]);

    // Combinar los bloques en la estructura secuencial NBT
    const finalBuffer = new Uint8Array(nbtHeader.length + 4 + blocksArray.length + 11 + dataArray.length + 1);
    let offset = 0;
    
    finalBuffer.set(nbtHeader, offset); offset += nbtHeader.length;
    
    const lenView = new DataView(finalBuffer.buffer);
    lenView.setInt32(offset, blocksArray.length, false); offset += 4;
    finalBuffer.set(blocksArray, offset); offset += blocksArray.length;
    
    // Añadir array "Data" obligatorio de metadatos
    const dataHeader = new Uint8Array([0x07, 0x00, 0x04, 0x44, 0x61, 0x74, 0x61]); 
    finalBuffer.set(dataHeader, offset); offset += dataHeader.length;
    lenView.setInt32(offset, dataArray.length, false); offset += 4;
    finalBuffer.set(dataArray, offset); offset += dataArray.length;
    
    finalBuffer[offset++] = 0x00; // TAG_End

    // Descarga directa del archivo con los bytes idénticos mapeados de tu imagen
    const blob = new Blob([finalBuffer.subarray(0, offset)], {type: "application/octet-stream"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${baseName}_converted.schematic`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showStatus('Success! Your compatible .schematic file has been downloaded.', 'success');
}

function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
