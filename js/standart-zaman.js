/**
 * Norm Kadro - Standart Zaman Modülü
 * Standart zaman ve zaman etüdü yönetimi (Aykırı veri desteği)
 */

let editingStandartZamanId = null;
let gozlemler = [];

document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        await initDB();
        loadGorevDropdown();
        loadStandartZamanTable();
        setupEventListeners();
    } catch (error) {
        showNotification('Veritabanı başlatılamadı', 'error');
    } finally {
        hideLoading();
        lucide.createIcons();
    }
});

function setupEventListeners() {
    document.getElementById('standartZamanForm')?.addEventListener('submit', handleFormSubmit);

    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal('standartZamanModal'));
    });

    document.getElementById('standartZamanModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal('standartZamanModal');
    });
}

function loadGorevDropdown() {
    const gorevler = select('gorevler', null, 'gorev_adi');
    const selects = document.querySelectorAll('#gorevSelect, #etudGorevSelect');

    selects.forEach(selectEl => {
        if (!selectEl) return;

        selectEl.innerHTML = '<option value="">Görev seçin...</option>' +
            gorevler.map(g => `<option value="${g.id}">${g.gorev_adi}</option>`).join('');
    });
}

function loadStandartZamanTable() {
    const standartZamanlar = getStandartZamanDetayli();
    const tbody = document.getElementById('standartZamanTable');

    if (!tbody) return;

    if (standartZamanlar.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-empty">
                    <i data-lucide="inbox"></i>
                    <p>Henüz standart zaman eklenmemiş</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = standartZamanlar.map(sz => `
        <tr>
            <td>${sz.pozisyon_adi || '-'}</td>
            <td><strong>${sz.gorev_adi}</strong></td>
            <td class="text-right">${formatNumber(sz.standart_sure)}</td>
            <td>${sz.birim}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="editStandartZaman(${sz.id})" title="Düzenle">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" onclick="deleteStandartZaman(${sz.id})" title="Sil">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();
}

function openNewStandartZamanModal() {
    editingStandartZamanId = null;
    document.getElementById('modalTitle').textContent = 'Yeni Standart Zaman';
    document.getElementById('standartZamanForm').reset();
    openModal('standartZamanModal');
}

function editStandartZaman(id) {
    const sz = getById('standart_zaman', id);
    if (!sz) {
        showNotification('Kayıt bulunamadı', 'error');
        return;
    }

    editingStandartZamanId = id;
    document.getElementById('modalTitle').textContent = 'Standart Zaman Düzenle';
    document.getElementById('gorevSelect').value = sz.gorev_id;
    document.getElementById('standartSure').value = sz.standart_sure;
    document.getElementById('zamanBirim').value = sz.birim;

    openModal('standartZamanModal');
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = {
        gorev_id: parseInt(document.getElementById('gorevSelect').value),
        standart_sure: parseFloat(document.getElementById('standartSure').value),
        birim: document.getElementById('zamanBirim').value
    };

    const validation = validateForm(formData, {
        gorev_id: { required: true, label: 'Görev' },
        standart_sure: { required: true, min: 0, label: 'Standart süre' }
    });

    if (!validation.isValid) {
        showNotification(Object.values(validation.errors)[0], 'error');
        return;
    }

    try {
        if (editingStandartZamanId) {
            update('standart_zaman', editingStandartZamanId, formData);
            showNotification('Standart zaman güncellendi', 'success');
        } else {
            insert('standart_zaman', formData);
            showNotification('Standart zaman eklendi', 'success');
        }

        closeModal('standartZamanModal');
        loadStandartZamanTable();
    } catch (error) {
        showNotification('Hata: ' + error.message, 'error');
    }
}

async function deleteStandartZaman(id) {
    const confirmed = await showConfirmDialog('Standart Zamanı Sil', 'Bu kaydı silmek istediğinizden emin misiniz?');

    if (confirmed) {
        try {
            deleteRecord('standart_zaman', id);
            showNotification('Standart zaman silindi', 'success');
            loadStandartZamanTable();
        } catch (error) {
            showNotification('Silme hatası: ' + error.message, 'error');
        }
    }
}

// ===== EXCEL EXPORT =====

function exportStandartZaman() {
    const standartZamanlar = getStandartZamanDetayli();

    if (standartZamanlar.length === 0) {
        showNotification('Dışa aktarılacak veri yok', 'warning');
        return;
    }

    const exportData = standartZamanlar.map(sz => ({
        'Pozisyon': sz.pozisyon_adi || '',
        'Görev': sz.gorev_adi,
        'Standart Süre': sz.standart_sure,
        'Birim': sz.birim
    }));

    exportToExcel(exportData, 'standart_zaman');
}

// ===== ZAMAN ETÜDÜ =====

function addGozlem() {
    const input = document.getElementById('gozlemInput');
    const value = parseFloat(input.value);

    if (isNaN(value) || value <= 0) {
        showNotification('Geçerli bir süre girin', 'warning');
        return;
    }

    gozlemler.push(value);
    input.value = '';
    updateGozlemList();
    hesaplaEtudSonuclari();
}

function removeGozlem(index) {
    gozlemler.splice(index, 1);
    updateGozlemList();
    hesaplaEtudSonuclari();
}

function updateGozlemList() {
    const container = document.getElementById('gozlemlerList');
    if (!container) return;

    if (gozlemler.length === 0) {
        container.innerHTML = '<p class="text-muted">Henüz gözlem eklenmedi</p>';
        return;
    }

    // Aykırı verileri kontrol et
    const excludeOutliers = document.getElementById('aykiriVeriToggle')?.checked;
    const outliers = excludeOutliers ? detectOutliers(gozlemler) : [];

    container.innerHTML = gozlemler.map((g, i) => {
        const isOutlier = outliers.includes(i);
        const badgeClass = isOutlier ? 'badge-warning' : 'badge-primary';
        const title = isOutlier ? 'Aykırı veri - Kaldır' : 'Kaldır';

        return `
        <span class="badge ${badgeClass}" style="cursor:pointer${isOutlier ? ';opacity:0.6' : ''}" onclick="removeGozlem(${i})" title="${title}">
            ${formatNumber(g)} dk ${isOutlier ? '⚠️' : ''}<i data-lucide="x" style="width:12px;height:12px;margin-left:4px"></i>
        </span>
    `;
    }).join('');

    lucide.createIcons();
}

// IQR yöntemi ile aykırı veri tespiti
function detectOutliers(data) {
    if (data.length < 4) return [];

    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;

    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const outlierIndices = [];
    data.forEach((val, idx) => {
        if (val < lowerBound || val > upperBound) {
            outlierIndices.push(idx);
        }
    });

    return outlierIndices;
}

function hesaplaEtudSonuclari() {
    const excludeOutliers = document.getElementById('aykiriVeriToggle')?.checked;

    let dataToUse = [...gozlemler];

    if (excludeOutliers && gozlemler.length >= 4) {
        const outlierIndices = detectOutliers(gozlemler);
        dataToUse = gozlemler.filter((_, i) => !outlierIndices.includes(i));
    }

    const sonuc = calculateTimeStudy(dataToUse);

    document.getElementById('etudOrtalama').textContent = formatNumber(sonuc.ortalama) + ' dk';
    document.getElementById('etudStdSapma').textContent = formatNumber(sonuc.stdSapma) + ' dk';
    document.getElementById('etudMin').textContent = formatNumber(sonuc.min) + ' dk';
    document.getElementById('etudMax').textContent = formatNumber(sonuc.max) + ' dk';
    document.getElementById('etudSayi').textContent = dataToUse.length;

    // Gözlem listesini de güncelle (aykırı verileri işaretlemek için)
    updateGozlemList();
}

function temizleEtud() {
    gozlemler = [];
    updateGozlemList();
    hesaplaEtudSonuclari();
}

function kullanOrtalama() {
    const excludeOutliers = document.getElementById('aykiriVeriToggle')?.checked;

    let dataToUse = [...gozlemler];
    if (excludeOutliers && gozlemler.length >= 4) {
        const outlierIndices = detectOutliers(gozlemler);
        dataToUse = gozlemler.filter((_, i) => !outlierIndices.includes(i));
    }

    const sonuc = calculateTimeStudy(dataToUse);

    if (sonuc.ortalama <= 0) {
        showNotification('Önce gözlem ekleyin', 'warning');
        return;
    }

    const gorevId = document.getElementById('etudGorevSelect').value;
    if (!gorevId) {
        showNotification('Görev seçin', 'warning');
        return;
    }

    try {
        insert('standart_zaman', {
            gorev_id: parseInt(gorevId),
            standart_sure: sonuc.ortalama,
            birim: 'dakika'
        });

        showNotification('Standart zaman kaydedildi', 'success');
        loadStandartZamanTable();
        temizleEtud();
        document.getElementById('etudGorevSelect').value = '';
    } catch (error) {
        showNotification('Kayıt hatası: ' + error.message, 'error');
    }
}
