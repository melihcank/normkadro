/**
 * Norm Kadro - Görevler Modülü
 * Görev yönetimi ve görev matrisi
 */

let editingGorevId = null;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function () {
    initGorevlerPage();
});

async function initGorevlerPage() {
    showLoading();
    try {
        await initDB();

        // Eski verileri migration et (gorevler tablosundaki pozisyon_id'leri gorev_pozisyon tablosuna aktar)
        migrateOldTaskPositions();

        loadGorevTable();
        loadPozisyonCheckboxes();
        loadMatrixPozisyonFilter();
        setupEventListeners();
    } catch (error) {
        console.error('Görevler sayfa hatası:', error);
        showNotification('Sayfa yüklenirken hata oluştu: ' + error.message, 'error');
    }
    // Her durumda loading'i kapat
    hideLoading();
    lucide.createIcons();
}

// Eski görev-pozisyon ilişkilerini yeni tabloya aktar
function migrateOldTaskPositions() {
    try {
        // Eski sistemdeki görevleri kontrol et
        const gorevlerWithOldPozisyon = executeQuery(`
            SELECT id, pozisyon_id FROM gorevler 
            WHERE pozisyon_id IS NOT NULL
        `);

        gorevlerWithOldPozisyon.forEach(g => {
            // Yeni tabloda yoksa ekle
            const existing = executeQuery(`
                SELECT id FROM gorev_pozisyon 
                WHERE gorev_id = ? AND pozisyon_id = ?
            `, [g.id, g.pozisyon_id]);

            if (existing.length === 0) {
                try {
                    db.run(`
                        INSERT INTO gorev_pozisyon (gorev_id, pozisyon_id) 
                        VALUES (?, ?)
                    `, [g.id, g.pozisyon_id]);
                } catch (e) {
                    console.log('Migration insert hatası:', e);
                }
            }
        });

        saveDB();
    } catch (error) {
        console.error('Migration hatası:', error);
    }
}

function setupEventListeners() {
    const form = document.getElementById('gorevForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal('gorevModal'));
    });

    const modal = document.getElementById('gorevModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) closeModal('gorevModal');
        });
    }
}

function switchTab(tabName) {
    // Tab butonlarını güncelle
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) tab.classList.add('active');
    });

    // Tab içeriklerini güncelle
    document.getElementById('gorevListesiTab').classList.toggle('hidden', tabName !== 'gorevListesi');
    document.getElementById('gorevMatrisiTab').classList.toggle('hidden', tabName !== 'gorevMatrisi');

    if (tabName === 'gorevMatrisi') {
        loadGorevMatrix();
    }

    lucide.createIcons();
}

// ===== GÖREV LİSTESİ =====

