let cryptoKey = null;
let currentFile = null;
let uploadedFiles = []; // Добавляем объявление переменной

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initDragAndDrop();
    initEventListeners();
});

function getFileIcon(file) {
    if (file.name.endsWith('.enc')) return 'lock';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'movie';
    return 'description';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    updateFileList();
    showStatus('Файл удалён', 'success');
}

function clearAllFiles() {
    uploadedFiles = [];
    updateFileList();
    showStatus('Все файлы удалены', 'success');
}

function updateFileList() {
    const fileItems = document.getElementById('fileItems');
    fileItems.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <span class="material-icons">${getFileIcon(file)}</span>
                <div class="filename">${file.name}</div>
            <span class="file-size">(${formatFileSize(file.size)})</span>
            <button class="delete-btn" onclick="removeFile(${index})">
                <span class="material-icons">delete</span>
            </button>
        `;
        fileItems.appendChild(item);
    });

    document.getElementById('fileCount').textContent = uploadedFiles.length;
}

function saveFile(blobData, filename) {
    const url = URL.createObjectURL(blobData);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

async function generateKey() {
    const key = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    
    const exported = await window.crypto.subtle.exportKey("raw", key);
    const keyFile = new Blob([exported], { type: "application/octet-stream" });
    
    // Предложить сохранить ключ
    const a = document.createElement('a');
    a.href = URL.createObjectURL(keyFile);
    a.download = 'encryption.key';
    a.click();
}

function initDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', handleFileSelect);

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        fileInput.files = e.dataTransfer.files;
        handleFileSelect();
    });
}

function initEventListeners() {
    document.getElementById('keyInput').addEventListener('change', handleKeySelect);
}

async function handleFileSelect() {
    const files = Array.from(document.getElementById('fileInput').files);
    if (files.length === 0) return;

    // Добавляем только новые файлы
    const newFiles = files.filter(f => 
        !uploadedFiles.some(existing => 
            existing.name === f.name && existing.size === f.size
        )
    );

    uploadedFiles = [...uploadedFiles, ...newFiles];
    updateFileList();
    updateUI();
    showStatus(`Добавлено ${newFiles.length} файлов`, 'success');
}

async function handleKeySelect() {
    try {
        const file = document.getElementById('keyInput').files[0];
        if (!file) return;

        // 3. Явная проверка формата ключа
        const keyData = await file.arrayBuffer();
        if (keyData.byteLength !== 32) {
            throw new Error('Неверный формат ключа (должен быть 256-bit)');
        }

        cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
        );
        
        document.getElementById('keyStatus').classList.add('has-key');
        updateUI(); // 4. Явный вызов обновления
        showStatus('Ключ успешно загружен', 'success');
    } catch (error) {
        cryptoKey = null;
        updateUI();
        showStatus(`Ошибка: ${error.message}`, 'error');
    }
}

function updateUI() {
    const hasFiles = uploadedFiles.length > 0;
    const hasKey = !!cryptoKey;
    
    const encryptBtn = document.querySelector('.encrypt');
    const decryptBtn = document.querySelector('.decrypt');
    
    encryptBtn.disabled = !(hasFiles && hasKey);
    decryptBtn.disabled = !(hasFiles && hasKey);
}

function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.className = `status ${type} active`;
    status.textContent = message;
    setTimeout(() => status.classList.remove('active'), 3000);
}

// Остальные функции (generateKey, encrypt, decrypt) остаются как в предыдущей версии
// Добавляем обработку ошибок:

async function encrypt() {
    try {
        if (!uploadedFiles.length || !cryptoKey) return;
        
        for (const [index, file] of uploadedFiles.entries()) {
            showStatus(`Шифрование ${index + 1} из ${uploadedFiles.length}...`, 'info');
            const encrypted = await processFile(file, 'encrypt');
            saveFile(encrypted, `${file.name}.enc`);
        }

        showStatus('Все файлы зашифрованы', 'success');
        clearAllFiles();
    } catch (error) {
        showStatus(`Ошибка: ${error.message}`, 'error');
    }
}

async function decrypt() {
    try {
        if (!uploadedFiles.length || !cryptoKey) return;
        
        for (const [index, file] of uploadedFiles.entries()) {
            showStatus(`Дешифрование ${index + 1} из ${uploadedFiles.length}...`, 'info');
            const decrypted = await processFile(file, 'decrypt');
            const newName = file.name.replace(/.enc$/, '');
            saveFile(decrypted, newName);
        }

        showStatus('Все файлы дешифрованы', 'success');
        clearAllFiles();
    } catch (error) {
        showStatus(`Ошибка: ${error.message}`, 'error');
    }
}

async function processFile(file, operation) {
    const data = await file.arrayBuffer();
    
    if (operation === 'encrypt') {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            data
        );
        return new Blob([iv, new Uint8Array(encrypted)]);
    }
    
    if (operation === 'decrypt') {
        const iv = new Uint8Array(data.slice(0, 12));
        const content = new Uint8Array(data.slice(12));
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            content
        );
        return new Blob([decrypted]);
    }
}


// Добавляем очистку при закрытии
window.addEventListener('beforeunload', (e) => {
    if (cryptoKey) {
        e.preventDefault();
        e.returnValue = '';
    }
});