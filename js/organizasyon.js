/**
 * Norm Kadro - Organizasyon Şeması Modülü
 * Yatay hiyerarşik organizasyon görselleştirmesi
 * Zoom/Pan ve PDF export desteği
 */

let currentZoom = 1;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        await initDB();
        renderOrgChart();
        setupZoomPan();
        setupEventListeners();
    } catch (error) {
        showNotification('Veritabanı başlatılamadı', 'error');
    } finally {
        hideLoading();
        lucide.createIcons();
    }
});

function setupEventListeners() {
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal('detailModal'));
    });

    document.getElementById('detailModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal('detailModal');
    });
}

function setupZoomPan() {
    const viewport = document.getElementById('orgViewport');
    const canvas = document.getElementById('orgCanvas');

    if (!viewport || !canvas) return;

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }
    }, { passive: false });

    // Drag to pan
    let isDragging = false;
    let startX, startY, scrollLeft, scrollTop;

    viewport.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.pageX - viewport.offsetLeft;
        startY = e.pageY - viewport.offsetTop;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
    });

    viewport.addEventListener('mouseleave', () => isDragging = false);
    viewport.addEventListener('mouseup', () => isDragging = false);

    viewport.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const y = e.pageY - viewport.offsetTop;
        viewport.scrollLeft = scrollLeft - (x - startX);
        viewport.scrollTop = scrollTop - (y - startY);
    });
}

function zoomIn() {
    if (currentZoom < MAX_ZOOM) {
        currentZoom += ZOOM_STEP;
        applyZoom();
    }
}

function zoomOut() {
    if (currentZoom > MIN_ZOOM) {
        currentZoom -= ZOOM_STEP;
        applyZoom();
    }
}

function resetZoom() {
    currentZoom = 1;
    applyZoom();
    const viewport = document.getElementById('orgViewport');
    if (viewport) {
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
    }
}

function applyZoom() {
    const canvas = document.getElementById('orgCanvas');
    if (canvas) {
        canvas.style.transform = `scale(${currentZoom})`;
    }
    // Zoom seviyesini göster
    const zoomLabel = document.getElementById('zoomLevel');
    if (zoomLabel) {
        zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
    }
}

