/**
 * Norm Kadro - Hesaplama Modülü
 * Hesaplama görev matrisindeki tiklere göre yapılır.
 * Bir görevin iş yükü, o görevi yapan kişinin pozisyonuna yüklenir.
 */

let raporVerisi = [];
let pozisyonParametreleri = {};

const HESAPLAMA_STATE_KEY = 'hesaplamaState';

document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        await initDB();
        loadParametreler();
        loadPozisyonParametreTable();
        setupEventListeners();
        restoreHesaplamaState();
    } catch (error) {
        showNotification('Veritabanı başlatılamadı', 'error');
    } finally {
        hideLoading();
        lucide.createIcons();
    }
});

function setupEventListeners() {
    document.getElementById('hesaplaBtn')?.addEventListener('click', hesapla);
    document.getElementById('hesaplaBtnPozisyon')?.addEventListener('click', hesaplaPozisyonBazli);

    // Form değişikliklerini kaydet
    document.getElementById('aylikCalisma')?.addEventListener('change', saveHesaplamaState);
    document.getElementById('verimlilik')?.addEventListener('change', saveHesaplamaState);
    document.querySelectorAll('input[name="dagitimYontemi"]').forEach(r => r.addEventListener('change', saveHesaplamaState));
    document.querySelectorAll('input[name="donemSecimi"]').forEach(r => r.addEventListener('change', saveHesaplamaState));
    document.querySelectorAll('input[name="oncelikFiltre"]').forEach(cb => cb.addEventListener('change', saveHesaplamaState));
    document.getElementById('secilenAy')?.addEventListener('change', saveHesaplamaState);
}

function loadParametreler() {
    document.getElementById('aylikCalisma').value = APP_CONFIG.aylikCalismaSeati;
    document.getElementById('verimlilik').value = APP_CONFIG.verimlilikKatsayisi;
}

// ===== DURUM KAYDI FONKSİYONLARI =====

