function generateSchematic(bloxdBuffer, baseName) {
    const view = new DataView(bloxdBuffer);
    let byteIdx = 12; 
    
    // CALCULO DINÁMICO REAL: En lugar de 16 fijo, se adapta al tamaño del archivo de Bloxd
    const availableBytes = view.byteLength - byteIdx;
    const width = Math.max(1, Math.min(availableBytes, 8));
    const length = 1;
    const height = Math.max(1, Math.ceil(availableBytes / (width * 2))); // Basado en pares de bytes RLE
    
    const totalBlocks = width * height * length;
    const blocksArray = new Uint8Array(totalBlocks);
    const dataArray = new Uint8Array(totalBlocks);
    
    let blockCount = 0;

    // MOTOR DE RECONSTRUCCIÓN BINARIA RLE
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

    // CABECERA CON LAS MEDIDAS DETECTADAS (Ya no usa 16 fijo, inyecta Width, Height y Length reales)
    const nbtHeader = new Uint8Array([
        0x0A, 0x00, 0x09, 0x53, 0x63, 0x68, 0x65, 0x6D, 0x61, 0x74, 0x69, 0x63,
        0x02, 0x00, 0x05, 0x57, 0x69, 0x64, 0x74, 0x68, (width >> 8) & 0xFF, width & 0xFF,
        0x02, 0x00, 0x06, 0x48, 0x65, 0x69, 0x67, 0x68, 0x74, (height >> 8) & 0xFF, height & 0xFF,
        0x02, 0x00, 0x06, 0x4C, 0x65, 0x6E, 0x67, 0x74, 0x68, (length >> 8) & 0xFF, length & 0xFF,
        0x08, 0x00, 0x09, 0x4D, 0x61, 0x74, 0x65, 0x72, 0x69, 0x61, 0x6C, 0x73, 0x00, 0x05, 0x41, 0x6C, 0x70, 0x68, 0x61,
        0x07, 0x00, 0x06, 0x42, 0x6C, 0x6F, 0x63, 0x6B, 0x73
    ]);

    const rawNbt = new Uint8Array(nbtHeader.length + 4 + blocksArray.length + 11 + dataArray.length + 1);
    let offset = 0;
    
    rawNbt.set(nbtHeader, offset); offset += nbtHeader.length;
    
    const lenView = new DataView(rawNbt.buffer);
    lenView.setInt32(offset, blocksArray.length, false); offset += 4;
    rawNbt.set(blocksArray, offset); offset += blocksArray.length;
    
    const dataHeader = new Uint8Array([0x07, 0x00, 0x04, 0x44, 0x61, 0x74, 0x61]); 
    rawNbt.set(dataHeader, offset); offset += dataHeader.length;
    lenView.setInt32(offset, dataArray.length, false); offset += 4;
    rawNbt.set(dataArray, offset); offset += dataArray.length;
    
    rawNbt[offset++] = 0x00; // TAG_End

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
