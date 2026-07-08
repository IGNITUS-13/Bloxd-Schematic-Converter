const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

// Variable global que guardará el mapa completo de bloques
let bloxdToMinecraftMapping = {};

// Cargar la base de datos completa desde el archivo mapping.json
fetch('mapping.json')
    .then(response => response.json())
    .then(data => {
        bloxdToMinecraftMapping = data;
        console.log("¡Base de datos de bloques cargada con éxito!", Object.keys(bloxdToMinecraftMapping).length, "bloques listos.");
    })
    .catch(err => console.error("Error al cargar la base de datos de bloques:", err));

if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        dropZone.classList.add('drag-over'); 
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]); // Corregido: Envía el objeto de archivo puro
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]); // Corregido: Envía el objeto de archivo puro
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

    showStatus('Reading and decrypting Bloxd data...', 'success');

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
    
    // Omitimos los primeros 8 bytes de cabecera de texto
    const startByte = 8;
    const availableBytes = view.byteLength - startByte;
    
    if (availableBytes <= 0) {
        showStatus('Error: The file does not contain block data.', 'error');
        return;
    }

    // AUTODETECCIÓN INTELIGENTE DE TAMAÑO:
    // Calculamos el tamaño aproximado de una caja cúbica según la cantidad de bloques reales
    const side = Math.max(1, Math.floor(Math.cbrt(availableBytes)));
    const width = side;
    const length = side;
    // La altura absorbe todo lo que sobre para asegurar que ningún bloque se quede fuera
    const height = Math.ceil(availableBytes / (width * length));
    
    const totalBlocks = width * height * length;
    const blocksArray = new Uint8Array(totalBlocks);

    let byteIdx = startByte; 

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                const arrayIdx = (y * length + z) * width + x;
                
                if (byteIdx < view.byteLength) {
                    const bloxdBlockId = view.getUint8(byteIdx++);
                    // Traducir con el JSON. Si no está mapeado, por ahora usa Lana Blanca (35) para Bedwars
                    const minecraftCompatibleId = bloxdToMinecraftMapping[bloxdBlockId] !== undefined ? bloxdToMinecraftMapping[bloxdBlockId] : 35;
                    blocksArray[arrayIdx] = minecraftCompatibleId;
                } else {
                    blocksArray[arrayIdx] = 0; // Aire para rellenar los huecos vacíos
                }
            }
        }
    }

    // Empaquetar usando JSZip
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
    });
}

function showStatus(message, type) {
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message ' + (type === 'success' ? 'status-success' : 'status-error');
    }
}