function loadGorevTable() {
    const gorevler = getGorevlerWithPozisyonlar();
    const tbody = document.getElementById('gorevTable');

    if (!tbody) return;

    if (gorevler.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-empty">
                    <i data-lucide="inbox"></i>
                    <p>Henüz görev eklenmemiş</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = gorevler.map(g => {
        const oncelik = g.oncelik || 3;
        const oncelikInfo = getOncelikInfo(oncelik);
        return `
        <tr>
            <td><strong>${g.gorev_adi}</strong></td>
            <td>
                <span class="priority-badge priority-${oncelik}">
                    ${getStars(oncelik)} ${oncelikInfo.isim}
                </span>
            </td>
            <td>
                <div class="pozisyon-badges">
                    ${g.pozisyonlar.length > 0
                ? g.pozisyonlar.map(p => `<span class="badge badge-primary">${p.pozisyon_adi}</span>`).join('')
                : '<span class="text-muted">Atanmamış</span>'
            }
                </div>
            </td>
            <td>${g.aciklama || '-'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="editGorev(${g.id})" title="Düzenle">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" onclick="deleteGorev(${g.id})" title="Sil">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');

    lucide.createIcons();
}

function getGorevlerWithPozisyonlar() {
    const gorevler = select('gorevler', null, 'gorev_adi');

    return gorevler.map(g => {
        // Önce gorev_pozisyon tablosundan bak
        let pozisyonlar = executeQuery(`
            SELECT p.id, p.pozisyon_adi 
            FROM gorev_pozisyon gp
            JOIN pozisyonlar p ON gp.pozisyon_id = p.id
            WHERE gp.gorev_id = ?
            ORDER BY p.pozisyon_adi
        `, [g.id]);

        // Eğer gorev_pozisyon'da yoksa ve eski pozisyon_id varsa onu kullan
        if (pozisyonlar.length === 0 && g.pozisyon_id) {
            pozisyonlar = executeQuery(`
                SELECT id, pozisyon_adi 
                FROM pozisyonlar 
                WHERE id = ?
            `, [g.pozisyon_id]);
        }

        return { ...g, pozisyonlar };
    });
}

function loadPozisyonCheckboxes() {
    const pozisyonlar = select('pozisyonlar', null, 'pozisyon_adi');
    const container = document.getElementById('pozisyonCheckboxes');

    if (!container) return;

    if (pozisyonlar.length === 0) {
        container.innerHTML = '<p class="text-muted">Henüz pozisyon tanımlanmamış</p>';
        return;
    }

    container.innerHTML = pozisyonlar.map(p => `
        <label class="checkbox-item">
            <input type="checkbox" name="pozisyonlar" value="${p.id}">
            <span>${p.pozisyon_adi}</span>
            <small class="text-muted">${p.departman || ''}</small>
        </label>
    `).join('');
}

function openNewGorevModal() {
    editingGorevId = null;
    document.getElementById('modalTitle').textContent = 'Yeni Görev';
    document.getElementById('gorevForm').reset();
    loadPozisyonCheckboxes();
    selectPriority(3); // Varsayılan normal öncelik
    openModal('gorevModal');
}

function editGorev(id) {
    const gorev = getById('gorevler', id);
    if (!gorev) {
        showNotification('Görev bulunamadı', 'error');
        return;
    }

    editingGorevId = id;
    document.getElementById('modalTitle').textContent = 'Görev Düzenle';
    document.getElementById('gorevAdi').value = gorev.gorev_adi;
    document.getElementById('gorevAciklama').value = gorev.aciklama || '';

    loadPozisyonCheckboxes();

    // Atanan pozisyonları işaretle
    let atananPozisyonlar = executeQuery(
        'SELECT pozisyon_id FROM gorev_pozisyon WHERE gorev_id = ?',
        [id]
    ).map(gp => gp.pozisyon_id);

    // Eğer gorev_pozisyon'da yoksa eski pozisyon_id'yi kontrol et
    if (atananPozisyonlar.length === 0 && gorev.pozisyon_id) {
        atananPozisyonlar = [gorev.pozisyon_id];
    }

    document.querySelectorAll('input[name="pozisyonlar"]').forEach(cb => {
        cb.checked = atananPozisyonlar.includes(parseInt(cb.value));
    });

    // Öncelik seçimini yükle
    selectPriority(gorev.oncelik || 3);

    openModal('gorevModal');
}

function handleFormSubmit(e) {
    e.preventDefault();

    const gorevAdi = document.getElementById('gorevAdi').value.trim();
    const aciklama = document.getElementById('gorevAciklama').value.trim();

    const secilenPozisyonlar = Array.from(
        document.querySelectorAll('input[name="pozisyonlar"]:checked')
    ).map(cb => parseInt(cb.value));

    if (!gorevAdi) {
        showNotification('Görev adı zorunludur', 'error');
        return;
    }

    try {
        let gorevId;
        const secilenOncelik = parseInt(document.querySelector('input[name="oncelik"]:checked')?.value || 3);

        if (editingGorevId) {
            update('gorevler', editingGorevId, {
                gorev_adi: gorevAdi,
                aciklama: aciklama || null,
                pozisyon_id: secilenPozisyonlar[0] || null,
                oncelik: secilenOncelik
            });
            gorevId = editingGorevId;

            // Mevcut pozisyon atamaları temizle
            db.run('DELETE FROM gorev_pozisyon WHERE gorev_id = ?', [gorevId]);

            showNotification('Görev güncellendi', 'success');
        } else {
            const result = insert('gorevler', {
                gorev_adi: gorevAdi,
                aciklama: aciklama || null,
                pozisyon_id: secilenPozisyonlar[0] || null,
                oncelik: secilenOncelik
            });
            gorevId = result.lastId;
            showNotification('Görev eklendi', 'success');
        }

        // Pozisyon atamalarını kaydet
        secilenPozisyonlar.forEach(pozId => {
            try {
                db.run(
                    'INSERT OR IGNORE INTO gorev_pozisyon (gorev_id, pozisyon_id) VALUES (?, ?)',
                    [gorevId, pozId]
                );
            } catch (e) {
                console.log('Pozisyon atama hatası:', e);
            }
        });

        // Atanan pozisyonlardaki personellerin görev matrisinde otomatik tikli olmasını sağla
        autoCheckTaskMatrixForPositions(gorevId, secilenPozisyonlar);

        saveDB();
        closeModal('gorevModal');
        loadGorevTable();
    } catch (error) {
        showNotification('Hata: ' + error.message, 'error');
    }
}

/**
 * Atanan pozisyonlardaki tüm personeller için görev matrisinde otomatik tik atar
 */
function autoCheckTaskMatrixForPositions(gorevId, pozisyonIdler) {
    if (!pozisyonIdler || pozisyonIdler.length === 0) return;

    pozisyonIdler.forEach(pozId => {
        // Bu pozisyondaki tüm aktif personelleri al
        const personeller = executeQuery(`
            SELECT id FROM personeller 
            WHERE pozisyon_id = ? AND durum = 'aktif'
        `, [pozId]);

        // Her personel için görev matrisinde tik at
        personeller.forEach(p => {
            try {
                db.run(`
                    INSERT INTO gorev_personel (gorev_id, personel_id, yapiliyor)
                    VALUES (?, ?, 1)
                    ON CONFLICT(gorev_id, personel_id) DO UPDATE SET yapiliyor = 1
                `, [gorevId, p.id]);
            } catch (e) {
                console.log('Görev-personel otomatik atama hatası:', e);
            }
        });
    });
}

function deleteGorev(id) {
    if (confirm('Bu görevi silmek istediğinizden emin misiniz? İlgili iş yükü ve standart zaman verileri de silinecek.')) {
        try {
            // İlişkili verileri sil
            db.run('DELETE FROM gorev_pozisyon WHERE gorev_id = ?', [id]);
            db.run('DELETE FROM gorev_personel WHERE gorev_id = ?', [id]);
            deleteRecord('gorevler', id);
            showNotification('Görev silindi', 'success');
            saveDB();
            loadGorevTable();
        } catch (error) {
            showNotification('Silme hatası: ' + error.message, 'error');
        }
    }
}

// ===== GÖREV MATRİSİ =====

function loadMatrixPozisyonFilter() {
    const pozisyonlar = select('pozisyonlar', null, 'pozisyon_adi');
    const selectEl = document.getElementById('matrixPozisyonFilter');

    if (!selectEl) return;

    selectEl.innerHTML = '<option value="">Tüm Pozisyonlar</option>' +
        pozisyonlar.map(p => `<option value="${p.id}">${p.pozisyon_adi}</option>`).join('');
}

function loadGorevMatrix() {
    const filterPozisyonId = document.getElementById('matrixPozisyonFilter')?.value;

    // Personelleri getir
    let personeller;
    if (filterPozisyonId) {
        personeller = executeQuery(`
            SELECT p.id, p.ad, p.soyad, p.pozisyon_id, poz.pozisyon_adi
            FROM personeller p
            LEFT JOIN pozisyonlar poz ON p.pozisyon_id = poz.id
            WHERE p.pozisyon_id = ? AND p.durum = 'aktif'
            ORDER BY p.soyad, p.ad
        `, [parseInt(filterPozisyonId)]);
    } else {
        personeller = executeQuery(`
            SELECT p.id, p.ad, p.soyad, p.pozisyon_id, poz.pozisyon_adi
            FROM personeller p
            LEFT JOIN pozisyonlar poz ON p.pozisyon_id = poz.id
            WHERE p.durum = 'aktif'
            ORDER BY poz.pozisyon_adi, p.soyad, p.ad
        `);
    }

    // Görevleri getir
    let gorevler;
    if (filterPozisyonId) {
        gorevler = executeQuery(`
            SELECT DISTINCT g.id, g.gorev_adi
            FROM gorevler g
            LEFT JOIN gorev_pozisyon gp ON g.id = gp.gorev_id
            WHERE gp.pozisyon_id = ? OR g.pozisyon_id = ?
            ORDER BY g.gorev_adi
        `, [parseInt(filterPozisyonId), parseInt(filterPozisyonId)]);
    } else {
        gorevler = select('gorevler', null, 'gorev_adi');
    }

    // Mevcut durumları al (öncelik dahil)
    const durumlar = executeQuery('SELECT gorev_id, personel_id, yapiliyor, oncelik FROM gorev_personel');
    const durumMap = {};
    durumlar.forEach(d => {
        durumMap[`${d.gorev_id}_${d.personel_id}`] = {
            yapiliyor: d.yapiliyor,
            oncelik: d.oncelik || 0
        };
    });

    const headerEl = document.getElementById('matrixHeader');
    const bodyEl = document.getElementById('matrixBody');

    if (!headerEl || !bodyEl) return;

    if (personeller.length === 0 || gorevler.length === 0) {
        headerEl.innerHTML = '';
        bodyEl.innerHTML = `
            <tr>
                <td colspan="10" class="table-empty">
                    <i data-lucide="grid-3x3"></i>
                    <p>Gösterilecek veri yok</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    // Header
    headerEl.innerHTML = `
        <tr>
            <th>Personel</th>
            ${gorevler.map(g => `<th title="${g.gorev_adi}">${g.gorev_adi.substring(0, 12)}${g.gorev_adi.length > 12 ? '...' : ''}</th>`).join('')}
        </tr>
    `;

    // Body
    bodyEl.innerHTML = personeller.map(p => `
        <tr>
            <td>
                <strong>${p.ad} ${p.soyad}</strong>
                <div class="text-muted" style="font-size:0.75rem">${p.pozisyon_adi || '-'}</div>
            </td>
            ${gorevler.map(g => {
        const key = `${g.id}_${p.id}`;
        const durum = durumMap[key] || { yapiliyor: 0, oncelik: 0 };
        const oncelik = durum.oncelik || 0;
        return `
                    <td>
                        <select class="matrix-priority-select priority-select-${oncelik}" 
                                data-gorev-id="${g.id}" 
                                data-personel-id="${p.id}"
                                onchange="updateGorevPersonelOncelik(${g.id}, ${p.id}, this.value, this)">
                            <option value="0" ${oncelik === 0 ? 'selected' : ''}>—</option>
                            <option value="5" ${oncelik === 5 ? 'selected' : ''}>⭐⭐⭐⭐⭐</option>
                            <option value="4" ${oncelik === 4 ? 'selected' : ''}>⭐⭐⭐⭐</option>
                            <option value="3" ${oncelik === 3 ? 'selected' : ''}>⭐⭐⭐</option>
                            <option value="2" ${oncelik === 2 ? 'selected' : ''}>⭐⭐</option>
                            <option value="1" ${oncelik === 1 ? 'selected' : ''}>⭐</option>
                        </select>
                    </td>
                `;
    }).join('')}
        </tr>
    `).join('');

    lucide.createIcons();
}

function updateGorevPersonelOncelik(gorevId, personelId, oncelik, selectElement) {
    try {
        const oncelikInt = parseInt(oncelik);
        const yapiliyor = oncelikInt > 0 ? 1 : 0;

        db.run(`
            INSERT INTO gorev_personel (gorev_id, personel_id, yapiliyor, oncelik)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(gorev_id, personel_id) DO UPDATE SET yapiliyor = ?, oncelik = ?
        `, [gorevId, personelId, yapiliyor, oncelikInt, yapiliyor, oncelikInt]);

        saveDB();

        // Rengi güncelle
        if (selectElement) {
            selectElement.className = `matrix-priority-select priority-select-${oncelikInt}`;
        }
    } catch (error) {
        console.error('Matrix güncelleme hatası:', error);
    }
}

// Eski fonksiyonu geriye uyumluluk için koru
function updateGorevPersonel(gorevId, personelId, yapiliyor) {
    updateGorevPersonelOncelik(gorevId, personelId, yapiliyor ? 3 : 0, null);
}

// ===== EXCEL EXPORT =====

function exportGorevler() {
    const gorevler = getGorevlerWithPozisyonlar();

    if (gorevler.length === 0) {
        showNotification('Dışa aktarılacak veri yok', 'warning');
        return;
    }

    const exportData = gorevler.map(g => ({
        'Görev Adı': g.gorev_adi,
        'Atanan Pozisyonlar': g.pozisyonlar.map(p => p.pozisyon_adi).join(', '),
        'Açıklama': g.aciklama || ''
    }));

    exportToExcel(exportData, 'gorevler');
}

// ===== ÖNCELİK FONKSİYONLARI =====

function selectPriority(level) {
    // Tüm radio'ları kaldır
    document.querySelectorAll('.priority-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.querySelector('input[type="radio"]').checked = false;
    });

    // Seçilen önceliği işaretle
    const radioInput = document.querySelector(`input[name="oncelik"][value="${level}"]`);
    if (radioInput) {
        radioInput.checked = true;
        radioInput.closest('.priority-option').classList.add('selected');
    }
}

function getOncelikInfo(level) {
    const seviyeleri = {
        1: { isim: 'Opsiyonel', renk: '#9ca3af' },
        2: { isim: 'Düşük', renk: '#60a5fa' },
        3: { isim: 'Normal', renk: '#34d399' },
        4: { isim: 'Yüksek', renk: '#fbbf24' },
        5: { isim: 'Kritik', renk: '#f87171' }
    };
    return seviyeleri[level] || seviyeleri[3];
}

function getStars(level) {
    return '⭐'.repeat(level);
}

/**
 * Görev listesindeki atamaları görev matrisine senkronize eder.
 * gorev_pozisyon tablosundaki eşleşmelere göre gorev_personel tablosunu doldurur.
 * Eğer bir personel-görev ilişkisi zaten varsa atlamaz, yoksa 3 yıldız olarak ekler.
 */
function senkronizeMatris() {
    try {
        showLoading();

        // Tüm görev-pozisyon ilişkilerini al
        const gorevPozisyonlar = executeQuery(`
            SELECT gp.gorev_id, gp.pozisyon_id, g.gorev_adi, poz.pozisyon_adi
            FROM gorev_pozisyon gp
            JOIN gorevler g ON gp.gorev_id = g.id
            JOIN pozisyonlar poz ON gp.pozisyon_id = poz.id
        `);

        if (gorevPozisyonlar.length === 0) {
            hideLoading();
            showNotification('Aktarılacak görev-pozisyon eşleşmesi bulunamadı', 'warning');
            return;
        }

        let eklenenSayisi = 0;
        let mevcutSayisi = 0;

        gorevPozisyonlar.forEach(gp => {
            // Bu pozisyondaki aktif personelleri al
            const personeller = executeQuery(`
                SELECT id FROM personeller 
                WHERE pozisyon_id = ? AND durum = 'aktif'
            `, [gp.pozisyon_id]);

            personeller.forEach(p => {
                // Bu personel-görev ilişkisi zaten var mı kontrol et
                const mevcut = executeQuery(`
                    SELECT id FROM gorev_personel 
                    WHERE gorev_id = ? AND personel_id = ?
                `, [gp.gorev_id, p.id]);

                if (mevcut.length === 0) {
                    // Yoksa 3 yıldız olarak ekle (skipSave=true for batch)
                    executeCommand(`
                        INSERT INTO gorev_personel (gorev_id, personel_id, yapiliyor, oncelik)
                        VALUES (?, ?, 1, 3)
                    `, [gp.gorev_id, p.id], true);
                    eklenenSayisi++;
                } else {
                    mevcutSayisi++;
                }
            });
        });

        // Tek seferde kaydet
        saveDB();

        hideLoading();

        // Matrisi yeniden yükle
        loadGorevMatrix();

        showNotification(
            `Matrise aktarıldı: ${eklenenSayisi} yeni eşleşme eklendi, ${mevcutSayisi} zaten mevcuttu`,
            eklenenSayisi > 0 ? 'success' : 'info'
        );

    } catch (error) {
        hideLoading();
        console.error('Matris senkronizasyon hatası:', error);
        showNotification('Matris aktarımı sırasında hata: ' + error.message, 'error');
    }
}
