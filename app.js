const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

const originalDropZoneHTML = dropZone.innerHTML;

let bloxdToMinecraftMapping = {};

updateProgressText("Connecting block database... ⏳");

fetch('mapping.json?v=' + Date.now())
    .then(response => response.json())
    .then(data => {
        bloxdToMinecraftMapping = data;
        console.log("Database synced successfully:", Object.keys(bloxdToMinecraftMapping).length);
        updateProgressText("Drag & Drop your .bloxdschem file here 🚀<br><span style='font-size:0.8rem;color:#5c6370;'>or click to browse your computer</span>");
    })
    .catch(err => {
        console.error("Error loading JSON mapping:", err);
        updateProgressText("<span style='color:#e06c75;'>Database Connection Error ❌</span>");
    });

if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files); // Enviamos la lista de archivos cruda
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files); // Enviamos la lista de archivos cruda
        }
    });
}

function processFile(fileList) {
    // REPARADO: Extraemos estrictamente el primer archivo real usando el índice de la lista
    const file = fileList[0];

    if (!file) {
        showStatus('Error: No file detected.', 'error');
        updateProgressText("<span style='color:#e06c75;'>No file detected ❌</span>");
        return;
    }
    
    if (!file.name.endsWith('.bloxdschem')) {
        showStatus('Error: Invalid file format. Please upload a .bloxdschem file.', 'error');
        updateProgressText("<span style='color:#e06c75;'>Invalid format! Must be .bloxdschem ❌</span>");
        return;
    }

    showStatus('Processing structure data...', 'success');
    updateProgressText("Reading binary bytes... 📑");

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const arrayBuffer = e.target.result;
            generateSchematic(arrayBuffer, file.name.replace('.bloxdschem', ''));
        } catch (err) {
            showStatus('Conversion failed: ' + err.message, 'error');
            updateProgressText("<span style='color:#e06c75;'>Conversion failed ❌</span>");
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

// CLASE NBTWRITER REPARADA CON ESCRITURA EN BIG-ENDIAN ESTRICTA PARA MINECRAFT
class NBTWriter {
    constructor() {
        this.buffer = [];
    }
    writeByte(value) { 
        this.buffer.push(value & 0xFF); 
    }
    writeShort(value) { 
        this.buffer.push((value >> 8) & 0xFF); 
        this.buffer.push(value & 0xFF); 
    }
    writeInt(value) { 
        this.buffer.push((value >> 24) & 0xFF); 
        this.buffer.push((value >> 16) & 0xFF); 
        this.buffer.push((value >> 8) & 0xFF); 
        this.buffer.push(value & 0xFF); 
    }
    writeString(str) {
        const encoded = new TextEncoder().encode(str);
        this.writeShort(encoded.length);
        for (let byte of encoded) this.buffer.push(byte);
    }
    writeByteArray(arr) {
        this.writeInt(arr.length); // Escribe la longitud del array en Big-Endian antes de los bloques
        for (let byte of arr) this.buffer.push(byte & 0xFF);
    }
    getUint8Array() {
        return new Uint8Array(this.buffer);
    }
}

async function generateSchematic(bloxdBuffer, baseName) {
    updateProgressText("Rebuilding RLE blocks... 🛠️");
    
    const view = new DataView(bloxdBuffer);
    const rawBytes = new Uint8Array(bloxdBuffer);
    
    // DETECCIÓN DINÁMICA DEL NOMBRE Y LAS MEDIDAS:
    let byteIdx = 0;
    while (byteIdx < rawBytes.length && rawBytes[byteIdx] >= 32 && rawBytes[byteIdx] <= 126) {
        byteIdx++;
    }
    byteIdx += 1;
    
    const width = view.getUint8(byteIdx++) || 16;
    const height = view.getUint8(byteIdx++) || 16;
    const length = view.getUint8(byteIdx++) || 16;
    
    if (byteIdx < 12) byteIdx = 12;
    
    const totalBlocks = width * height * length;
    
    // REPARADO: Inicializamos con AIRE (0) para vaciar los espacios alrededor de tu casa
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);
    
    let blockCount = 0;

    // MOTOR DE DESCOMPRESIÓN RLE BINARIO
    while (byteIdx + 1 < view.byteLength && blockCount < totalBlocks) {
        const count = view.getUint8(byteIdx++);
        const bloxdBlockId = view.getUint8(byteIdx++);
        
        if (count === 0 && bloxdBlockId === 0) break;
        
        // Si el bloque no está mapeado, por defecto es AIRE (0) en vez de piedra sólida
        const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined ? bloxdToMinecraftMapping[bloxdBlockId] : 0;
        
        for (let r = 0; r < count; r++) {
            if (blockCount < totalBlocks) {
                blocksArray[blockCount++] = mcId;
            }
        }
    }

    updateProgressText("Injecting NBT tags... 🏷️");

    const writer = new NBTWriter();
    writer.writeByte(0x0A); writer.writeString(""); // TAG_Compound raíz obligatorio sin nombre
    
    writer.writeByte(0x02); writer.writeString("Width"); writer.writeShort(width);
    writer.writeByte(0x02); writer.writeString("Height"); writer.writeShort(height);
    writer.writeByte(0x02); writer.writeString("Length"); writer.writeShort(length);
    writer.writeByte(0x08); writer.writeString("Materials"); writer.writeString("Alpha");
    
    writer.writeByte(0x07); writer.writeString("Blocks"); writer.writeByteArray(blocksArray);
    writer.writeByte(0x07); writer.writeString("Data"); writer.writeByteArray(dataArray);
    writer.writeByte(0x00); // TAG_End de cierre de la raíz

    updateProgressText("Compressing into GZIP... 📦");

    try {
        const uncompressedData = writer.getUint8Array();
        
        // COMPRESIÓN GZIP DIRECTA NATIVA DE UNA CAPA (Igual al Trees4 original sin carpetas Zip)
        const cs = new CompressionStream('gzip');
        const compressWriter = cs.writable.getWriter();
        compressWriter.write(uncompressedData);
        compressWriter.close();

        const gzipBlob = await new Response(cs.readable).blob();
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(gzipBlob);
        link.download = `${baseName}_converted.schematic`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showStatus('Success! Your compatible .schematic file has been downloaded.', 'success');
        updateProgressText("<span style='color:#00e6bc;'>Finished! File Downloaded Check your folder ✅</span>");
        
        setTimeout(() => {
            updateProgressText("Drag & Drop your .bloxdschem file here 🚀<br><span style='font-size:0.8rem;color:#5c6370;'>or click to browse your computer</span>");
        }, 4000);

    } catch (err) {
        showStatus('Compression failed.', 'error');
        updateProgressText("<span style='color:#e06c75;'>GZIP Compression Failed ❌</span>");
        console.error(err);
    }
}

function updateProgressText(htmlContent) {
    if (dropZone) {
        const pTag = dropZone.querySelector('p');
        const spanTag = dropZone.querySelector('span');
        if (pTag) {
            pTag.innerHTML = htmlContent;
            if (spanTag) spanTag.style.display = htmlContent.includes("Drag & Drop") ? "block" : "none";
        } else {
            dropZone.innerHTML = htmlContent;
        }
    }
}

function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
