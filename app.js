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

// Add a button for analyzing Trees4.schematic
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

function analyzeSchematicFile(data, filename) {
    // Decompress GZIP
    const decompressed = decompressGzip(data);
    if (!decompressed) {
        console.log("Failed to decompress");
        return;
    }
    
    // Parse NBT
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
        
        console.log("\n=== SUGGESTED MAPPING ===");
        console.log("Based on this correct schematic, the Bloxd IDs should map to:");
        console.log("(You'll need to match these MC IDs with the Bloxd IDs from Test.bloxdschem)");
    }
}

function decompressGzip(data) {
    try {
        const stream = new DecompressionStream('gzip');
        const writer = stream.writable.getWriter();
        writer.write(data);
        writer.close();
        
        let result = [];
        const reader = stream.readable.getReader();
        
        // Read synchronously (not ideal but for analysis)
        return new Promise((resolve) => {
            (async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        result.push(...value);
                    }
                    resolve(new Uint8Array(result));
                } catch (e) {
                    console.error("Decompression error:", e);
                    resolve(null);
                }
            })();
        });
    } catch (e) {
        console.error("GZIP decompression not available:", e);
        return null;
    }
}

function parseNBT(data) {
    // Simple NBT parser for analysis
    let offset = 0;
    
    function readByte() {
        return data[offset++];
    }
    
    function readShort() {
        const val = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        return val;
    }
    
    function readInt() {
        const val = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
        offset += 4;
        return val;
    }
    
    function readString() {
        const len = readShort();
        const str = new TextDecoder().decode(data.slice(offset, offset + len));
        offset += len;
        return str;
    }
    
    function readByteArray() {
        const len = readInt();
        const arr = data.slice(offset, offset + len);
        offset += len;
        return arr;
    }
    
    function parseTag() {
        const tagType = readByte();
        
        if (tagType === 0x00) return null; // TAG_End
        
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
    
    console.log("Total file size:", rawBytes.length, "bytes");
    console.log("First 50 bytes:", Array.from(rawBytes.slice(0, 50)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    
    // Parse header
    let headerEndIdx = 0;
    for (let i = 0; i < rawBytes.length; i++) {
        if (rawBytes[i] === 0) {
            headerEndIdx = i;
            break;
        }
    }
    
    const headerText = new TextDecoder().decode(rawBytes.slice(0, headerEndIdx));
    console.log("Header:", headerText, "ends at index", headerEndIdx);
    
    let byteIdx = headerEndIdx + 1;
    
    // Try reading dimensions directly
    const width = view.getUint8(byteIdx);
    const height = view.getUint8(byteIdx + 1);
    const length = view.getUint8(byteIdx + 2);
    
    console.log("Potential dimensions at offset", byteIdx, ":");
    console.log("  Byte 0:", width, "Byte 1:", height, "Byte 2:", length);
    
    let actualWidth, actualHeight, actualLength;
    if (width > 0 && width <= 256 && height > 0 && height <= 256 && length > 0 && length <= 256) {
        console.log("✓ Dimensions look valid");
        actualWidth = width;
        actualHeight = height;
        actualLength = length;
        byteIdx += 3;
    } else {
        console.log("✗ Dimensions don't look valid, trying with padding skip...");
        while (byteIdx < rawBytes.length && rawBytes[byteIdx] === 0) {
            byteIdx++;
        }
        actualWidth = view.getUint8(byteIdx++);
        actualHeight = view.getUint8(byteIdx++);
        actualLength = view.getUint8(byteIdx++);
        console.log("After padding skip - Dimensions:", actualWidth, actualHeight, actualLength);
    }
    
    console.log("Final Dimensions - Width:", actualWidth, "Height:", actualHeight, "Length:", actualLength);
    console.log("Starting RLE decode at byte index:", byteIdx);
    
    const totalBlocks = actualWidth * actualHeight * actualLength;
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);
    
    let blockCount = 0;
    let rleBlocks = {};

    while (byteIdx + 1 < view.byteLength && blockCount < totalBlocks) {
        const bloxdBlockId = view.getUint8(byteIdx++);
        const count = view.getUint8(byteIdx++);
        
        if (bloxdBlockId === 0 && count === 0) {
            console.log("RLE decode complete at byte", byteIdx - 2);
            break;
        }
        
        if (!rleBlocks[bloxdBlockId]) {
            rleBlocks[bloxdBlockId] = 0;
        }
        rleBlocks[bloxdBlockId] += count;
        
        const mcId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined 
            ? bloxdToMinecraftMapping[bloxdBlockId] 
            : 0;
        
        for (let r = 0; r < count; r++) {
            if (blockCount < totalBlocks) {
                blocksArray[blockCount++] = mcId;
            }
        }
    }

    console.log("Block IDs found in RLE data:", rleBlocks);
    console.log("Block ID mappings:", Object.entries(rleBlocks).map(([id, count]) => `${id}(${count}x) → MC${bloxdToMinecraftMapping[id] || 0}`).join(", "));

    while (blockCount < totalBlocks) {
        blocksArray[blockCount++] = 0;
    }

    console.log("Total blocks decoded:", blockCount, "Expected:", totalBlocks);

    updateProgressText("Injecting NBT tags... 🏷️");

    const nbt = new NBTWriter();
    
    nbt.writeByte(0x0A);
    nbt.writeString("Schematic");
    
    nbt.writeByte(0x02);
    nbt.writeString("Width");
    nbt.writeShort(actualWidth);
    
    nbt.writeByte(0x02);
    nbt.writeString("Height");
    nbt.writeShort(actualHeight);
    
    nbt.writeByte(0x02);
    nbt.writeString("Length");
    nbt.writeShort(actualLength);
    
    nbt.writeByte(0x08);
    nbt.writeString("Materials");
    nbt.writeString("Alpha");
    
    nbt.writeByte(0x07);
    nbt.writeString("Blocks");
    nbt.writeByteArray(blocksArray);
    
    nbt.writeByte(0x07);
    nbt.writeString("Data");
    nbt.writeByteArray(dataArray);
    
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
