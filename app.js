const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusDiv = document.getElementById('status');

const originalDropZoneHTML = dropZone.innerHTML;

let bloxdToMinecraftMapping = {};

updateProgressText("Connecting block database... ⏳");

// Cargar la base de datos de bloques desde el JSON rompiendo la caché
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
            processFile(e.dataTransfer.files[0]); // Extrae estrictamente el archivo real de la lista
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]); // Extrae estrictamente el archivo real de la lista
        }
    });
}

function processFile(file) {
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
