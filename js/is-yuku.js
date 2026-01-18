/**
 * Norm Kadro - İş Yükü Modülü
 * İş yükü verilerinin yönetimi
 */

let editingIsYukuId = null;

document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        await initDB();
        loadGorevDropdown();
        loadIsYukuTable();
        setupEventListeners();
    } catch (error) {
        showNotification('Veritabanı başlatılamadı', 'error');
    } finally {
        hideLoading();
        lucide.createIcons();
    }
});

function setupEventListeners() {
    document.getElementById('isYukuForm')?.addEventListener('submit', handleFormSubmit);

    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal('isYukuModal'));
    });

    document.getElementById('isYukuModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal('isYukuModal');
    });
}

// Görev dropdown doldur (sadece görev adları, pozisyon gruplaması yok)
function loadGorevDropdown() {
    const gorevler = select('gorevler', null, 'gorev_adi');
    const selectEl = document.getElementById('gorevSelect');

    if (!selectEl) return;

    selectEl.innerHTML = '<option value="">Görev seçin...</option>' +
        gorevler.map(g => `<option value="${g.id}">${g.gorev_adi}</option>`).join('');
}

// İş yükü tablosu
function loadIsYukuTable() {
    const isYukleri = getIsYukuDetayli();
    const tbody = document.getElementById('isYukuTable');

    if (!tbody) return;

    if (isYukleri.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">
                    <i data-lucide="inbox"></i>
                    <p>Henüz iş yükü eklenmemiş</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = isYukleri.map(iy => `
        <tr>
            <td>${iy.pozisyon_adi || '-'}</td>
            <td><strong>${iy.gorev_adi}</strong></td>
            <td class="text-right">${formatNumber(iy.hacim, 0)}</td>
            <td>${iy.birim}</td>
            <td><span class="badge badge-primary">${iy.periyot}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="editIsYuku(${iy.id})" title="Düzenle">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" onclick="deleteIsYuku(${iy.id})" title="Sil">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();
}

function openNewIsYukuModal() {
    editingIsYukuId = null;
    document.getElementById('modalTitle').textContent = 'Yeni İş Yükü';
    document.getElementById('isYukuForm').reset();
    openModal('isYukuModal');
}

function editIsYuku(id) {
    const isYuku = getById('is_yuku', id);
    if (!isYuku) {
        showNotification('Kayıt bulunamadı', 'error');
        return;
    }

    editingIsYukuId = id;
    document.getElementById('modalTitle').textContent = 'İş Yükü Düzenle';
    document.getElementById('gorevSelect').value = isYuku.gorev_id;
    document.getElementById('hacim').value = isYuku.hacim;
    document.getElementById('birim').value = isYuku.birim;
    document.getElementById('periyot').value = isYuku.periyot;

    openModal('isYukuModal');
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = {
        gorev_id: parseInt(document.getElementById('gorevSelect').value),
        hacim: parseFloat(document.getElementById('hacim').value),
        birim: document.getElementById('birim').value,
        periyot: document.getElementById('periyot').value
    };

    const validation = validateForm(formData, {
        gorev_id: { required: true, label: 'Görev' },
        hacim: { required: true, min: 0, label: 'Hacim' }
    });

    if (!validation.isValid) {
        showNotification(Object.values(validation.errors)[0], 'error');
        return;
    }

    try {
        if (editingIsYukuId) {
            update('is_yuku', editingIsYukuId, formData);
            showNotification('İş yükü güncellendi', 'success');
        } else {
            insert('is_yuku', formData);
            showNotification('İş yükü eklendi', 'success');
        }

        closeModal('isYukuModal');
        loadIsYukuTable();
    } catch (error) {
        showNotification('Hata: ' + error.message, 'error');
    }
}

async function deleteIsYuku(id) {
    const confirmed = await showConfirmDialog('İş Yükünü Sil', 'Bu kaydı silmek istediğinizden emin misiniz?');

    if (confirmed) {
        try {
            deleteRecord('is_yuku', id);
            showNotification('İş yükü silindi', 'success');
            loadIsYukuTable();
        } catch (error) {
            showNotification('Silme hatası: ' + error.message, 'error');
        }
    }
}

// ===== EXCEL EXPORT =====

function exportIsYuku() {
    const isYukleri = getIsYukuDetayli();

    if (isYukleri.length === 0) {
        showNotification('Dışa aktarılacak veri yok', 'warning');
        return;
    }

    const exportData = isYukleri.map(iy => ({
        'Pozisyon': iy.pozisyon_adi || '',
        'Görev': iy.gorev_adi,
        'Hacim': iy.hacim,
        'Birim': iy.birim,
        'Periyot': iy.periyot
    }));

    exportToExcel(exportData, 'is_yuku');
}

// ===== MEVSİMSEL İŞ YÜKÜ FONKSİYONLARI =====

function toggleMevsimselPanel() {
    const checkbox = document.getElementById('mevsimselAktif');
    const panel = document.getElementById('mevsimselPanel');

    if (checkbox && panel) {
        panel.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) {
            updateMevsimselPreview();
        }
    }
    lucide.createIcons();
}

function applyMevsimselSablon() {
    const sablonKey = document.getElementById('mevsimselSablon').value;

    if (!sablonKey || !APP_CONFIG.mevsimselSablonlar[sablonKey]) {
        return;
    }

    const sablon = APP_CONFIG.mevsimselSablonlar[sablonKey];

    // 12 aylık inputlara değerleri yaz
    for (let i = 1; i <= 12; i++) {
        const input = document.getElementById(`ay${i}`);
        if (input) {
            input.value = sablon.carpanlar[i - 1];
        }
    }

    updateMevsimselPreview();
}

function getMevsimselInputValues() {
    const values = [];
    for (let i = 1; i <= 12; i++) {
        const input = document.getElementById(`ay${i}`);
        values.push(input ? parseFloat(input.value) || 1.0 : 1.0);
    }
    return values;
}

function setMevsimselInputValues(carpanlar) {
    for (let i = 1; i <= 12; i++) {
        const input = document.getElementById(`ay${i}`);
        if (input && carpanlar[i - 1] !== undefined) {
            input.value = carpanlar[i - 1];
        }
    }
}

function updateMevsimselPreview() {
    const carpanlar = getMevsimselInputValues();
    const hacim = parseFloat(document.getElementById('hacim').value) || 0;

    const min = Math.min(...carpanlar);
    const max = Math.max(...carpanlar);
    const avg = carpanlar.reduce((a, b) => a + b, 0) / 12;

    const previewEl = document.getElementById('mevsimselPreview');
    if (previewEl) {
        previewEl.style.display = 'block';
        previewEl.innerHTML = `
            <div style="display: flex; gap: 1rem; justify-content: space-between; padding: 0.75rem; background: var(--bg-secondary); border-radius: 0.5rem; font-size: 0.85rem;">
                <div style="text-align: center;">
                    <div style="color: var(--text-secondary); font-size: 0.75rem;">Min</div>
                    <div style="font-weight: 600; color: #22c55e;">${formatNumber(hacim * min, 0)} (×${min.toFixed(2)})</div>
                </div>
                <div style="text-align: center;">
                    <div style="color: var(--text-secondary); font-size: 0.75rem;">Ortalama</div>
                    <div style="font-weight: 600; color: var(--primary);">${formatNumber(hacim * avg, 0)} (×${avg.toFixed(2)})</div>
                </div>
                <div style="text-align: center;">
                    <div style="color: var(--text-secondary); font-size: 0.75rem;">Max</div>
                    <div style="font-weight: 600; color: #ef4444;">${formatNumber(hacim * max, 0)} (×${max.toFixed(2)})</div>
                </div>
            </div>
        `;
    }
}

// Form gönderimi güncelleme - mevsimsel dahil
const originalHandleFormSubmit = handleFormSubmit;
handleFormSubmit = async function (e) {
    e.preventDefault();

    const formData = {
        gorev_id: parseInt(document.getElementById('gorevSelect').value),
        hacim: parseFloat(document.getElementById('hacim').value),
        birim: document.getElementById('birim').value,
        periyot: document.getElementById('periyot').value
    };

    const validation = validateForm(formData, {
        gorev_id: { required: true, label: 'Görev' },
        hacim: { required: true, min: 0, label: 'Hacim' }
    });

    if (!validation.isValid) {
        showNotification(Object.values(validation.errors)[0], 'error');
        return;
    }

    try {
        let gorevId;

        if (editingIsYukuId) {
            update('is_yuku', editingIsYukuId, formData);
            gorevId = formData.gorev_id;
            showNotification('İş yükü güncellendi', 'success');
        } else {
            const result = insert('is_yuku', formData);
            gorevId = formData.gorev_id;
            showNotification('İş yükü eklendi', 'success');
        }

        // Mevsimsel çarpanları kaydet
        const mevsimselAktif = document.getElementById('mevsimselAktif')?.checked;
        if (mevsimselAktif && gorevId) {
            const carpanlar = getMevsimselInputValues();
            saveMevsimselCarpanlar(gorevId, carpanlar);
        } else if (gorevId) {
            // Mevsimsel kapalıysa mevcut kayıtları sil
            deleteMevsimselCarpanlar(gorevId);
        }

        closeModal('isYukuModal');
        loadIsYukuTable();
    } catch (error) {
        showNotification('Hata: ' + error.message, 'error');
    }
};

// Edit işleminde mevsimsel verileri yükle
const originalEditIsYuku = editIsYuku;
editIsYuku = function (id) {
    const isYuku = getById('is_yuku', id);
    if (!isYuku) {
        showNotification('Kayıt bulunamadı', 'error');
        return;
    }

    editingIsYukuId = id;
    document.getElementById('modalTitle').textContent = 'İş Yükü Düzenle';
    document.getElementById('gorevSelect').value = isYuku.gorev_id;
    document.getElementById('hacim').value = isYuku.hacim;
    document.getElementById('birim').value = isYuku.birim;
    document.getElementById('periyot').value = isYuku.periyot;

    // Mevsimsel çarpanları yükle
    const hasMevsimsel = hasMevsimselCarpan(isYuku.gorev_id);
    const mevsimselCheckbox = document.getElementById('mevsimselAktif');

    if (mevsimselCheckbox) {
        mevsimselCheckbox.checked = hasMevsimsel;
        toggleMevsimselPanel();

        if (hasMevsimsel) {
            const carpanlar = getMevsimselCarpanlar(isYuku.gorev_id);
            setMevsimselInputValues(carpanlar);
            updateMevsimselPreview();
        }
    }

    openModal('isYukuModal');
    lucide.createIcons();
};

// Yeni modal açıldığında mevsimsel paneli resetle
const originalOpenNewIsYukuModal = openNewIsYukuModal;
openNewIsYukuModal = function () {
    editingIsYukuId = null;
    document.getElementById('modalTitle').textContent = 'Yeni İş Yükü';
    document.getElementById('isYukuForm').reset();

    // Mevsimsel paneli resetle
    const mevsimselCheckbox = document.getElementById('mevsimselAktif');
    if (mevsimselCheckbox) {
        mevsimselCheckbox.checked = false;
        toggleMevsimselPanel();
    }

    // Şablon seçimini resetle
    const sablonSelect = document.getElementById('mevsimselSablon');
    if (sablonSelect) {
        sablonSelect.value = '';
    }

    // Tüm ay inputlarını 1.0'a resetle
    for (let i = 1; i <= 12; i++) {
        const input = document.getElementById(`ay${i}`);
        if (input) input.value = '1.0';
    }

    openModal('isYukuModal');
    lucide.createIcons();
};
