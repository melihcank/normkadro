/**
 * Norm Kadro Hesaplama Uygulaması - Konfigürasyon Dosyası
 * Veritabanı şeması ve uygulama ayarları
 */

// Veritabanı Şeması
const DB_SCHEMA = `
-- Pozisyonlar Tablosu (hiyerarşik yapı)
CREATE TABLE IF NOT EXISTS pozisyonlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pozisyon_adi TEXT NOT NULL,
    ust_pozisyon_id INTEGER,
    mevcut_kisi_sayisi INTEGER DEFAULT 0,
    departman TEXT,
    aciklama TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ust_pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE SET NULL
);

-- Personeller Tablosu
CREATE TABLE IF NOT EXISTS personeller (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personel_no TEXT NOT NULL UNIQUE,
    ad TEXT NOT NULL,
    soyad TEXT NOT NULL,
    pozisyon_id INTEGER,
    email TEXT,
    telefon TEXT,
    ise_baslama_tarihi DATE,
    durum TEXT DEFAULT 'aktif',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE SET NULL
);

-- Görevler Tablosu (artık tek pozisyona bağlı değil)
CREATE TABLE IF NOT EXISTS gorevler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gorev_adi TEXT NOT NULL,
    pozisyon_id INTEGER,
    oncelik INTEGER DEFAULT 3,
    aciklama TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE SET NULL
);

-- Görev-Pozisyon İlişki Tablosu (many-to-many)
CREATE TABLE IF NOT EXISTS gorev_pozisyon (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gorev_id INTEGER NOT NULL,
    pozisyon_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(gorev_id, pozisyon_id),
    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE,
    FOREIGN KEY (pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE CASCADE
);

-- Görev-Personel Durum Tablosu (matrix için)
CREATE TABLE IF NOT EXISTS gorev_personel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gorev_id INTEGER NOT NULL,
    personel_id INTEGER NOT NULL,
    yapiliyor INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(gorev_id, personel_id),
    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE,
    FOREIGN KEY (personel_id) REFERENCES personeller(id) ON DELETE CASCADE
);

-- İş Yükü Tablosu
CREATE TABLE IF NOT EXISTS is_yuku (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gorev_id INTEGER NOT NULL,
    hacim REAL NOT NULL,
    birim TEXT DEFAULT 'adet',
    periyot TEXT DEFAULT 'aylık',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE
);

-- Standart Zaman Tablosu
CREATE TABLE IF NOT EXISTS standart_zaman (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gorev_id INTEGER NOT NULL,
    standart_sure REAL NOT NULL,
    birim TEXT DEFAULT 'dakika',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE
);

-- Mevsimsel İş Yükü Çarpanları Tablosu
CREATE TABLE IF NOT EXISTS is_yuku_donem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gorev_id INTEGER NOT NULL,
    ay INTEGER NOT NULL,
    carpan REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(gorev_id, ay),
    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_pozisyonlar_ust ON pozisyonlar(ust_pozisyon_id);
CREATE INDEX IF NOT EXISTS idx_personeller_pozisyon ON personeller(pozisyon_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_pozisyon ON gorevler(pozisyon_id);
CREATE INDEX IF NOT EXISTS idx_is_yuku_gorev ON is_yuku(gorev_id);
CREATE INDEX IF NOT EXISTS idx_standart_zaman_gorev ON standart_zaman(gorev_id);
CREATE INDEX IF NOT EXISTS idx_gorev_pozisyon_gorev ON gorev_pozisyon(gorev_id);
CREATE INDEX IF NOT EXISTS idx_gorev_pozisyon_pozisyon ON gorev_pozisyon(pozisyon_id);
CREATE INDEX IF NOT EXISTS idx_gorev_personel_gorev ON gorev_personel(gorev_id);
CREATE INDEX IF NOT EXISTS idx_gorev_personel_personel ON gorev_personel(personel_id);
CREATE INDEX IF NOT EXISTS idx_is_yuku_donem_gorev ON is_yuku_donem(gorev_id);
`;

