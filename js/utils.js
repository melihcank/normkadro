/**
 * Norm Kadro - Yardımcı Fonksiyonlar
 * Export, bildirim, validasyon ve hesaplama fonksiyonları
 */

// Toast bildirim göster
function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container') || createToastContainer();

    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-triangle',
        info: 'info'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i data-lucide="${icons[type]}" class="toast-icon"></i>
        <div class="toast-content">
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i data-lucide="x"></i>
        </button>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => toast.remove(), duration);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// Form validasyonu
function validateForm(formData, rules) {
    const errors = {};

    for (const [field, rule] of Object.entries(rules)) {
        const value = formData[field];

        if (rule.required && (!value || value.toString().trim() === '')) {
            errors[field] = `${rule.label || field} zorunludur`;
            continue;
        }

        if (value && rule.min !== undefined && parseFloat(value) < rule.min) {
            errors[field] = `${rule.label || field} en az ${rule.min} olmalıdır`;
        }

        if (value && rule.max !== undefined && parseFloat(value) > rule.max) {
            errors[field] = `${rule.label || field} en fazla ${rule.max} olmalıdır`;
        }
    }

    return { isValid: Object.keys(errors).length === 0, errors };
}

// Sayı formatlama
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
    }).format(num);
}

// Norm kadro hesaplama
function calculateNormKadro(isYuku, standartZaman, config) {
    const aylikCalisma = config.aylikCalismaSeati || APP_CONFIG.aylikCalismaSeati;
    const verimlilik = config.verimlilikKatsayisi || APP_CONFIG.verimlilikKatsayisi;

    // Periyodu aylığa çevir
    const periyotCarpan = APP_CONFIG.periyotCarpanlari[isYuku.periyot] || 1;
    const aylikHacim = isYuku.hacim * periyotCarpan;

    // Süreyi dakikaya çevir
    const zamanCarpan = APP_CONFIG.zamanCarpanlari[standartZaman.birim] || 1;
    const dakikaSure = standartZaman.standart_sure * zamanCarpan;

    // Toplam aylık iş yükü (dakika)
    const toplamDakika = aylikHacim * dakikaSure;

    // Aylık çalışma kapasitesi (dakika)
    const kapasite = aylikCalisma * 60 * verimlilik;

    // Gerekli kişi sayısı
    const gerekliKisi = toplamDakika / kapasite;

    return {
        aylikHacim,
        dakikaSure,
        toplamDakika,
        toplamSaat: toplamDakika / 60,
        gerekliKisi
    };
}

// Excel'e aktar
function exportToExcel(data, filename = 'rapor') {
    if (!data || data.length === 0) {
        showNotification('Aktarılacak veri bulunamadı', 'warning');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rapor');
    XLSX.writeFile(wb, `${filename}_${formatDate(new Date())}.xlsx`);
    showNotification('Excel dosyası indirildi', 'success');
}

// Tarih formatlama
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Tema değiştir
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(APP_CONFIG.themeKey, newTheme);
}

// Tema yükle
function loadTheme() {
    const saved = localStorage.getItem(APP_CONFIG.themeKey);
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    }
}

// Onay diyaloğu
function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active confirm-dialog';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-body">
                    <div class="confirm-icon">
                        <i data-lucide="alert-triangle"></i>
                    </div>
                    <h3 class="confirm-title">${title}</h3>
                    <p class="confirm-message">${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="confirmCancel">İptal</button>
                    <button class="btn btn-danger" id="confirmOk">Onayla</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        lucide.createIcons();

        overlay.querySelector('#confirmCancel').onclick = () => {
            overlay.remove();
            resolve(false);
        };

        overlay.querySelector('#confirmOk').onclick = () => {
            overlay.remove();
            resolve(true);
        };
    });
}

// Loading göster/gizle
function showLoading() {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
}

// Modal aç/kapa
function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

// Sidebar toggle (mobil)
function toggleSidebar() {
    document.querySelector('.sidebar')?.classList.toggle('open');
}

// Zaman etüdü hesaplama
function calculateTimeStudy(observations) {
    if (!observations || observations.length === 0) {
        return { ortalama: 0, stdSapma: 0, min: 0, max: 0 };
    }

    const nums = observations.filter(o => !isNaN(o) && o > 0);
    if (nums.length === 0) return { ortalama: 0, stdSapma: 0, min: 0, max: 0 };

    const ortalama = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((sum, val) => sum + Math.pow(val - ortalama, 2), 0) / nums.length;
    const stdSapma = Math.sqrt(variance);

    return {
        ortalama: ortalama,
        stdSapma: stdSapma,
        min: Math.min(...nums),
        max: Math.max(...nums),
        gozlemSayisi: nums.length
    };
}

// Sayfa yüklendiğinde tema uygula
document.addEventListener('DOMContentLoaded', loadTheme);