function renderOrgChart() {
    const container = document.getElementById('orgCanvas');
    if (!container) return;

    const tree = getOrgTree();

    if (tree.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted" style="padding: 3rem;">
                <i data-lucide="git-branch" style="width:64px;height:64px;margin-bottom:1rem;opacity:0.5"></i>
                <p>Henüz pozisyon tanımlanmamış</p>
                <a href="is-analizi.html" class="btn btn-primary mt-3">
                    <i data-lucide="plus"></i> Pozisyon Ekle
                </a>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `<div class="org-tree">${renderNodes(tree)}</div>`;
    lucide.createIcons();
}

function renderNodes(nodes) {
    if (!nodes || nodes.length === 0) return '';

    return nodes.map(node => {
        const hasChildren = node.children && node.children.length > 0;
        const personelCount = node.personeller ? node.personeller.length : 0;

        return `
            <div class="org-node-wrapper">
                <div class="org-node" onclick="showPozisyonDetail(${node.id})">
                    <div class="org-node-header">
                        <span class="org-node-dept">${node.departman || 'Genel'}</span>
                    </div>
                    <div class="org-node-title">${node.pozisyon_adi}</div>
                    <div class="org-node-info">
                        <span class="org-node-count">
                            <i data-lucide="users"></i>
                            ${personelCount}
                        </span>
                    </div>
                    ${personelCount > 0 ? `
                        <div class="org-node-people">
                            ${node.personeller.slice(0, 2).map(p => `<span>${p.ad} ${p.soyad}</span>`).join('')}
                            ${personelCount > 2 ? `<span class="text-muted">+${personelCount - 2} kişi</span>` : ''}
                        </div>
                    ` : ''}
                </div>
                ${hasChildren ? `
                    <div class="org-children">
                        ${renderNodes(node.children)}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function showPozisyonDetail(pozisyonId) {
    const pozisyon = getById('pozisyonlar', pozisyonId);
    if (!pozisyon) return;

    const personeller = getPersonellerByPozisyon(pozisyonId);
    const gorevler = select('gorevler', { pozisyon_id: pozisyonId });

    document.getElementById('detailTitle').textContent = pozisyon.pozisyon_adi;

    const content = document.getElementById('detailContent');
    content.innerHTML = `
        <div class="detail-section">
            <h4><i data-lucide="building"></i> Pozisyon Bilgileri</h4>
            <div class="detail-grid">
                <div><strong>Departman:</strong> ${pozisyon.departman || '-'}</div>
                <div><strong>Açıklama:</strong> ${pozisyon.aciklama || '-'}</div>
            </div>
        </div>
        
        <div class="detail-section">
            <h4><i data-lucide="users"></i> Personeller (${personeller.length})</h4>
            ${personeller.length > 0 ? `
                <div class="detail-list">
                    ${personeller.map(p => `
                        <div class="detail-list-item">
                            <span class="badge badge-primary">${p.personel_no}</span>
                            <strong>${p.ad} ${p.soyad}</strong>
                            ${p.email ? `<span class="text-muted">${p.email}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : '<p class="text-muted">Bu pozisyona atanmış personel yok</p>'}
        </div>
        
        <div class="detail-section">
            <h4><i data-lucide="list-checks"></i> Görevler (${gorevler.length})</h4>
            ${gorevler.length > 0 ? `
                <div class="detail-list">
                    ${gorevler.map(g => `
                        <div class="detail-list-item">
                            <strong>${g.gorev_adi}</strong>
                            ${g.aciklama ? `<span class="text-muted">${g.aciklama}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : '<p class="text-muted">Bu pozisyona atanmış görev yok</p>'}
        </div>
    `;

    lucide.createIcons();
    openModal('detailModal');
}

function exportOrgData() {
    const data = getAllDataForExport();

    const wb = XLSX.utils.book_new();

    const wsPoz = XLSX.utils.json_to_sheet(data.pozisyonlar.map(p => ({
        'ID': p.id,
        'Pozisyon Adı': p.pozisyon_adi,
        'Departman': p.departman || '',
        'Üst Pozisyon': p.ust_pozisyon || '',
        'Personel Sayısı': p.mevcut_kisi_sayisi,
        'Açıklama': p.aciklama || ''
    })));
    XLSX.utils.book_append_sheet(wb, wsPoz, 'Pozisyonlar');

    const wsPer = XLSX.utils.json_to_sheet(data.personeller.map(p => ({
        'Personel No': p.personel_no,
        'Ad': p.ad,
        'Soyad': p.soyad,
        'Pozisyon': p.pozisyon_adi || '',
        'Departman': p.departman || '',
        'E-posta': p.email || '',
        'Telefon': p.telefon || '',
        'Durum': p.durum
    })));
    XLSX.utils.book_append_sheet(wb, wsPer, 'Personeller');

    const wsGor = XLSX.utils.json_to_sheet(data.gorevler.map(g => ({
        'Görev Adı': g.gorev_adi,
        'Pozisyon': g.pozisyon_adi || '',
        'Açıklama': g.aciklama || ''
    })));
    XLSX.utils.book_append_sheet(wb, wsGor, 'Görevler');

    XLSX.writeFile(wb, `organizasyon_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Excel dosyası indirildi', 'success');
}

async function exportOrgPDF() {
    showLoading();

    try {
        const canvas = document.getElementById('orgCanvas');
        if (!canvas) {
            showNotification('Şema bulunamadı', 'error');
            return;
        }

        // Geçici olarak zoom'u sıfırla
        const originalZoom = currentZoom;
        currentZoom = 1;
        applyZoom();

        // html2canvas ile görüntü al
        const canvasImage = await html2canvas(canvas, {
            scale: 2,
            useCORS: true,
            backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-tertiary') || '#f1f5f9'
        });

        // PDF oluştur
        const { jsPDF } = window.jspdf;
        const imgWidth = canvasImage.width;
        const imgHeight = canvasImage.height;

        // A4 yatay veya düşey seçimi
        const orientation = imgWidth > imgHeight ? 'l' : 'p';
        const pdf = new jsPDF(orientation, 'mm', 'a4');

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        const width = imgWidth * ratio;
        const height = imgHeight * ratio;

        const x = (pdfWidth - width) / 2;
        const y = 10;

        pdf.addImage(canvasImage.toDataURL('image/png'), 'PNG', x, y, width, height - 20);
        pdf.save(`organizasyon_semasi_${new Date().toISOString().split('T')[0]}.pdf`);

        // Zoom'u geri yükle
        currentZoom = originalZoom;
        applyZoom();

        showNotification('PDF dosyası indirildi', 'success');
    } catch (error) {
        console.error('PDF export hatası:', error);
        showNotification('PDF oluşturulamadı: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}