function saveHesaplamaState() {
    const state = {
        aylikCalisma: document.getElementById('aylikCalisma')?.value,
        verimlilik: document.getElementById('verimlilik')?.value,
        dagitimYontemi: document.querySelector('input[name="dagitimYontemi"]:checked')?.value,
        donemSecimi: document.querySelector('input[name="donemSecimi"]:checked')?.value,
        secilenAy: document.getElementById('secilenAy')?.value,
        oncelikFiltre: Array.from(document.querySelectorAll('input[name="oncelikFiltre"]:checked')).map(cb => cb.value),
        raporVerisi: raporVerisi,
        timestamp: Date.now()
    };

    try {
        sessionStorage.setItem(HESAPLAMA_STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Durum kaydedilemedi:', e);
    }
}

function restoreHesaplamaState() {
    try {
        const saved = sessionStorage.getItem(HESAPLAMA_STATE_KEY);
        if (!saved) return;

        const state = JSON.parse(saved);

        // Form değerlerini geri yükle
        if (state.aylikCalisma) {
            document.getElementById('aylikCalisma').value = state.aylikCalisma;
        }
        if (state.verimlilik) {
            document.getElementById('verimlilik').value = state.verimlilik;
        }
        if (state.dagitimYontemi) {
            const radio = document.querySelector(`input[name="dagitimYontemi"][value="${state.dagitimYontemi}"]`);
            if (radio) radio.checked = true;
        }
        if (state.donemSecimi) {
            const radio = document.querySelector(`input[name="donemSecimi"][value="${state.donemSecimi}"]`);
            if (radio) radio.checked = true;
            toggleDonemAySecimi();
        }
        if (state.secilenAy) {
            document.getElementById('secilenAy').value = state.secilenAy;
        }
        if (state.oncelikFiltre) {
            document.querySelectorAll('input[name="oncelikFiltre"]').forEach(cb => {
                cb.checked = state.oncelikFiltre.includes(cb.value);
            });
        }

        // Hesaplama sonuçlarını geri yükle
        if (state.raporVerisi && state.raporVerisi.length > 0) {
            raporVerisi = state.raporVerisi;
            renderRaporTable();

            // Özetleri güncelle
            const toplamMevcut = raporVerisi.reduce((sum, r) => sum + r.mevcut, 0);
            const toplamGerekli = raporVerisi.reduce((sum, r) => sum + r.gerekli, 0);
            const toplamMesai = raporVerisi.reduce((sum, r) => sum + (r.mesaiIhtiyaci || 0), 0);

            document.getElementById('toplamMevcut').textContent = formatNumber(toplamMevcut, 0);
            document.getElementById('toplamGerekli').textContent = formatNumber(toplamGerekli, 2);
            document.getElementById('toplamFark').textContent = formatNumber(toplamMevcut - toplamGerekli, 2);

            const mesaiEl = document.getElementById('toplamMesai');
            if (mesaiEl) {
                mesaiEl.textContent = formatNumber(toplamMesai, 1) + ' saat';
            }

            document.getElementById('sonucAlani').classList.remove('hidden');
        }

        lucide.createIcons();
    } catch (e) {
        console.warn('Durum geri yüklenemedi:', e);
    }
}

function toggleHesaplamaModu() {
    const modu = document.querySelector('input[name="hesaplamaModu"]:checked').value;
    const genelDiv = document.getElementById('genelParametreler');
    const pozisyonDiv = document.getElementById('pozisyonParametreler');

    if (modu === 'genel') {
        genelDiv.classList.remove('hidden');
        pozisyonDiv.classList.add('hidden');
    } else {
        genelDiv.classList.add('hidden');
        pozisyonDiv.classList.remove('hidden');
        loadPozisyonParametreTable();
    }

    lucide.createIcons();
}

function toggleDonemAySecimi() {
    const donem = document.querySelector('input[name="donemSecimi"]:checked')?.value;
    const aySecimi = document.getElementById('aySecimi');
    if (aySecimi) {
        aySecimi.style.display = donem === 'belirli' ? 'block' : 'none';
    }
}

function getSecilenOncelikler() {
    const checkboxes = document.querySelectorAll('input[name="oncelikFiltre"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

function getDonemParametreleri() {
    const donem = document.querySelector('input[name="donemSecimi"]:checked')?.value || 'yillik';
    const secilenAy = parseInt(document.getElementById('secilenAy')?.value || 1);

    return {
        donem,
        secilenAy,
        aylar: getAyListesi(donem, secilenAy)
    };
}

function getAyListesi(donem, secilenAy) {
    switch (donem) {
        case 'belirli':
            return [secilenAy];
        case 'pik':
            // En yoğun 3 ay - varsayılan olarak 1,3,12 (Ocak, Mart, Aralık)
            return null; // Hesaplamada dinamik olarak belirlenir
        case 'dusuk':
            // En sakin 3 ay - varsayılan olarak 7,8,9 (Yaz ayları)
            return null; // Hesaplamada dinamik olarak belirlenir
        case 'yillik':
        default:
            return null; // 12 ayın ortalaması
    }
}

function loadPozisyonParametreTable() {
    const pozisyonlar = select('pozisyonlar', null, 'pozisyon_adi');
    const tbody = document.getElementById('pozisyonParametreTable');

    if (!tbody) return;

    if (pozisyonlar.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="table-empty">
                    <p>Henüz pozisyon tanımlanmamış</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pozisyonlar.map(p => {
        const params = pozisyonParametreleri[p.id] || {
            aylikCalisma: APP_CONFIG.aylikCalismaSeati,
            verimlilik: APP_CONFIG.verimlilikKatsayisi
        };

        return `
        <tr>
            <td><strong>${p.pozisyon_adi}</strong></td>
            <td>${p.departman || '-'}</td>
            <td>
                <input type="number" class="form-input" 
                       data-pozisyon-id="${p.id}" 
                       data-param="aylikCalisma"
                       value="${params.aylikCalisma}" 
                       min="1" style="width: 100%;"
                       onchange="updatePozisyonParam(${p.id}, 'aylikCalisma', this.value)">
            </td>
            <td>
                <input type="number" class="form-input" 
                       data-pozisyon-id="${p.id}" 
                       data-param="verimlilik"
                       value="${params.verimlilik}" 
                       min="0.1" max="1" step="0.05" style="width: 100%;"
                       onchange="updatePozisyonParam(${p.id}, 'verimlilik', this.value)">
            </td>
        </tr>
    `;
    }).join('');
}

function updatePozisyonParam(pozisyonId, param, value) {
    if (!pozisyonParametreleri[pozisyonId]) {
        pozisyonParametreleri[pozisyonId] = {
            aylikCalisma: APP_CONFIG.aylikCalismaSeati,
            verimlilik: APP_CONFIG.verimlilikKatsayisi
        };
    }
    pozisyonParametreleri[pozisyonId][param] = parseFloat(value);
}

function hesapla() {
    const config = {
        aylikCalismaSeati: parseFloat(document.getElementById('aylikCalisma').value) || 160,
        verimlilikKatsayisi: parseFloat(document.getElementById('verimlilik').value) || 0.85,
        oncelikFiltre: getSecilenOncelikler(),
        donemParametreleri: getDonemParametreleri()
    };

    hesaplaInternal(config, false);
}

function hesaplaPozisyonBazli() {
    document.querySelectorAll('#pozisyonParametreTable input').forEach(input => {
        const pozId = parseInt(input.dataset.pozisyonId);
        const param = input.dataset.param;
        updatePozisyonParam(pozId, param, input.value);
    });

    hesaplaInternal(null, true);
}

// ========== YENİ HESAPLAMA ALGORİTMASI ==========
// Görev matrisine dayalı hesaplama

/**
 * Görev matrisinden tikli olan kayıtları döndürür
 * Her kayıt: gorev_id, personel_id, pozisyon_id içerir
 */
function getAktifGorevPersonelMatrisi() {
    return executeQuery(`
        SELECT 
            gp.gorev_id,
            gp.personel_id,
            p.pozisyon_id,
            poz.pozisyon_adi,
            g.gorev_adi
        FROM gorev_personel gp
        JOIN personeller p ON gp.personel_id = p.id
        JOIN pozisyonlar poz ON p.pozisyon_id = poz.id
        JOIN gorevler g ON gp.gorev_id = g.id
        WHERE gp.yapiliyor = 1 AND p.durum = 'aktif'
    `);
}

/**
 * Tikli olan görevlerin iş yükü ve standart zaman bilgilerini getirir
 * Öncelik filtresi uygulanabilir
 */
function getGorevlerWithWorkload(oncelikFiltre = null) {
    let sql = `
        SELECT 
            g.id as gorev_id, 
            g.gorev_adi, 
            g.oncelik,
            iy.hacim, 
            iy.birim as hacim_birim, 
            iy.periyot,
            sz.standart_sure, 
            sz.birim as zaman_birim
        FROM gorevler g
        LEFT JOIN is_yuku iy ON g.id = iy.gorev_id
        LEFT JOIN standart_zaman sz ON g.id = sz.gorev_id
        WHERE iy.hacim IS NOT NULL AND sz.standart_sure IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM gorev_personel gp 
            WHERE gp.gorev_id = g.id AND gp.yapiliyor = 1
        )
    `;

    let gorevler = executeQuery(sql);

    // Öncelik filtresi uygula
    if (oncelikFiltre && oncelikFiltre.length > 0) {
        gorevler = gorevler.filter(g => {
            const oncelik = g.oncelik || 3;
            return oncelikFiltre.includes(oncelik);
        });
    }

    // Görevleri önem sırasına göre sırala (kritik görevler önce işlenir)
    gorevler.sort((a, b) => {
        const oncelikA = a.oncelik || 3;
        const oncelikB = b.oncelik || 3;
        return oncelikB - oncelikA; // Yüksek öncelik önce
    });

    return gorevler;
}

/**
 * Bir görevi kaç kişi yapıyor? (Toplam tikli kişi sayısı)
 */
function getGorevYapanKisiSayisi(gorevId) {
    const result = executeQuery(`
        SELECT COUNT(*) as sayi 
        FROM gorev_personel gp
        JOIN personeller p ON gp.personel_id = p.id
        WHERE gp.gorev_id = ? AND gp.yapiliyor = 1 AND p.durum = 'aktif'
    `, [gorevId]);
    return result[0]?.sayi || 0;
}

/**
 * Bir pozisyondaki kaç kişi bu görevi yapıyor?
 */
function getPozisyonGorevYapanSayisi(gorevId, pozisyonId) {
    const result = executeQuery(`
        SELECT COUNT(*) as sayi 
        FROM gorev_personel gp
        JOIN personeller p ON gp.personel_id = p.id
        WHERE gp.gorev_id = ? AND gp.yapiliyor = 1 AND p.pozisyon_id = ? AND p.durum = 'aktif'
    `, [gorevId, pozisyonId]);
    return result[0]?.sayi || 0;
}

/**
 * Bir görevi hangi pozisyonlar yapıyor? (tikli personellerin pozisyonları)
 * oncelik parametresi dahil edilir
 */
function getGoreviYapanPozisyonlar(gorevId) {
    return executeQuery(`
        SELECT DISTINCT poz.id, poz.pozisyon_adi, poz.departman,
               COUNT(*) as yapan_sayisi,
               MAX(gp.oncelik) as max_oncelik,
               AVG(gp.oncelik) as avg_oncelik
        FROM gorev_personel gp
        JOIN personeller p ON gp.personel_id = p.id
        JOIN pozisyonlar poz ON p.pozisyon_id = poz.id
        WHERE gp.gorev_id = ? AND gp.yapiliyor = 1 AND p.durum = 'aktif'
        GROUP BY poz.id
    `, [gorevId]);
}

/**
 * Bir görevi yapan kişileri öncelik bilgisiyle getirir (kademeli dağıtım için)
 */
function getGoreviYapanKisiler(gorevId) {
    return executeQuery(`
        SELECT 
            gp.personel_id,
            gp.oncelik,
            p.pozisyon_id,
            p.ad,
            p.soyad,
            poz.pozisyon_adi
        FROM gorev_personel gp
        JOIN personeller p ON gp.personel_id = p.id
        JOIN pozisyonlar poz ON p.pozisyon_id = poz.id
        WHERE gp.gorev_id = ? AND gp.yapiliyor = 1 AND gp.oncelik > 0 AND p.durum = 'aktif'
        ORDER BY gp.oncelik DESC
    `, [gorevId]);
}

/**
 * Pozisyon kapasitesini hesaplar
 */
function getPozisyonKapasite(pozisyonId, config, isPozisyonBazli) {
    const personelSayisi = getPersonelCountByPozisyon(pozisyonId);

    let aylikCalisma, verimlilik;
    if (isPozisyonBazli && pozisyonParametreleri[pozisyonId]) {
        aylikCalisma = pozisyonParametreleri[pozisyonId].aylikCalisma;
        verimlilik = pozisyonParametreleri[pozisyonId].verimlilik;
    } else if (config) {
        aylikCalisma = config.aylikCalismaSeati;
        verimlilik = config.verimlilikKatsayisi;
    } else {
        aylikCalisma = APP_CONFIG.aylikCalismaSeati;
        verimlilik = APP_CONFIG.verimlilikKatsayisi;
    }

    const netKapasitePerPerson = aylikCalisma * verimlilik;

    return {
        personelSayisi,
        aylikCalisma,
        verimlilik,
        netKapasitePerPerson,
        toplamKapasite: netKapasitePerPerson * Math.max(personelSayisi, 1)
    };
}

/**
 * Görevin aylık toplam iş yükünü saat cinsinden hesaplar
 * Mevsimsel çarpan uygulanabilir
 */
function calculateGorevIsYuku(gorev, donemParametreleri = null) {
    if (!gorev.hacim || !gorev.standart_sure) return 0;

    const hacim = parseFloat(gorev.hacim);
    let aylikHacim = hacim;
    switch (gorev.periyot) {
        case 'günlük': aylikHacim = hacim * 22; break;
        case 'haftalık': aylikHacim = hacim * 4.33; break;
        case 'aylık': aylikHacim = hacim; break;
        case 'yıllık': aylikHacim = hacim / 12; break;
    }

    let dakikaSure = parseFloat(gorev.standart_sure);
    if (gorev.zaman_birim === 'saat') dakikaSure *= 60;
    else if (gorev.zaman_birim === 'saniye') dakikaSure /= 60;

    let baseIsYuku = (aylikHacim * dakikaSure) / 60;

    // Mevsimsel çarpan uygula
    if (donemParametreleri && gorev.gorev_id) {
        const carpanlar = getMevsimselCarpanlar(gorev.gorev_id);
        const donem = donemParametreleri.donem;

        let mevsimselCarpan = 1.0;

        if (donem === 'belirli') {
            // Belirli ay seçildi
            mevsimselCarpan = carpanlar[donemParametreleri.secilenAy - 1];
        } else if (donem === 'pik') {
            // En yüksek 3 ayın ortalaması
            const sortedCarpanlar = [...carpanlar].sort((a, b) => b - a);
            mevsimselCarpan = (sortedCarpanlar[0] + sortedCarpanlar[1] + sortedCarpanlar[2]) / 3;
        } else if (donem === 'dusuk') {
            // En düşük 3 ayın ortalaması
            const sortedCarpanlar = [...carpanlar].sort((a, b) => a - b);
            mevsimselCarpan = (sortedCarpanlar[0] + sortedCarpanlar[1] + sortedCarpanlar[2]) / 3;
        } else {
            // Yıllık ortalama
            mevsimselCarpan = carpanlar.reduce((a, b) => a + b, 0) / 12;
        }

        baseIsYuku *= mevsimselCarpan;
    }

    return baseIsYuku;
}

/**
 * ORANSAL DAĞITIM
 * Bir görevi birden fazla pozisyondaki kişiler yapıyorsa,
 * iş yükü yapan kişi sayısına ORANLA pozisyonlara dağıtılır.
 */
function hesaplaOransal(gorevler, config, isPozisyonBazli) {
    const pozisyonIsYuku = {};
    const pozisyonBilgi = {};
    const donemParametreleri = config?.donemParametreleri || null;

    // Tüm pozisyonları hazırla
    const tumPozisyonlar = select('pozisyonlar');
    tumPozisyonlar.forEach(p => {
        const kapasite = getPozisyonKapasite(p.id, config, isPozisyonBazli);
        pozisyonBilgi[p.id] = {
            ...p,
            ...kapasite,
            gorevler: []
        };
        pozisyonIsYuku[p.id] = 0;
    });

    // Her görev için
    gorevler.forEach(gorev => {
        const toplamIsYuku = calculateGorevIsYuku(gorev, donemParametreleri);
        if (toplamIsYuku === 0) return;

        // Bu görevi YAPAN pozisyonları bul (tikli personellere göre)
        const yapanPozisyonlar = getGoreviYapanPozisyonlar(gorev.gorev_id);

        if (yapanPozisyonlar.length === 0) return;

        // Toplam yapan kişi sayısını hesapla
        const toplamYapanKisi = yapanPozisyonlar.reduce((sum, p) => sum + p.yapan_sayisi, 0);

        if (toplamYapanKisi === 0) return;

        // Her pozisyona, yapan kişi sayısı oranında iş yükü dağıt
        yapanPozisyonlar.forEach(poz => {
            if (pozisyonBilgi[poz.id]) {
                // Paylaşım oranı = bu pozisyondaki yapan sayısı / toplam yapan sayısı
                const oran = poz.yapan_sayisi / toplamYapanKisi;
                const pozPayi = toplamIsYuku * oran;

                pozisyonIsYuku[poz.id] += pozPayi;
                pozisyonBilgi[poz.id].gorevler.push({
                    ...gorev,
                    toplamSaat: pozPayi,
                    paylasildi: yapanPozisyonlar.length > 1,
                    paylasimOrani: oran,
                    ortakPozisyonSayisi: yapanPozisyonlar.length,
                    yapanKisiSayisi: poz.yapan_sayisi
                });
            }
        });
    });

    return { pozisyonIsYuku, pozisyonBilgi };
}

/**
 * KADEMELİ DAĞITIM (Konsept 3 - Waterfall)
 * Yüksek öncelikli kişiler önce iş yükü alır.
 * Kapasite yetmezse aynı gruptaki diğer pozisyonlara, sonra düşük öncelikli kişilere taşar.
 */
function hesaplaKademeli(gorevler, config, isPozisyonBazli) {
    const pozisyonIsYuku = {};
    const pozisyonBilgi = {};
    const donemParametreleri = config?.donemParametreleri || null;

    // Tüm pozisyonları hazırla
    const tumPozisyonlar = select('pozisyonlar');
    tumPozisyonlar.forEach(p => {
        const kapasite = getPozisyonKapasite(p.id, config, isPozisyonBazli);
        pozisyonBilgi[p.id] = {
            ...p,
            ...kapasite,
            kalanKapasite: kapasite.toplamKapasite,
            gorevler: []
        };
        pozisyonIsYuku[p.id] = 0;
    });

    // Her görev için
    gorevler.forEach(gorev => {
        const toplamIsYuku = calculateGorevIsYuku(gorev, donemParametreleri);
        if (toplamIsYuku === 0) return;

        // Bu görevi yapan kişileri öncelik sırasına göre al
        const yapanKisiler = getGoreviYapanKisiler(gorev.gorev_id);

        if (yapanKisiler.length === 0) return;

        // Öncelik gruplarına ayır (5'ten 1'e doğru)
        const oncelikGruplari = {};
        yapanKisiler.forEach(k => {
            if (!oncelikGruplari[k.oncelik]) {
                oncelikGruplari[k.oncelik] = [];
            }
            oncelikGruplari[k.oncelik].push(k);
        });

        // Öncelik sırasına göre dağıt (5 → 4 → 3 → 2 → 1)
        let kalanIsYuku = toplamIsYuku;
        const oncelikSirasi = [5, 4, 3, 2, 1];
        const gorevAtamalari = []; // Bu görev için tüm atamalar

        for (const oncelik of oncelikSirasi) {
            if (kalanIsYuku <= 0.001) break;
            if (!oncelikGruplari[oncelik]) continue;

            const grupKisiler = oncelikGruplari[oncelik];

            // Bu gruptaki benzersiz pozisyonları al
            const grupPozisyonlar = [...new Set(grupKisiler.map(k => k.pozisyon_id))];

            // Her pozisyona KAPASİTE BAZLI dağıt (sırayla)
            for (const pozId of grupPozisyonlar) {
                if (kalanIsYuku <= 0.001) break;
                if (!pozisyonBilgi[pozId]) continue;

                const poz = pozisyonBilgi[pozId];
                const uygunKapasite = Math.max(0, poz.kalanKapasite);

                if (uygunKapasite <= 0) continue; // Bu pozisyon dolu, sonrakine geç

                // Bu pozisyona atanacak iş yükü (kapasitesi kadar veya kalan iş yükü kadar)
                const atanacak = Math.min(kalanIsYuku, uygunKapasite);

                if (atanacak > 0.001) {
                    gorevAtamalari.push({
                        pozId,
                        atanacak,
                        oncelik,
                        yapanKisiSayisi: grupKisiler.filter(k => k.pozisyon_id === pozId).length
                    });

                    // Kapasite ve kalan iş yükünü güncelle
                    poz.kalanKapasite -= atanacak;
                    kalanIsYuku -= atanacak;
                }
            }
        }

        // Eğer hala kalan iş yükü varsa (tüm kapasiteler doldu)
        // En yüksek öncelikli pozisyonlara zorunlu olarak ata (mesai olarak)
        if (kalanIsYuku > 0.001) {
            // En yüksek öncelikli gruptan başlayarak zorla ata
            for (const oncelik of oncelikSirasi) {
                if (kalanIsYuku <= 0.001) break;
                if (!oncelikGruplari[oncelik]) continue;

                const grupPozisyonlar = [...new Set(oncelikGruplari[oncelik].map(k => k.pozisyon_id))];

                // Kalan iş yükünü bu gruptaki tüm pozisyonlara eşit dağıt
                const pozBasina = kalanIsYuku / grupPozisyonlar.length;

                grupPozisyonlar.forEach(pozId => {
                    if (pozisyonBilgi[pozId]) {
                        gorevAtamalari.push({
                            pozId,
                            atanacak: pozBasina,
                            oncelik,
                            yapanKisiSayisi: oncelikGruplari[oncelik].filter(k => k.pozisyon_id === pozId).length,
                            mesaiOlarak: true
                        });
                        pozisyonBilgi[pozId].kalanKapasite -= pozBasina;
                    }
                });

                kalanIsYuku = 0;
                break; // Sadece en yüksek öncelikli gruba mesai olarak ekle
            }
        }

        // Atamaları pozisyonlara uygula
        gorevAtamalari.forEach(atama => {
            if (pozisyonBilgi[atama.pozId]) {
                pozisyonIsYuku[atama.pozId] += atama.atanacak;

                // Aynı görev için birden fazla atama olabilir (normal + mesai)
                const mevcutGorev = pozisyonBilgi[atama.pozId].gorevler.find(
                    g => g.gorev_id === gorev.gorev_id
                );

                if (mevcutGorev) {
                    mevcutGorev.toplamSaat += atama.atanacak;
                    mevcutGorev.paylasimOrani = mevcutGorev.toplamSaat / toplamIsYuku;
                } else {
                    pozisyonBilgi[atama.pozId].gorevler.push({
                        ...gorev,
                        toplamSaat: atama.atanacak,
                        paylasildi: gorevAtamalari.length > 1,
                        paylasimOrani: atama.atanacak / toplamIsYuku,
                        ortakPozisyonSayisi: [...new Set(gorevAtamalari.map(a => a.pozId))].length,
                        atananOncelik: atama.oncelik,
                        yapanKisiSayisi: atama.yapanKisiSayisi
                    });
                }
            }
        });
    });

    return { pozisyonIsYuku, pozisyonBilgi };
}

/**
 * OPTİMİZE HESAPLAMA - Artık Kademeli Dağıtım kullanıyor
 */
function hesaplaOptimize(gorevler, config, isPozisyonBazli) {
    return hesaplaKademeli(gorevler, config, isPozisyonBazli);
}

// ========== ANA HESAPLAMA FONKSİYONU ==========

function hesaplaInternal(config, isPozisyonBazli) {
    const dagitimYontemi = document.querySelector('input[name="dagitimYontemi"]:checked')?.value || 'oransal';
    const oncelikFiltre = config?.oncelikFiltre || getSecilenOncelikler();
    const donemParametreleri = config?.donemParametreleri || getDonemParametreleri();

    // Tikli görevleri al - öncelik filtresi ile
    const gorevler = getGorevlerWithWorkload(oncelikFiltre);

    if (gorevler.length === 0) {
        showNotification('Hesaplanacak veri bulunamadı. Seçili öncelik seviyeleri için görev matrisinde tik olmayabilir.', 'warning');
        return;
    }

    // Dönem parametrelerini config'e ekle
    if (config) {
        config.donemParametreleri = donemParametreleri;
    }

    // Hesapla
    let sonuc;
    if (dagitimYontemi === 'optimize') {
        sonuc = hesaplaOptimize(gorevler, config, isPozisyonBazli);
    } else {
        sonuc = hesaplaOransal(gorevler, config, isPozisyonBazli);
    }

    const { pozisyonIsYuku, pozisyonBilgi } = sonuc;

    // Rapor oluştur
    raporVerisi = [];
    let toplamMevcut = 0;
    let toplamGerekli = 0;
    let toplamMesai = 0;

    Object.keys(pozisyonBilgi).forEach(pozId => {
        const poz = pozisyonBilgi[pozId];

        // Görevi olmayan pozisyonları atla
        if (poz.gorevler.length === 0) return;

        const toplamSaat = pozisyonIsYuku[pozId] || 0;
        const netKapasite = poz.netKapasitePerPerson;
        const gerekliKisi = netKapasite > 0 ? toplamSaat / netKapasite : 0;
        const mevcut = poz.personelSayisi || 0;
        const fark = mevcut - gerekliKisi;

        const mevcutKapasite = mevcut * netKapasite;
        const mesaiIhtiyaci = toplamSaat > mevcutKapasite ? toplamSaat - mevcutKapasite : 0;

        const dolulukOrani = mevcut > 0 ? (toplamSaat / (netKapasite * mevcut)) * 100 : 0;

        const gorevlerDetay = poz.gorevler.map(g => ({
            gorev_adi: g.gorev_adi,
            hacim: g.hacim,
            periyot: g.periyot,
            standart_sure: g.standart_sure,
            zaman_birim: g.zaman_birim,
            toplamSaat: g.toplamSaat,
            paylasildi: g.paylasildi,
            paylasimOrani: g.paylasimOrani,
            ortakPozisyonSayisi: g.ortakPozisyonSayisi,
            yapanKisiSayisi: g.yapanKisiSayisi,
            aylikCalisma: poz.aylikCalisma,
            verimlilik: poz.verimlilik,
            gerekliKisi: netKapasite > 0 ? g.toplamSaat / netKapasite : 0
        }));

        raporVerisi.push({
            pozisyon: poz.pozisyon_adi,
            departman: poz.departman || '-',
            mevcut: mevcut,
            gerekli: gerekliKisi,
            fark: fark,
            durum: fark >= 0 ? 'Yeterli' : 'Eksik',
            toplamSaat: toplamSaat,
            mesaiIhtiyaci: mesaiIhtiyaci,
            dolulukOrani: dolulukOrani,
            gorevler: gorevlerDetay
        });

        toplamMevcut += mevcut;
        toplamGerekli += gerekliKisi;
        toplamMesai += mesaiIhtiyaci;
    });

    // Eksik personel olanlar önce
    raporVerisi.sort((a, b) => a.fark - b.fark);

    // Özet güncelle
    document.getElementById('toplamMevcut').textContent = formatNumber(toplamMevcut, 0);
    document.getElementById('toplamGerekli').textContent = formatNumber(toplamGerekli, 2);
    document.getElementById('toplamFark').textContent = formatNumber(toplamMevcut - toplamGerekli, 2);

    // Mesai özeti güncelle (eğer element varsa)
    const mesaiEl = document.getElementById('toplamMesai');
    if (mesaiEl) {
        mesaiEl.textContent = formatNumber(toplamMesai, 1) + ' saat';
    }

    renderRaporTable();

    document.getElementById('sonucAlani').classList.remove('hidden');

    const yontemAdi = dagitimYontemi === 'optimize' ? 'Kademeli Dağıtım' : 'Oransal Dağıtım';
    showNotification(`Hesaplama tamamlandı (${yontemAdi})`, 'success');

    // Hesaplama sonuçlarını kaydet
    saveHesaplamaState();
}

function renderRaporTable() {
    const tbody = document.getElementById('raporTable');
    if (!tbody) return;

    if (raporVerisi.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    <i data-lucide="calculator"></i>
                    <p>Hesaplama yapılmadı</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = raporVerisi.map(r => {
        const paylasimliGorevSayisi = r.gorevler.filter(g => g.paylasildi).length;
        const paylasimBadge = paylasimliGorevSayisi > 0
            ? `<span class="badge badge-info" title="${paylasimliGorevSayisi} paylaşımlı görev">${paylasimliGorevSayisi}P</span>`
            : '';

        const mesaiDisplay = r.mesaiIhtiyaci > 0
            ? `<span class="text-danger font-bold">${formatNumber(r.mesaiIhtiyaci, 1)} saat</span>`
            : '<span class="text-muted">—</span>';

        return `
        <tr>
            <td>
                <strong>${r.pozisyon}</strong>
                ${paylasimBadge}
            </td>
            <td>${r.departman}</td>
            <td class="text-center">${r.mevcut}</td>
            <td class="text-center">${formatNumber(r.gerekli, 2)}</td>
            <td class="text-center">
                <span class="${r.fark >= 0 ? 'text-success' : 'text-danger'} font-bold">
                    ${r.fark >= 0 ? '+' : ''}${formatNumber(r.fark, 2)}
                </span>
            </td>
            <td class="text-center">${mesaiDisplay}</td>
            <td>
                <span class="badge ${r.fark >= 0 ? 'badge-success' : 'badge-danger'}">
                    ${r.durum}
                </span>
            </td>
        </tr>
    `;
    }).join('');

    lucide.createIcons();
}

function exportOzetRapor() {
    if (raporVerisi.length === 0) {
        showNotification('Önce hesaplama yapın', 'warning');
        return;
    }

    const dagitimYontemi = document.querySelector('input[name="dagitimYontemi"]:checked')?.value || 'oransal';

    const exportData = raporVerisi.map(r => ({
        'Pozisyon': r.pozisyon,
        'Departman': r.departman,
        'Mevcut Kişi': r.mevcut,
        'Gerekli Kişi': parseFloat(r.gerekli.toFixed(2)),
        'Fark': parseFloat(r.fark.toFixed(2)),
        'Toplam Saat/Ay': parseFloat(r.toplamSaat.toFixed(2)),
        'Mesai İhtiyacı (saat)': parseFloat((r.mesaiIhtiyaci || 0).toFixed(1)),
        'Doluluk %': parseFloat(r.dolulukOrani.toFixed(1)),
        'Durum': r.durum,
        'Dağıtım Yöntemi': dagitimYontemi === 'optimize' ? 'Kademeli' : 'Oransal'
    }));

    exportToExcel(exportData, 'norm_kadro_ozet');
}

function exportDetayRapor() {
    if (raporVerisi.length === 0) {
        showNotification('Önce hesaplama yapın', 'warning');
        return;
    }

    const dagitimYontemi = document.querySelector('input[name="dagitimYontemi"]:checked')?.value || 'oransal';

    const exportData = [];

    raporVerisi.forEach(r => {
        r.gorevler.forEach(g => {
            exportData.push({
                'Pozisyon': r.pozisyon,
                'Departman': r.departman,
                'Görev': g.gorev_adi,
                'Paylaşımlı': g.paylasildi ? 'Evet' : 'Hayır',
                'Paylaşım Oranı %': parseFloat((g.paylasimOrani * 100).toFixed(1)),
                'Yapan Kişi Sayısı': g.yapanKisiSayisi || 1,
                'Ortak Poz. Sayısı': g.ortakPozisyonSayisi || 1,
                'Aylık Çalışma Saati': g.aylikCalisma || '-',
                'Verimlilik': g.verimlilik || '-',
                'Hacim': g.hacim,
                'Periyot': g.periyot,
                'Standart Süre': g.standart_sure,
                'Süre Birimi': g.zaman_birim,
                'Toplam Saat/Ay': parseFloat(g.toplamSaat.toFixed(2)),
                'Gerekli Kişi': parseFloat(g.gerekliKisi.toFixed(3)),
                'Dağıtım Yöntemi': dagitimYontemi === 'optimize' ? 'Optimize' : 'Oransal'
            });
        });
    });

    exportToExcel(exportData, 'norm_kadro_detay');
}
