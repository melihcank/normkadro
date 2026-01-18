/**
 * Norm Kadro - Personel Modülü
 * Personel yönetimi (ad, soyad, personel no, pozisyon)
 */

let editingPersonelId = null;

document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        await initDB();
        loadPozisyonDropdown();
        loadPersonelTable();
        setupEventListeners();
    } catch (error) {
        showNotification('Veritabanı başlatılamadı', 'error');
    } finally {
        hideLoading();
        lucide.createIcons();
    }
});

function setupEventListeners() {
    document.getElementById('personelForm')?.addEventListener('submit', handleFormSubmit);
    document.getElementById('pozisyonForm')?.addEventListener('submit', handlePozisyonSubmit);

    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal('personelModal'));
    });

    document.getElementById('personelModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal('personelModal');
    });

    document.getElementById('pozisyonModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal('pozisyonModal');
    });

    // Filtre
    document.getElementById('filterPozisyon')?.addEventListener('change', loadPersonelTable);
    document.getElementById('filterDurum')?.addEventListener('change', loadPersonelTable);
}

function loadPozisyonDropdown() {
    const pozisyonlar = select('pozisyonlar', null, 'pozisyon_adi');
    const selects = document.querySelectorAll('#pozisyonSelect, #filterPozisyon, #newUstPozisyon');

    selects.forEach(sel => {
        if (!sel) return;
        const isFilter = sel.id === 'filterPozisyon';
        const isUst = sel.id === 'newUstPozisyon';

        if (isFilter) {
            sel.innerHTML = '<option value="">Tüm Pozisyonlar</option>';
        } else if (isUst) {
            sel.innerHTML = '<option value="">Üst pozisyon yok</option>';
        } else {
            sel.innerHTML = '<option value="">Pozisyon seçin...</option>';
        }

        pozisyonlar.forEach(p => {
            sel.innerHTML += `<option value="${p.id}">${p.pozisyon_adi}</option>`;
        });
    });
}

function loadDepartmanDatalist() {
    const departmanlar = getDistinctDepartments();
    const datalist = document.getElementById('departmanList');

    if (!datalist) return;

    datalist.innerHTML = departmanlar.map(d => `<option value="${d}">`).join('');
}