// Uygulama Konfigürasyonu
const APP_CONFIG = {
    aylikCalismaSeati: 160,
    verimlilikKatsayisi: 0.85,

    birimler: ['adet', 'sayfa', 'form', 'dosya', 'işlem', 'kayıt'],
    periyotlar: ['günlük', 'haftalık', 'aylık', 'yıllık'],
    zamanBirimleri: ['saniye', 'dakika', 'saat'],
    personelDurumlari: ['aktif', 'pasif', 'izinli'],

    periyotCarpanlari: {
        'günlük': 22,
        'haftalık': 4.33,
        'aylık': 1,
        'yıllık': 1 / 12
    },

    zamanCarpanlari: {
        'saniye': 1 / 60,
        'dakika': 1,
        'saat': 60
    },

    dbKey: 'normkadro_db',
    themeKey: 'normkadro_theme',
    configKey: 'normkadro_config',

    // Görev öncelik seviyeleri
    oncelikSeviyeleri: [
        { seviye: 1, isim: 'Opsiyonel', aciklama: 'Yapılmazsa da olur', renk: '#9ca3af' },
        { seviye: 2, isim: 'Düşük', aciklama: 'Ertelenebilir', renk: '#60a5fa' },
        { seviye: 3, isim: 'Normal', aciklama: 'Standart iş akışı', renk: '#34d399' },
        { seviye: 4, isim: 'Yüksek', aciklama: 'İş sürekliliği için önemli', renk: '#fbbf24' },
        { seviye: 5, isim: 'Kritik', aciklama: 'Yasal zorunluluk, durdurulamaz', renk: '#f87171' }
    ],

    // Mevsimsel iş yükü şablonları (ay: 1-12, çarpan: 0.5-2.0)
    mevsimselSablonlar: {
        'sabit': {
            isim: 'Sabit',
            aciklama: 'Tüm yıl boyunca sabit iş yükü',
            carpanlar: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]
        },
        'muhasebe': {
            isim: 'Muhasebe/Mali İşler',
            aciklama: 'Yıl sonu ve vergi dönemi yoğunluğu',
            carpanlar: [1.3, 0.9, 1.2, 1.3, 1.0, 0.85, 0.7, 0.7, 1.0, 1.1, 1.15, 1.3]
        },
        'satis': {
            isim: 'Satış/Pazarlama',
            aciklama: 'Kampanya dönemleri yoğunluğu',
            carpanlar: [0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 0.8, 0.7, 1.1, 1.2, 1.4, 1.5]
        },
        'ik': {
            isim: 'İnsan Kaynakları',
            aciklama: 'İşe alım sezonu yoğunluğu',
            carpanlar: [1.2, 1.1, 1.0, 0.9, 0.9, 0.8, 0.7, 0.7, 1.3, 1.2, 1.0, 0.9]
        },
        'yaz_dusuk': {
            isim: 'Yaz Tatili Etkili',
            aciklama: 'Yaz aylarında düşük iş yükü',
            carpanlar: [1.0, 1.0, 1.0, 1.0, 1.0, 0.8, 0.6, 0.6, 1.0, 1.1, 1.1, 1.0]
        }
    },

    ayIsimleri: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],

    ornekVeriler: {
        pozisyonlar: [
            { pozisyon_adi: 'Genel Müdür', ust_pozisyon_id: null, mevcut_kisi_sayisi: 1, departman: 'Yönetim', aciklama: 'Şirket yönetimi' },
            { pozisyon_adi: 'Mali İşler Müdürü', ust_pozisyon_id: 1, mevcut_kisi_sayisi: 1, departman: 'Mali İşler', aciklama: 'Mali işler yönetimi' },
            { pozisyon_adi: 'İK Müdürü', ust_pozisyon_id: 1, mevcut_kisi_sayisi: 1, departman: 'İK', aciklama: 'İnsan kaynakları yönetimi' },
            { pozisyon_adi: 'Satış Müdürü', ust_pozisyon_id: 1, mevcut_kisi_sayisi: 1, departman: 'Satış', aciklama: 'Satış yönetimi' },
            { pozisyon_adi: 'Muhasebe Uzmanı', ust_pozisyon_id: 2, mevcut_kisi_sayisi: 3, departman: 'Mali İşler', aciklama: 'Muhasebe işlemleri' },
            { pozisyon_adi: 'İK Uzmanı', ust_pozisyon_id: 3, mevcut_kisi_sayisi: 2, departman: 'İK', aciklama: 'Personel işlemleri' },
            { pozisyon_adi: 'Satış Temsilcisi', ust_pozisyon_id: 4, mevcut_kisi_sayisi: 5, departman: 'Satış', aciklama: 'Müşteri ilişkileri' }
        ],
        personeller: [
            { personel_no: 'P001', ad: 'Ahmet', soyad: 'Yılmaz', pozisyon_id: 1, email: 'ahmet@sirket.com', durum: 'aktif' },
            { personel_no: 'P002', ad: 'Mehmet', soyad: 'Kaya', pozisyon_id: 2, email: 'mehmet@sirket.com', durum: 'aktif' },
            { personel_no: 'P003', ad: 'Ayşe', soyad: 'Demir', pozisyon_id: 3, email: 'ayse@sirket.com', durum: 'aktif' },
            { personel_no: 'P004', ad: 'Fatma', soyad: 'Çelik', pozisyon_id: 4, email: 'fatma@sirket.com', durum: 'aktif' },
            { personel_no: 'P005', ad: 'Ali', soyad: 'Öztürk', pozisyon_id: 5, email: 'ali@sirket.com', durum: 'aktif' },
            { personel_no: 'P006', ad: 'Zeynep', soyad: 'Arslan', pozisyon_id: 5, email: 'zeynep@sirket.com', durum: 'aktif' },
            { personel_no: 'P007', ad: 'Mustafa', soyad: 'Şahin', pozisyon_id: 5, email: 'mustafa@sirket.com', durum: 'aktif' },
            { personel_no: 'P008', ad: 'Elif', soyad: 'Koç', pozisyon_id: 6, email: 'elif@sirket.com', durum: 'aktif' },
            { personel_no: 'P009', ad: 'Hasan', soyad: 'Aydın', pozisyon_id: 6, email: 'hasan@sirket.com', durum: 'aktif' },
            { personel_no: 'P010', ad: 'Merve', soyad: 'Yıldız', pozisyon_id: 7, email: 'merve@sirket.com', durum: 'aktif' },
            { personel_no: 'P011', ad: 'Emre', soyad: 'Polat', pozisyon_id: 7, email: 'emre@sirket.com', durum: 'aktif' },
            { personel_no: 'P012', ad: 'Selin', soyad: 'Aksoy', pozisyon_id: 7, email: 'selin@sirket.com', durum: 'aktif' },
            { personel_no: 'P013', ad: 'Burak', soyad: 'Erdoğan', pozisyon_id: 7, email: 'burak@sirket.com', durum: 'aktif' },
            { personel_no: 'P014', ad: 'Deniz', soyad: 'Özdemir', pozisyon_id: 7, email: 'deniz@sirket.com', durum: 'aktif' }
        ],
        gorevler: [
            { gorev_adi: 'Fatura İşleme', pozisyon_id: 5, aciklama: 'Faturaların işlenmesi' },
            { gorev_adi: 'Banka Mutabakat', pozisyon_id: 5, aciklama: 'Banka mutabakatları' },
            { gorev_adi: 'Bordro Hazırlama', pozisyon_id: 6, aciklama: 'Aylık bordro işlemleri' },
            { gorev_adi: 'İşe Alım Süreci', pozisyon_id: 6, aciklama: 'Mülakat ve işe alım' },
            { gorev_adi: 'Müşteri Ziyareti', pozisyon_id: 7, aciklama: 'Müşteri ziyaretleri' },
            { gorev_adi: 'Teklif Hazırlama', pozisyon_id: 7, aciklama: 'Teklif hazırlama' }
        ],
        isYuku: [
            { gorev_id: 1, hacim: 500, birim: 'adet', periyot: 'aylık' },
            { gorev_id: 2, hacim: 5, birim: 'adet', periyot: 'haftalık' },
            { gorev_id: 3, hacim: 1, birim: 'adet', periyot: 'aylık' },
            { gorev_id: 4, hacim: 10, birim: 'adet', periyot: 'aylık' },
            { gorev_id: 5, hacim: 8, birim: 'adet', periyot: 'haftalık' },
            { gorev_id: 6, hacim: 20, birim: 'adet', periyot: 'aylık' }
        ],
        standartZaman: [
            { gorev_id: 1, standart_sure: 5, birim: 'dakika' },
            { gorev_id: 2, standart_sure: 2, birim: 'saat' },
            { gorev_id: 3, standart_sure: 16, birim: 'saat' },
            { gorev_id: 4, standart_sure: 3, birim: 'saat' },
            { gorev_id: 5, standart_sure: 4, birim: 'saat' },
            { gorev_id: 6, standart_sure: 45, birim: 'dakika' }
        ]
    }
};

const SQL_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
const SQL_JS_WASM = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm';

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DB_SCHEMA, APP_CONFIG, SQL_JS_CDN, SQL_JS_WASM };
}
