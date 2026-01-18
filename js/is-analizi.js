/**
 * Norm Kadro - İş Analizi Modülü
 * Pozisyon ve görev yönetimi (hiyerarşik yapı)
 */

let editingPozisyonId = null;

document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        await initDB();
        loadUstPozisyonDropdown();
        loadDepartmanDatalist();
        loadPozisyonlar();
        setupEventListeners();
    } catch (error) {
        showNotification('Veritabanı başlatılamadı: ' + error.message, 'error');
    } finally {
        hideLoading();
        lucide.createIcons();
    }
});

function setupEventListeners() {
    document.getElementById('pozisyonForm')?.addEventListener('submit', handleFormSubmit);

    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal('pozisyonModal'));
    });

    document.getElementById('pozisyonModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal('pozisyonModal');
    });
}

// Üst pozisyon dropdown'unu doldur
function loadUstPozisyonDropdown(excludeId = null) {
    const pozisyonlar = getPozisyonlarForDropdown();
    const sel = document.getElementById('ustPozisyon');

    if (!sel) return;

    sel.innerHTML = '<option value="">Üst pozisyon yok (en üst seviye)</option>';
    pozisyonlar.forEach(p => {
        if (p.id !== excludeId) {
            sel.innerHTML += `<option value="${p.id}">${p.pozisyon_adi}</option>`;
        }
    });
}

// Departman datalist'ini doldur
function loadDepartmanDatalist() {
    const departmanlar = getDistinctDepartments();
    const datalist = document.getElementById('departmanList');

    if (!datalist) return;

    datalist.innerHTML = departmanlar.map(d => `<option value="${d}">`).join('');
}

function loadPozisyonlar() {
    const pozisyonlar = getPozisyonlarWithGorevler();
    const tbody = document.getElementById('pozisyonlarTable');

    if (!tbody) return;

    if (pozisyonlar.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    <i data-lucide="inbox"></i>
                    <p>Henüz pozisyon eklenmemiş</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = pozisyonlar.map(p => {
        // Personel sayısını hesapla
        const personelSayisi = getPersonelCountByPozisyon(p.id);
        return `
        <tr>
            <td><strong>${p.pozisyon_adi}</strong></td>
            <td>${p.ust_pozisyon_adi || '<span class="text-muted">-</span>'}</td>
            <td>${p.departman || '-'}</td>
            <td class="text-center">${personelSayisi}</td>
            <td class="text-center">
                <span class="badge badge-primary">${p.gorev_sayisi}</span>
            </td>
            <td>${p.aciklama || '-'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="editPozisyon(${p.id})" title="Düzenle">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" onclick="deletePozisyon(${p.id})" title="Sil">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');

    lucide.createIcons();
}



function openNewPozisyonModal() {
    editingPozisyonId = null;
    loadUstPozisyonDropdown();
    loadDepartmanDatalist();
    document.getElementById('modalTitle').textContent = 'Yeni Pozisyon';
    document.getElementById('pozisyonForm').reset();
    openModal('pozisyonModal');
}

function editPozisyon(id) {
    const pozisyon = getById('pozisyonlar', id);
    if (!pozisyon) {
        showNotification('Pozisyon bulunamadı', 'error');
        return;
    }

    editingPozisyonId = id;
    loadUstPozisyonDropdown(id);
    loadDepartmanDatalist();

    document.getElementById('modalTitle').textContent = 'Pozisyon Düzenle';
    document.getElementById('pozisyonAdi').value = pozisyon.pozisyon_adi;
    document.getElementById('ustPozisyon').value = pozisyon.ust_pozisyon_id || '';
    document.getElementById('departman').value = pozisyon.departman || '';
    document.getElementById('aciklama').value = pozisyon.aciklama || '';

    openModal('pozisyonModal');
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const ustPozisyonVal = document.getElementById('ustPozisyon').value;

    const formData = {
        pozisyon_adi: document.getElementById('pozisyonAdi').value.trim(),
        ust_pozisyon_id: ustPozisyonVal ? parseInt(ustPozisyonVal) : null,
        departman: document.getElementById('departman').value.trim(),
        aciklama: document.getElementById('aciklama').value.trim()
    };

    const validation = validateForm(formData, {
        pozisyon_adi: { required: true, label: 'Pozisyon adı' }
    });

    if (!validation.isValid) {
        showNotification(Object.values(validation.errors)[0], 'error');
        return;
    }

    try {
        let pozisyonId;

        if (editingPozisyonId) {
            update('pozisyonlar', editingPozisyonId, formData);
            pozisyonId = editingPozisyonId;
            showNotification('Pozisyon güncellendi', 'success');
        } else {
            const result = insert('pozisyonlar', formData);
            pozisyonId = result.lastId;
            showNotification('Pozisyon eklendi', 'success');
        }

        closeModal('pozisyonModal');
        loadPozisyonlar();
    } catch (error) {
        showNotification('Hata: ' + error.message, 'error');
    }
}



async function deletePozisyon(id) {
    const confirmed = await showConfirmDialog(
        'Pozisyonu Sil',
        'Bu pozisyon ve tüm ilişkili veriler silinecek. Emin misiniz?'
    );

    if (confirmed) {
        try {
            executeCommand('UPDATE pozisyonlar SET ust_pozisyon_id = NULL WHERE ust_pozisyon_id = ?', [id]);
            executeCommand('UPDATE personeller SET pozisyon_id = NULL WHERE pozisyon_id = ?', [id]);
            executeCommand('DELETE FROM is_yuku WHERE gorev_id IN (SELECT id FROM gorevler WHERE pozisyon_id = ?)', [id]);
            executeCommand('DELETE FROM standart_zaman WHERE gorev_id IN (SELECT id FROM gorevler WHERE pozisyon_id = ?)', [id]);
            executeCommand('DELETE FROM gorevler WHERE pozisyon_id = ?', [id]);
            deleteRecord('pozisyonlar', id);

            showNotification('Pozisyon silindi', 'success');
            loadPozisyonlar();
        } catch (error) {
            showNotification('Silme hatası: ' + error.message, 'error');
        }
    }
}

function exportPozisyonlar() {
    const pozisyonlar = getPozisyonlarWithGorevler();
    const exportData = pozisyonlar.map(p => ({
        'Pozisyon Adı': p.pozisyon_adi,
        'Üst Pozisyon': p.ust_pozisyon_adi || '',
        'Departman': p.departman || '',
        'Personel Sayısı': getPersonelCountByPozisyon(p.id),
        'Görev Sayısı': p.gorev_sayisi,
        'Açıklama': p.aciklama || ''
    }));

    exportToExcel(exportData, 'pozisyonlar');
}