function loadPersonelTable() {
    const filterPozisyon = document.getElementById('filterPozisyon')?.value;
    const filterDurum = document.getElementById('filterDurum')?.value;

    let personeller = getPersonellerWithPozisyon();

    if (filterPozisyon) {
        personeller = personeller.filter(p => p.pozisyon_id == filterPozisyon);
    }
    if (filterDurum) {
        personeller = personeller.filter(p => p.durum === filterDurum);
    }

    const tbody = document.getElementById('personelTable');
    if (!tbody) return;

    const countEl = document.getElementById('personelCount');
    if (countEl) countEl.textContent = personeller.length;

    if (personeller.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    <i data-lucide="users"></i>
                    <p>Henüz personel eklenmemiş</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = personeller.map(p => `
        <tr>
            <td><span class="badge badge-primary">${p.personel_no}</span></td>
            <td><strong>${p.ad} ${p.soyad}</strong></td>
            <td>${p.pozisyon_adi || '-'}</td>
            <td>${p.departman || '-'}</td>
            <td>${p.email || '-'}</td>
            <td>
                <span class="badge ${p.durum === 'aktif' ? 'badge-success' : 'badge-warning'}">
                    ${p.durum}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="editPersonel(${p.id})" title="Düzenle">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" onclick="deletePersonel(${p.id})" title="Sil">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();
}

function openNewPersonelModal() {
    editingPersonelId = null;
    loadPozisyonDropdown();
    document.getElementById('modalTitle').textContent = 'Yeni Personel';
    document.getElementById('personelForm').reset();
    openModal('personelModal');
}

function editPersonel(id) {
    const personel = getById('personeller', id);
    if (!personel) {
        showNotification('Personel bulunamadı', 'error');
        return;
    }

    editingPersonelId = id;
    loadPozisyonDropdown();
    document.getElementById('modalTitle').textContent = 'Personel Düzenle';
    document.getElementById('personelNo').value = personel.personel_no;
    document.getElementById('ad').value = personel.ad;
    document.getElementById('soyad').value = personel.soyad;
    document.getElementById('pozisyonSelect').value = personel.pozisyon_id || '';
    document.getElementById('email').value = personel.email || '';
    document.getElementById('telefon').value = personel.telefon || '';
    document.getElementById('durum').value = personel.durum;

    openModal('personelModal');
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = {
        personel_no: document.getElementById('personelNo').value.trim(),
        ad: document.getElementById('ad').value.trim(),
        soyad: document.getElementById('soyad').value.trim(),
        pozisyon_id: document.getElementById('pozisyonSelect').value || null,
        email: document.getElementById('email').value.trim() || null,
        telefon: document.getElementById('telefon').value.trim() || null,
        durum: document.getElementById('durum').value
    };

    const validation = validateForm(formData, {
        personel_no: { required: true, label: 'Personel No' },
        ad: { required: true, label: 'Ad' },
        soyad: { required: true, label: 'Soyad' }
    });

    if (!validation.isValid) {
        showNotification(Object.values(validation.errors)[0], 'error');
        return;
    }

    try {
        if (editingPersonelId) {
            update('personeller', editingPersonelId, formData);
            showNotification('Personel güncellendi', 'success');
        } else {
            insert('personeller', formData);
            showNotification('Personel eklendi', 'success');
        }

        closeModal('personelModal');
        loadPersonelTable();
    } catch (error) {
        if (error.message.includes('UNIQUE')) {
            showNotification('Bu personel numarası zaten kullanılıyor', 'error');
        } else {
            showNotification('Hata: ' + error.message, 'error');
        }
    }
}

// ===== POZİSYON QUICK ADD =====

function openNewPozisyonModal() {
    loadPozisyonDropdown();
    loadDepartmanDatalist();
    document.getElementById('pozisyonForm').reset();
    openModal('pozisyonModal');
    lucide.createIcons();
}

async function handlePozisyonSubmit(e) {
    e.preventDefault();

    const formData = {
        pozisyon_adi: document.getElementById('newPozisyonAdi').value.trim(),
        ust_pozisyon_id: document.getElementById('newUstPozisyon').value || null,
        departman: document.getElementById('newDepartman').value.trim()
    };

    if (!formData.pozisyon_adi) {
        showNotification('Pozisyon adı gerekli', 'error');
        return;
    }

    try {
        const result = insert('pozisyonlar', formData);
        showNotification('Pozisyon eklendi', 'success');
        closeModal('pozisyonModal');

        // Dropdown'ları güncelle ve yeni pozisyonu seç
        loadPozisyonDropdown();
        document.getElementById('pozisyonSelect').value = result.lastId;

    } catch (error) {
        showNotification('Hata: ' + error.message, 'error');
    }
}

async function deletePersonel(id) {
    const confirmed = await showConfirmDialog('Personeli Sil', 'Bu personeli silmek istediğinizden emin misiniz?');

    if (confirmed) {
        try {
            deleteRecord('personeller', id);
            showNotification('Personel silindi', 'success');
            loadPersonelTable();
        } catch (error) {
            showNotification('Silme hatası: ' + error.message, 'error');
        }
    }
}

function exportPersonel() {
    const personeller = getPersonellerWithPozisyon();
    const exportData = personeller.map(p => ({
        'Personel No': p.personel_no,
        'Ad': p.ad,
        'Soyad': p.soyad,
        'Pozisyon': p.pozisyon_adi || '',
        'Departman': p.departman || '',
        'E-posta': p.email || '',
        'Telefon': p.telefon || '',
        'Durum': p.durum
    }));

    exportToExcel(exportData, 'personel_listesi');
}
