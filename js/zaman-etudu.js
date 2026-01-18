/**
 * Norm Kadro - Zaman Etüdü Modülü
 * Gözlem bazlı zaman ölçümü ve istatistiksel analiz
 */

let gozlemler = [];

document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        await initDB();
        loadGorevSelect();
    } catch (error) {
        console.error('Sayfa yükleme hatası:', error);
    }
    hideLoading();
    lucide.createIcons();
});

function loadGorevSelect() {
    const gorevler = select('gorevler');
    const selectEl = document.getElementById('etudGorevSelect');

    selectEl.innerHTML = '<option value="">Görev seçin...</option>' +
        gorevler.map(g => `<option value="${g.id}">${g.gorev_adi}</option>`).join('');
}

function addGozlem() {
    const input = document.getElementById('gozlemInput');
    const value = parseFloat(input.value);

    if (isNaN(value) || value <= 0) {
        showNotification('Geçerli bir süre girin', 'warning');
        return;
    }

    gozlemler.push(value);
    input.value = '';
    input.focus();

    renderGozlemler();
    hesaplaEtudSonuclari();
}

function removeGozlem(index) {
    gozlemler.splice(index, 1);
    renderGozlemler();
    hesaplaEtudSonuclari();
}

function renderGozlemler() {
    const container = document.getElementById('gozlemlerList');

    if (gozlemler.length === 0) {
        container.innerHTML = '<p class="text-muted">Henüz gözlem eklenmedi</p>';
        return;
    }

    container.innerHTML = gozlemler.map((g, i) => `
        <span class="badge badge-primary" style="cursor: pointer;" onclick="removeGozlem(${i})" title="Kaldırmak için tıklayın">
            ${g.toFixed(2)} dk
            <i data-lucide="x" style="width: 12px; height: 12px; margin-left: 4px;"></i>
        </span>
    `).join('');

    lucide.createIcons();
}

function hesaplaEtudSonuclari() {
    let veriler = [...gozlemler];

    // Aykırı veri filtreleme
    if (document.getElementById('aykiriVeriToggle')?.checked && veriler.length >= 4) {
        veriler = filterOutliers(veriler);
    }

    const sayi = veriler.length;
    const ortalama = sayi > 0 ? veriler.reduce((a, b) => a + b, 0) / sayi : 0;
    const stdSapma = sayi > 1 ? Math.sqrt(veriler.reduce((sum, v) => sum + Math.pow(v - ortalama, 2), 0) / (sayi - 1)) : 0;
    const min = sayi > 0 ? Math.min(...veriler) : 0;
    const max = sayi > 0 ? Math.max(...veriler) : 0;

    document.getElementById('etudSayi').textContent = sayi;
    document.getElementById('etudOrtalama').textContent = ortalama.toFixed(2) + ' dk';
    document.getElementById('etudStdSapma').textContent = stdSapma.toFixed(2) + ' dk';
    document.getElementById('etudMin').textContent = min.toFixed(2) + ' dk';
    document.getElementById('etudMax').textContent = max.toFixed(2) + ' dk';
}

function filterOutliers(data) {
    const sorted = [...data].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return data.filter(v => v >= lowerBound && v <= upperBound);
}

function kullanOrtalama() {
    const gorevId = document.getElementById('etudGorevSelect').value;

    if (gozlemler.length === 0) {
        showNotification('Önce gözlem ekleyin', 'warning');
        return;
    }

    let veriler = [...gozlemler];
    if (document.getElementById('aykiriVeriToggle')?.checked && veriler.length >= 4) {
        veriler = filterOutliers(veriler);
    }

    const ortalama = veriler.reduce((a, b) => a + b, 0) / veriler.length;

    if (!gorevId) {
        showNotification(`Hesaplanan ortalama: ${ortalama.toFixed(2)} dakika`, 'info');
        return;
    }

    // Standart zaman tablosuna kaydet
    const existing = executeQuery('SELECT id FROM standart_zaman WHERE gorev_id = ?', [gorevId]);

    if (existing.length > 0) {
        update('standart_zaman', existing[0].id, {
            standart_sure: ortalama,
            birim: 'dakika'
        });
    } else {
        insert('standart_zaman', {
            gorev_id: gorevId,
            standart_sure: ortalama,
            birim: 'dakika'
        });
    }

    showNotification(`Standart zaman ${ortalama.toFixed(2)} dakika olarak kaydedildi`, 'success');
}

function temizleEtud() {
    gozlemler = [];
    renderGozlemler();
    hesaplaEtudSonuclari();
    document.getElementById('etudGorevSelect').value = '';
    showNotification('Gözlemler temizlendi', 'info');
}
