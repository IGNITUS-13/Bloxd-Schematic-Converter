const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

let bloxdToMinecraftMapping = {};

// Cargar la base de datos completa de bloques desde mapping.json
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
            processFile(e.dataTransfer.files);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files);
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
    const rawBytes = new Uint8Array(bloxdBuffer);
    
    // DETECCIÓN DINÁMICA DEL NOMBRE Y LAS MEDIDAS:
    let byteIdx = 0;
    while (byteIdx < rawBytes.length && rawBytes[byteIdx] >= 32 && rawBytes[byteIdx] <= 126) {
        byteIdx++;
    }
    
    // Saltamos el byte de control y leemos el tamaño REAL del mapa guardado por Bloxd
    byteIdx += 1;
    const width = view.getUint8(byteIdx++) || 16;
    const height = view.getUint8(byteIdx++) || 16;
    const length = view.getUint8(byteIdx++) || 16;
    
    // Forzamos al puntero a ir al inicio exacto de los bloques RLE (Dirección fija de Bloxd)
    byteIdx = 12; 
    
    const totalBlocks = width * height * length;
    
    // Rellenamos por defecto la matriz con AIRE (0) para vaciar los espacios alrededor de tu casa
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);
    
    let blockCount = 0;

    // MOTOR DE RECONSTRUCCIÓN REAL SIN LÍMITES DE TAMAÑO
    while (byteIdx + 1 < view.byteLength && blockCount < totalBlocks) {
        const count = view.getUint8(byteIdx++);
        const bloxdBlockId = view.getUint8(byteIdx++);
        
        if (count === 0 && bloxdBlockId === 0) break;
        
        // Mapear ID usando mapping.json. Si no existe en tu lista, coloca AIRE (0)
        const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined ? bloxdToMinecraftMapping[bloxdBlockId] : 0;
        
        for (let r = 0; r < count; r++) {
            if (blockCount < totalBlocks) {
                blocksArray[blockCount++] = mcId;
            }
        }
    }

    // CABECERA NBT ADAPTADA (Escribe en el archivo GZIP las medidas exactas que detectó de tu mapa)
    const nbtHeader = new Uint8Array([
        0x0A, 0x00, 0x09, 0x53, 0x63, 0x68, 0x65, 0x6D, 0x61, 0x74, 0x69, 0x63, 
        0x02, 0x00, 0x05, 0x57, 0x69, 0x64, 0x74, 0x68, 0x00, width,             
        0x02, 0x00, 0x06, 0x48, 0x65, 0x69, 0x67, 0x68, 0x74, 0x00, height,            
        0x02, 0x00, 0x06, 0x4C, 0x65, 0x6E, 0x67, 0x74, 0x68, 0x00, length,            
        0x08, 0x00, 0x09, 0x4D, 0x61, 0x74, 0x65, 0x72, 0x69, 0x61, 0x6C, 0x73, 0x00, 0x05, 0x41, 0x6C, 0x70, 0x68, 0x61, 
        0x07, 0x00, 0x06, 0x42, 0x6C, 0x6F, 0x63, 0x6B, 0x73                  
    ]);

    const rawNbt = new Uint8Array(nbtHeader.length + 4 + totalBlocks + 11 + totalBlocks + 1);
    let offset = 0;
    
    rawNbt.set(nbtHeader, offset); offset += nbtHeader.length;
    const lenView = new DataView(rawNbt.buffer);
    lenView.setInt32(offset, totalBlocks, false); offset += 4;
    rawNbt.set(blocksArray, offset); offset += totalBlocks;
    
    const dataHeader = new Uint8Array([0x07, 0x00, 0x04, 0x44, 0x61, 0x74, 0x61]); 
    rawNbt.set(dataHeader, offset); offset += dataHeader.length;
    lenView.setInt32(offset, totalBlocks, false); offset += 4;
    rawNbt.set(dataArray, offset); offset += totalBlocks;
    
    rawNbt[offset++] = 0x00; // TAG_End

    // ENCRIPTADO EN FLUJO GZIP AUTOMÁTICO
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(rawNbt.subarray(0, offset));
    writer.close();

    new Response(cs.readable).blob().then(gzipBlob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(gzipBlob);
        link.download = `${baseName}_converted.schematic`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('Success! Your compatible .schematic file has been downloaded.', 'success');
    }).catch(err => {
        showStatus('Compression failed.', 'error');
        console.error(err);
    });
}

function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
