const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

// Guardamos el texto original del cuadro para poder restablecerlo
const originalDropZoneHTML = dropZone.innerHTML;

let bloxdToMinecraftMapping = {};

// Mostrar estado inicial de carga en la consola y actualizar recuadro
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

// NBT Helper Functions
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
        for (let byte of encoded) {
            this.buffer.push(byte);
        }
    }

    writeByteArray(arr) {
        this.writeInt(arr.length);
        for (let byte of arr) {
            this.buffer.push(byte & 0xFF);
        }
    }

    toArray() {
        return new Uint8Array(this.buffer);
    }
}

function generateSchematic(bloxdBuffer, baseName) {
    updateProgressText("Rebuilding RLE blocks... 🛠️");
    
    const view = new DataView(bloxdBuffer);
    const rawBytes = new Uint8Array(bloxdBuffer);
    
    // Parse header: Find the end of the text header (first null byte)
    let headerEndIdx = 0;
    for (let i = 0; i < rawBytes.length; i++) {
        if (rawBytes[i] === 0) {
            headerEndIdx = i;
            break;
        }
    }
    
    // Read header as string
    const headerText = new TextDecoder().decode(rawBytes.slice(0, headerEndIdx));
    console.log("Header:", headerText);
    
    // Start reading binary data after the null terminator
    let byteIdx = headerEndIdx + 1;
    
    // Skip padding bytes until we find non-zero data
    while (byteIdx < rawBytes.length && rawBytes[byteIdx] === 0) {
        byteIdx++;
    }
    
    // Read dimensions (3 bytes for width, height, length)
    const width = view.getUint8(byteIdx++) || 16;
    const height = view.getUint8(byteIdx++) || 16;
    const length = view.getUint8(byteIdx++) || 16;
    
    console.log("Dimensions - Width:", width, "Height:", height, "Length:", length);
    console.log("Starting RLE decode at byte index:", byteIdx);
    
    const totalBlocks = width * height * length;
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);
    
    let blockCount = 0;

    // Parse RLE data: alternating block ID + count byte
    while (byteIdx + 1 < view.byteLength && blockCount < totalBlocks) {
        const bloxdBlockId = view.getUint8(byteIdx++);
        const count = view.getUint8(byteIdx++);
        
        // Stop on double null (0x00 0x00)
        if (bloxdBlockId === 0 && count === 0) {
            console.log("RLE decode complete at byte", byteIdx - 2);
            break;
        }
        
        // Map Bloxd block ID to Minecraft block ID
        const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined 
            ? bloxdToMinecraftMapping[bloxdBlockId] 
            : 0;
        
        // Fill blocks array with RLE count
        for (let r = 0; r < count; r++) {
            if (blockCount < totalBlocks) {
                blocksArray[blockCount++] = mcId;
            }
        }
    }

    // Fill remaining with air (0)
    while (blockCount < totalBlocks) {
        blocksArray[blockCount++] = 0;
    }

    console.log("Total blocks decoded:", blockCount, "Expected:", totalBlocks);

    updateProgressText("Injecting NBT tags... 🏷️");

    // Build NBT structure
    const nbt = new NBTWriter();
    
    // TAG_Compound with root tag "Schematic"
    nbt.writeByte(0x0A); // TAG_Compound
    nbt.writeString("Schematic");
    
    // Width (TAG_Short)
    nbt.writeByte(0x02);
    nbt.writeString("Width");
    nbt.writeShort(width);
    
    // Height (TAG_Short)
    nbt.writeByte(0x02);
    nbt.writeString("Height");
    nbt.writeShort(height);
    
    // Length (TAG_Short)
    nbt.writeByte(0x02);
    nbt.writeString("Length");
    nbt.writeShort(length);
    
    // Materials (TAG_String) - "Alpha" for modern MC
    nbt.writeByte(0x08);
    nbt.writeString("Materials");
    nbt.writeString("Alpha");
    
    // Blocks (TAG_Byte_Array)
    nbt.writeByte(0x07);
    nbt.writeString("Blocks");
    nbt.writeByteArray(blocksArray);
    
    // Data (TAG_Byte_Array) - block metadata
    nbt.writeByte(0x07);
    nbt.writeString("Data");
    nbt.writeByteArray(dataArray);
    
    // TAG_End
    nbt.writeByte(0x00);
    
    const nbtData = nbt.toArray();
    console.log("NBT data size:", nbtData.length);

    updateProgressText("Compressing into GZIP... 📦");

    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(nbtData);
    writer.close();

    new Response(cs.readable).blob().then(gzipBlob => {
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

    }).catch(err => {
        showStatus('Compression failed: ' + err.message, 'error');
        updateProgressText("<span style='color:#e06c75;'>GZIP Compression Failed ❌</span>");
        console.error(err);
    });
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
