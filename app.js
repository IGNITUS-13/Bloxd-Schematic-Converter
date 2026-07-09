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
            processFile(e.dataTransfer.files);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files);
        }
    });
}

// Botón de diagnóstico para analizar Trees4.schematic
window.analyzeCorrectSchematic = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.schematic';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            analyzeSchematicFile(new Uint8Array(event.target.result), file.name);
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
};

async function analyzeSchematicFile(data, filename) {
    const decompressed = await decompressGzip(data);
    if (!decompressed) {
        console.log("Failed to decompress");
        return;
    }
    
    const nbt = parseNBT(decompressed);
    console.log("Schematic Analysis:", filename);
    console.log("NBT Root:", nbt);
    
    if (nbt.Schematic && nbt.Schematic.Blocks) {
        const blocks = nbt.Schematic.Blocks;
        const blockCounts = {};
        
        for (let block of blocks) {
            blockCounts[block] = (blockCounts[block] || 0) + 1;
        }
        
        console.log("Minecraft Block IDs found in", filename + ":");
        const sortedIds = Object.keys(blockCounts).sort((a, b) => blockCounts[b] - blockCounts[a]);
        for (let id of sortedIds) {
            console.log(`  MC ID ${id}: ${blockCounts[id]}x`);
        }
    }
}

async function decompressGzip(data) {
    try {
        const stream = new DecompressionStream('gzip');
        const writer = stream.writable.getWriter();
        writer.write(data);
        writer.close();
        
        let result = [];
        const reader = stream.readable.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            result.push(...value);
        }
        return new Uint8Array(result);
    } catch (e) {
        console.error("GZIP decompression error:", e);
        return null;
    }
}

function parseNBT(data) {
    let offset = 0;
    
    function readByte() { return data[offset++]; }
    function readShort() { const val = (data[offset] << 8) | data[offset + 1]; offset += 2; return val; }
    function readInt() { const val = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]; offset += 4; return val; }
    function readString() { const len = readShort(); const str = new TextDecoder().decode(data.slice(offset, offset + len)); offset += len; return str; }
    function readByteArray() { const len = readInt(); const arr = data.slice(offset, offset + len); offset += len; return arr; }
    
    function parseTag() {
        const tagType = readByte();
        if (tagType === 0x00) return null;
        
        const tagName = readString();
        let tagValue;
        
        switch(tagType) {
            case 0x01: tagValue = readByte(); break;
            case 0x02: tagValue = readShort(); break;
            case 0x03: tagValue = readInt(); break;
            case 0x07: tagValue = readByteArray(); break;
            case 0x08: tagValue = readString(); break;
            case 0x0A: 
                tagValue = {};
                while (offset < data.length) {
                    const subTag = parseTag();
                    if (subTag === null) break;
                    tagValue[subTag.name] = subTag.value;
                }
                break;
            default: tagValue = null;
        }
        return { name: tagName, value: tagValue };
    }
    
    const result = {};
    while (offset < data.length) {
        const tag = parseTag();
        if (tag === null) break;
        result[tag.name] = tag.value;
    }
    return result;
}

function processFile(fileList) {
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
// CLASE ENCARGADA DE ESCRIBIR EL FORMATO BINARIO NBT COMPILADO
class NBTWriter {
    constructor() {
        this.buffer = [];
    }
    writeByte(value) { this.buffer.push(value & 0xFF); }
    writeShort(value) { this.buffer.push((value >> 8) & 0xFF); this.buffer.push(value & 0xFF); }
    writeInt(value) { this.buffer.push((value >> 24) & 0xFF); this.buffer.push((value >> 16) & 0xFF); this.buffer.push((value >> 8) & 0xFF); this.buffer.push(value & 0xFF); }
    writeString(str) {
        const encoded = new TextEncoder().encode(str);
        this.writeShort(encoded.length);
        for (let byte of encoded) this.buffer.push(byte);
    }
    writeByteArray(arr) {
        this.writeInt(arr.length);
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
    
    // DETECCIÓN DINÁMICA DE DIMENSIONES:
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
    
    // REPARADO: Vaciamos todo el cubo inicializándolo con AIRE (0)
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);
    
    let blockCount = 0;

    // MOTOR DE DESCOMPRESIÓN RLE
    while (byteIdx + 1 < view.byteLength && blockCount < totalBlocks) {
        const count = view.getUint8(byteIdx++);
        const bloxdBlockId = view.getUint8(byteIdx++);
        
        if (count === 0 && bloxdBlockId === 0) break;
        
        // REPARADO: Si el bloque no está mapeado en mapping.json, se queda en AIRE (0) en vez de piedra maciza
        const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined ? bloxdToMinecraftMapping[bloxdBlockId] : 0;
        
        for (let r = 0; r < count; r++) {
            if (blockCount < totalBlocks) {
                blocksArray[blockCount++] = mcId;
            }
        }
    }

    updateProgressText("Injecting NBT tags... 🏷️");

    const writer = new NBTWriter();
    writer.writeByte(0x0A); writer.writeString(""); // TAG_Compound raíz obligatorio
    
    writer.writeByte(0x02); writer.writeString("Width"); writer.writeShort(width);
    writer.writeByte(0x02); writer.writeString("Height"); writer.writeShort(height);
    writer.writeByte(0x02); writer.writeString("Length"); writer.writeShort(length);
    writer.writeByte(0x08); writer.writeString("Materials"); writer.writeString("Alpha");
    
    writer.writeByte(0x07); writer.writeString("Blocks"); writer.writeByteArray(blocksArray);
    writer.writeByte(0x07); writer.writeString("Data"); writer.writeByteArray(dataArray);
    writer.writeByte(0x00); // TAG_End de cierre del archivo

    updateProgressText("Compressing into GZIP... 📦");

    try {
        const uncompressedData = writer.getUint8Array();
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
