/**
 * Norm Kadro - Veritabanı Yönetimi
 * SQL.js kullanarak tarayıcı tabanlı SQLite veritabanı
 */

let db = null;
let SQL = null;

async function initDB() {
    try {
        SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        const savedDB = loadDBFromStorage();
        if (savedDB) {
            db = new SQL.Database(savedDB);
            // Yeni sütunları kontrol et ve ekle
            migrateDB();
        } else {
            db = new SQL.Database();
            db.run(DB_SCHEMA);
            saveDB();
        }
        return true;
    } catch (error) {
        console.error('Veritabanı hatası:', error);
        throw error;
    }
}

// Veritabanı migration (yeni sütunlar için)
function migrateDB() {
    try {
        // ust_pozisyon_id sütunu var mı kontrol et
        const cols = executeQuery("PRAGMA table_info(pozisyonlar)");
        const hasUstPozisyon = cols.some(c => c.name === 'ust_pozisyon_id');

        if (!hasUstPozisyon) {
            db.run("ALTER TABLE pozisyonlar ADD COLUMN ust_pozisyon_id INTEGER REFERENCES pozisyonlar(id)");
        }

        // personeller tablosu var mı kontrol et
        const tables = executeQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='personeller'");
        if (tables.length === 0) {
            db.run(`
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
                )
            `);
            db.run("CREATE INDEX IF NOT EXISTS idx_personeller_pozisyon ON personeller(pozisyon_id)");
        }

        // gorev_pozisyon tablosu (many-to-many)
        const gpTables = executeQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='gorev_pozisyon'");
        if (gpTables.length === 0) {
            db.run(`
                CREATE TABLE IF NOT EXISTS gorev_pozisyon (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gorev_id INTEGER NOT NULL,
                    pozisyon_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(gorev_id, pozisyon_id),
                    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE,
                    FOREIGN KEY (pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE CASCADE
                )
            `);
            db.run("CREATE INDEX IF NOT EXISTS idx_gorev_pozisyon_gorev ON gorev_pozisyon(gorev_id)");
            db.run("CREATE INDEX IF NOT EXISTS idx_gorev_pozisyon_pozisyon ON gorev_pozisyon(pozisyon_id)");

            // Mevcut görevleri gorev_pozisyon tablosuna aktar
            const existingGorevler = executeQuery("SELECT id, pozisyon_id FROM gorevler WHERE pozisyon_id IS NOT NULL");
            existingGorevler.forEach(g => {
                try {
                    db.run("INSERT OR IGNORE INTO gorev_pozisyon (gorev_id, pozisyon_id) VALUES (?, ?)", [g.id, g.pozisyon_id]);
                } catch (e) { }
            });
        }

        // gorev_personel tablosu (matrix için)
        const gPerTables = executeQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='gorev_personel'");
        if (gPerTables.length === 0) {
            db.run(`
                CREATE TABLE IF NOT EXISTS gorev_personel (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gorev_id INTEGER NOT NULL,
                    personel_id INTEGER NOT NULL,
                    yapiliyor INTEGER DEFAULT 0,
                    oncelik INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(gorev_id, personel_id),
                    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE,
                    FOREIGN KEY (personel_id) REFERENCES personeller(id) ON DELETE CASCADE
                )
            `);
            db.run("CREATE INDEX IF NOT EXISTS idx_gorev_personel_gorev ON gorev_personel(gorev_id)");
            db.run("CREATE INDEX IF NOT EXISTS idx_gorev_personel_personel ON gorev_personel(personel_id)");
        }

        // gorev_personel tablosunda oncelik sütunu var mı kontrol et
        const gpCols = executeQuery("PRAGMA table_info(gorev_personel)");
        const hasGpOncelik = gpCols.some(c => c.name === 'oncelik');
        if (!hasGpOncelik) {
            db.run("ALTER TABLE gorev_personel ADD COLUMN oncelik INTEGER DEFAULT 0");
            // Mevcut yapiliyor=1 kayıtlar için varsayılan öncelik 3 (Normal) ata
            db.run("UPDATE gorev_personel SET oncelik = 3 WHERE yapiliyor = 1");
        }

        // gorevler tablosunda oncelik sütunu var mı kontrol et
        const gorevCols = executeQuery("PRAGMA table_info(gorevler)");
        const hasOncelik = gorevCols.some(c => c.name === 'oncelik');
        if (!hasOncelik) {
            db.run("ALTER TABLE gorevler ADD COLUMN oncelik INTEGER DEFAULT 3");
        }

        // is_yuku_donem tablosu (mevsimsel iş yükü çarpanları)
        const isYukuDonemTables = executeQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='is_yuku_donem'");
        if (isYukuDonemTables.length === 0) {
            db.run(`
                CREATE TABLE IF NOT EXISTS is_yuku_donem (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gorev_id INTEGER NOT NULL,
                    ay INTEGER NOT NULL,
                    carpan REAL DEFAULT 1.0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(gorev_id, ay),
                    FOREIGN KEY (gorev_id) REFERENCES gorevler(id) ON DELETE CASCADE
                )
            `);
            db.run("CREATE INDEX IF NOT EXISTS idx_is_yuku_donem_gorev ON is_yuku_donem(gorev_id)");
        }

        saveDB();
    } catch (error) {
        console.error('Migration hatası:', error);
    }
}

function saveDB() {
    if (!db) return;
    try {
        const data = db.export();
        const buffer = new Uint8Array(data);

        // Büyük veriler için chunked base64 encoding
        let base64 = '';
        const chunkSize = 8192; // 8KB chunks
        for (let i = 0; i < buffer.length; i += chunkSize) {
            const chunk = buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
            base64 += String.fromCharCode.apply(null, chunk);
        }
        base64 = btoa(base64);

        localStorage.setItem(APP_CONFIG.dbKey, base64);
    } catch (error) {
        console.error('SaveDB hatası:', error);
    }
}

function loadDBFromStorage() {
    try {
        const base64 = localStorage.getItem(APP_CONFIG.dbKey);
        if (!base64) return null;
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }
        return buffer;
    } catch (error) {
        return null;
    }
}

function executeQuery(sql, params = []) {
    if (!db) throw new Error('Veritabanı başlatılmamış');
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

function executeCommand(sql, params = [], skipSave = false) {
    if (!db) throw new Error('Veritabanı başlatılmamış');
    db.run(sql, params);
    const lastId = executeQuery('SELECT last_insert_rowid() as id')[0]?.id;
    if (!skipSave) {
        saveDB();
    }
    return { success: true, lastId };
}

function insert(table, data, skipSave = false) {
    const cols = Object.keys(data);
    const vals = Object.values(data);
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    return executeCommand(sql, vals, skipSave);
}

function update(table, id, data, skipSave = false) {
    const set = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${set} WHERE id = ?`;
    return executeCommand(sql, [...Object.values(data), id], skipSave);
}

function deleteRecord(table, id) {
    return executeCommand(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

function select(table, conditions = null, orderBy = null) {
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    if (conditions) {
        sql += ` WHERE ${Object.keys(conditions).map(k => `${k} = ?`).join(' AND ')}`;
        params.push(...Object.values(conditions));
    }
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
    return executeQuery(sql, params);
}

function getById(table, id) {
    const r = select(table, { id });
    return r.length > 0 ? r[0] : null;
}

function count(table) {
    return executeQuery(`SELECT COUNT(*) as c FROM ${table}`)[0]?.c || 0;
}

function resetDB() {
    db.run('DELETE FROM standart_zaman');
    db.run('DELETE FROM is_yuku');
    db.run('DELETE FROM gorevler');
    db.run('DELETE FROM personeller');
    db.run('DELETE FROM pozisyonlar');
    db.run('DELETE FROM sqlite_sequence');
    saveDB();
    return { success: true };
}

function loadSampleData() {
    const data = APP_CONFIG.ornekVeriler;
    data.pozisyonlar.forEach(p => insert('pozisyonlar', p));
    data.personeller.forEach(p => insert('personeller', p));
    data.gorevler.forEach(g => insert('gorevler', g));
    data.isYuku.forEach(iy => insert('is_yuku', iy));
    data.standartZaman.forEach(sz => insert('standart_zaman', sz));
    return { success: true };
}

function getDashboardStats() {
    return {
        pozisyonSayisi: count('pozisyonlar'),
        gorevSayisi: count('gorevler'),
        isYukuSayisi: count('is_yuku'),
        standartZamanSayisi: count('standart_zaman'),
        personelSayisi: count('personeller'),
        toplamMevcutKisi: executeQuery('SELECT COALESCE(SUM(mevcut_kisi_sayisi), 0) as t FROM pozisyonlar')[0]?.t || 0
    };
}

function getPozisyonlarWithGorevler() {
    return executeQuery(`
        SELECT p.*, COUNT(g.id) as gorev_sayisi, up.pozisyon_adi as ust_pozisyon_adi
        FROM pozisyonlar p 
        LEFT JOIN gorevler g ON p.id = g.pozisyon_id
        LEFT JOIN pozisyonlar up ON p.ust_pozisyon_id = up.id
        GROUP BY p.id ORDER BY p.pozisyon_adi
    `);
}

function getGorevlerWithPozisyon() {
    return executeQuery(`
        SELECT g.*, p.pozisyon_adi
        FROM gorevler g LEFT JOIN pozisyonlar p ON g.pozisyon_id = p.id
        ORDER BY p.pozisyon_adi, g.gorev_adi
    `);
}

function getIsYukuDetayli() {
    return executeQuery(`
        SELECT iy.*, g.gorev_adi, p.pozisyon_adi
        FROM is_yuku iy
        LEFT JOIN gorevler g ON iy.gorev_id = g.id
        LEFT JOIN pozisyonlar p ON g.pozisyon_id = p.id
        ORDER BY p.pozisyon_adi, g.gorev_adi
    `);
}

function getStandartZamanDetayli() {
    return executeQuery(`
        SELECT sz.*, g.gorev_adi, p.pozisyon_adi
        FROM standart_zaman sz
        LEFT JOIN gorevler g ON sz.gorev_id = g.id
        LEFT JOIN pozisyonlar p ON g.pozisyon_id = p.id
        ORDER BY p.pozisyon_adi, g.gorev_adi
    `);
}

function getNormKadroData() {
    // Önce gorev_pozisyon tablosundan veri almayı dene (yeni yapı)
    const gorevPozisyonCount = executeQuery("SELECT COUNT(*) as cnt FROM gorev_pozisyon");

    if (gorevPozisyonCount[0]?.cnt > 0) {
        // Yeni yapı: gorev_pozisyon junction table kullan
        return executeQuery(`
            SELECT p.id as pozisyon_id, p.pozisyon_adi, p.mevcut_kisi_sayisi, p.departman,
                   g.id as gorev_id, g.gorev_adi, iy.hacim, iy.birim as hacim_birim,
                   iy.periyot, sz.standart_sure, sz.birim as zaman_birim
            FROM pozisyonlar p
            JOIN gorev_pozisyon gp ON p.id = gp.pozisyon_id
            JOIN gorevler g ON gp.gorev_id = g.id
            LEFT JOIN is_yuku iy ON g.id = iy.gorev_id
            LEFT JOIN standart_zaman sz ON g.id = sz.gorev_id
            ORDER BY p.pozisyon_adi, g.gorev_adi
        `);
    } else {
        // Eski yapı: doğrudan pozisyon_id kullan (geriye uyumluluk)
        return executeQuery(`
            SELECT p.id as pozisyon_id, p.pozisyon_adi, p.mevcut_kisi_sayisi, p.departman,
                   g.id as gorev_id, g.gorev_adi, iy.hacim, iy.birim as hacim_birim,
                   iy.periyot, sz.standart_sure, sz.birim as zaman_birim
            FROM pozisyonlar p
            LEFT JOIN gorevler g ON p.id = g.pozisyon_id
            LEFT JOIN is_yuku iy ON g.id = iy.gorev_id
            LEFT JOIN standart_zaman sz ON g.id = sz.gorev_id
            ORDER BY p.pozisyon_adi, g.gorev_adi
        `);
    }
}

// ===== PERSONEL FONKSİYONLARI =====

function getPersonellerWithPozisyon() {
    return executeQuery(`
        SELECT per.*, p.pozisyon_adi, p.departman
        FROM personeller per
        LEFT JOIN pozisyonlar p ON per.pozisyon_id = p.id
        ORDER BY per.soyad, per.ad
    `);
}

function getPersonellerByPozisyon(pozisyonId) {
    return executeQuery(`
        SELECT * FROM personeller WHERE pozisyon_id = ? ORDER BY soyad, ad
    `, [pozisyonId]);
}

// ===== ORGANİZASYON ŞEMASI =====

function getOrgTree() {
    const pozisyonlar = executeQuery(`
        SELECT p.*, 
               (SELECT COUNT(*) FROM personeller per WHERE per.pozisyon_id = p.id) as personel_sayisi
        FROM pozisyonlar p
        ORDER BY p.id
    `);

    // Hiyerarşik yapıya dönüştür
    const buildTree = (parentId = null) => {
        return pozisyonlar
            .filter(p => p.ust_pozisyon_id === parentId)
            .map(p => ({
                ...p,
                children: buildTree(p.id),
                personeller: getPersonellerByPozisyon(p.id)
            }));
    };

    return buildTree(null);
}

function getPozisyonlarForDropdown() {
    return executeQuery(`
        SELECT id, pozisyon_adi, ust_pozisyon_id FROM pozisyonlar ORDER BY pozisyon_adi
    `);
}

// ===== EXPORT FONKSİYONLARI =====

function getAllDataForExport() {
    return {
        pozisyonlar: executeQuery(`
            SELECT p.id, p.pozisyon_adi, p.departman, p.ust_pozisyon_id,
                   (SELECT COUNT(*) FROM personeller per WHERE per.pozisyon_id = p.id) as personel_sayisi, 
                   up.pozisyon_adi as ust_pozisyon, p.aciklama
            FROM pozisyonlar p
            LEFT JOIN pozisyonlar up ON p.ust_pozisyon_id = up.id
            ORDER BY p.id
        `),
        personeller: executeQuery(`
            SELECT per.id, per.personel_no, per.ad, per.soyad, per.pozisyon_id, p.pozisyon_adi, 
                   p.departman, per.email, per.telefon, per.durum
            FROM personeller per
            LEFT JOIN pozisyonlar p ON per.pozisyon_id = p.id
            ORDER BY per.soyad, per.ad
        `),
        gorevler: executeQuery(`
            SELECT g.id, g.gorev_adi, g.pozisyon_id, p.pozisyon_adi, g.aciklama
            FROM gorevler g
            LEFT JOIN pozisyonlar p ON g.pozisyon_id = p.id
            ORDER BY p.pozisyon_adi, g.gorev_adi
        `),
        isYuku: executeQuery(`
            SELECT iy.id, iy.gorev_id, g.gorev_adi, p.pozisyon_adi, iy.hacim, iy.birim, iy.periyot
            FROM is_yuku iy
            LEFT JOIN gorevler g ON iy.gorev_id = g.id
            LEFT JOIN pozisyonlar p ON g.pozisyon_id = p.id
            ORDER BY p.pozisyon_adi, g.gorev_adi
        `),
        standartZaman: executeQuery(`
            SELECT sz.id, sz.gorev_id, g.gorev_adi, p.pozisyon_adi, sz.standart_sure, sz.birim
            FROM standart_zaman sz
            LEFT JOIN gorevler g ON sz.gorev_id = g.id
            LEFT JOIN pozisyonlar p ON g.pozisyon_id = p.id
            ORDER BY p.pozisyon_adi, g.gorev_adi
        `)
    };
}

// ===== EXCEL TAM ENTEGRASYON =====

function exportAllToExcel() {
    const data = getAllDataForExport();

    // Pozisyonlar sheet'i
    const pozisyonSheet = data.pozisyonlar.map(p => ({
        'ID': p.id,
        'Pozisyon Adı': p.pozisyon_adi,
        'Departman': p.departman || '',
        'Üst Pozisyon ID': p.ust_pozisyon_id || '',
        'Üst Pozisyon': p.ust_pozisyon || '',
        'Personel Sayısı': p.personel_sayisi,
        'Açıklama': p.aciklama || ''
    }));

    // Personeller sheet'i
    const personelSheet = data.personeller.map(p => ({
        'ID': p.id,
        'Personel No': p.personel_no,
        'Ad': p.ad,
        'Soyad': p.soyad,
        'Pozisyon ID': p.pozisyon_id || '',
        'Pozisyon': p.pozisyon_adi || '',
        'Departman': p.departman || '',
        'E-posta': p.email || '',
        'Telefon': p.telefon || '',
        'Durum': p.durum
    }));

    // Görevler sheet'i
    const gorevSheet = data.gorevler.map(g => ({
        'ID': g.id,
        'Görev Adı': g.gorev_adi,
        'Pozisyon ID': g.pozisyon_id || '',
        'Pozisyon': g.pozisyon_adi || '',
        'Açıklama': g.aciklama || ''
    }));

    // İş Yükü sheet'i
    const isYukuSheet = data.isYuku.map(iy => ({
        'ID': iy.id,
        'Görev ID': iy.gorev_id,
        'Görev': iy.gorev_adi || '',
        'Pozisyon': iy.pozisyon_adi || '',
        'Hacim': iy.hacim,
        'Birim': iy.birim,
        'Periyot': iy.periyot
    }));

    // Standart Zaman sheet'i
    const standartZamanSheet = data.standartZaman.map(sz => ({
        'ID': sz.id,
        'Görev ID': sz.gorev_id,
        'Görev': sz.gorev_adi || '',
        'Pozisyon': sz.pozisyon_adi || '',
        'Standart Süre': sz.standart_sure,
        'Birim': sz.birim
    }));

    // Workbook oluştur
    const wb = XLSX.utils.book_new();

    // Sheet'leri ekle
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pozisyonSheet), 'Pozisyonlar');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personelSheet), 'Personeller');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gorevSheet), 'Görevler');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(isYukuSheet), 'İş Yükü');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(standartZamanSheet), 'Standart Zaman');

    // Dosyayı indir
    const filename = `norm_kadro_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);

    showNotification('Tüm veriler Excel\'e aktarıldı', 'success');
}

async function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const confirmed = await showConfirmDialog(
        'Excel İçe Aktar',
        'Mevcut veriler silinecek ve Excel dosyasındaki verilerle değiştirilecek. Devam etmek istiyor musunuz?'
    );

    if (!confirmed) {
        event.target.value = '';
        return;
    }

    showLoading();

    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });

        // Mevcut verileri temizle
        db.run('DELETE FROM standart_zaman');
        db.run('DELETE FROM is_yuku');
        db.run('DELETE FROM gorevler');
        db.run('DELETE FROM personeller');
        db.run('DELETE FROM pozisyonlar');

        // ID sayaçlarını sıfırla
        db.run("DELETE FROM sqlite_sequence WHERE name IN ('pozisyonlar', 'personeller', 'gorevler', 'is_yuku', 'standart_zaman')");

        // Pozisyonlar sheet'inden oku
        if (wb.SheetNames.includes('Pozisyonlar')) {
            const sheet = wb.Sheets['Pozisyonlar'];
            const rows = XLSX.utils.sheet_to_json(sheet);

            // Önce tüm pozisyonları üst pozisyon olmadan ekle
            const idMapping = {};
            for (const row of rows) {
                const result = insert('pozisyonlar', {
                    pozisyon_adi: row['Pozisyon Adı'] || '',
                    departman: row['Departman'] || null,
                    aciklama: row['Açıklama'] || null,
                    ust_pozisyon_id: null // Sonra güncellenecek
                }, true);
                idMapping[row['ID']] = result.lastId;
            }

            // Üst pozisyon ilişkilerini güncelle
            for (const row of rows) {
                if (row['Üst Pozisyon ID'] && idMapping[row['Üst Pozisyon ID']]) {
                    update('pozisyonlar', idMapping[row['ID']], {
                        ust_pozisyon_id: idMapping[row['Üst Pozisyon ID']]
                    }, true);
                }
            }
        }

        // Pozisyon adı -> ID eşlemesi
        const pozisyonMap = {};
        const pozisyonlar = select('pozisyonlar');
        pozisyonlar.forEach(p => { pozisyonMap[p.pozisyon_adi] = p.id; });

        // Görevler sheet'inden oku
        const gorevIdMapping = {};
        if (wb.SheetNames.includes('Görevler')) {
            const sheet = wb.Sheets['Görevler'];
            const rows = XLSX.utils.sheet_to_json(sheet);

            for (const row of rows) {
                const pozisyonId = pozisyonMap[row['Pozisyon']] || null;
                const result = insert('gorevler', {
                    gorev_adi: row['Görev Adı'] || '',
                    pozisyon_id: pozisyonId,
                    aciklama: row['Açıklama'] || null
                }, true);
                gorevIdMapping[row['ID']] = result.lastId;
            }
        }

        // Görev adı -> ID eşlemesi
        const gorevMap = {};
        const gorevler = select('gorevler');
        gorevler.forEach(g => { gorevMap[g.gorev_adi] = g.id; });

        // Personeller sheet'inden oku
        if (wb.SheetNames.includes('Personeller')) {
            const sheet = wb.Sheets['Personeller'];
            const rows = XLSX.utils.sheet_to_json(sheet);

            for (const row of rows) {
                const pozisyonId = pozisyonMap[row['Pozisyon']] || null;
                insert('personeller', {
                    personel_no: row['Personel No'] || '',
                    ad: row['Ad'] || '',
                    soyad: row['Soyad'] || '',
                    pozisyon_id: pozisyonId,
                    email: row['E-posta'] || null,
                    telefon: row['Telefon'] || null,
                    durum: row['Durum'] || 'aktif'
                }, true);
            }
        }

        // İş Yükü sheet'inden oku
        if (wb.SheetNames.includes('İş Yükü')) {
            const sheet = wb.Sheets['İş Yükü'];
            const rows = XLSX.utils.sheet_to_json(sheet);

            for (const row of rows) {
                const gorevId = gorevMap[row['Görev']] || gorevIdMapping[row['Görev ID']] || null;
                if (gorevId) {
                    insert('is_yuku', {
                        gorev_id: gorevId,
                        hacim: row['Hacim'] || 0,
                        birim: row['Birim'] || 'adet',
                        periyot: row['Periyot'] || 'aylık'
                    }, true);
                }
            }
        }

        // Standart Zaman sheet'inden oku
        if (wb.SheetNames.includes('Standart Zaman')) {
            const sheet = wb.Sheets['Standart Zaman'];
            const rows = XLSX.utils.sheet_to_json(sheet);

            for (const row of rows) {
                const gorevId = gorevMap[row['Görev']] || gorevIdMapping[row['Görev ID']] || null;
                if (gorevId) {
                    insert('standart_zaman', {
                        gorev_id: gorevId,
                        standart_sure: row['Standart Süre'] || 0,
                        birim: row['Birim'] || 'dakika'
                    }, true);
                }
            }
        }

        saveDB();
        showNotification('Excel verileri başarıyla içe aktarıldı', 'success');

        // Sayfayı yenile
        setTimeout(() => location.reload(), 1000);

    } catch (error) {
        console.error('Excel içe aktarma hatası:', error);
        showNotification('Excel içe aktarma hatası: ' + error.message, 'error');
    } finally {
        hideLoading();
        event.target.value = '';
    }
}

// ===== YARDIMCI FONKSİYONLAR =====

function getDistinctDepartments() {
    return executeQuery(`
        SELECT DISTINCT departman FROM pozisyonlar 
        WHERE departman IS NOT NULL AND departman != '' 
        ORDER BY departman
    `).map(d => d.departman);
}

function getPersonelCountByPozisyon(pozisyonId) {
    return executeQuery(`
        SELECT COUNT(*) as c FROM personeller WHERE pozisyon_id = ?
    `, [pozisyonId])[0]?.c || 0;
}

// ===== MEVSİMSEL İŞ YÜKÜ FONKSİYONLARI =====

function getMevsimselCarpanlar(gorevId) {
    const rows = executeQuery(`
        SELECT ay, carpan FROM is_yuku_donem 
        WHERE gorev_id = ? ORDER BY ay
    `, [gorevId]);

    // 12 aylık dizi oluştur (varsayılan 1.0)
    const carpanlar = Array(12).fill(1.0);
    rows.forEach(r => {
        if (r.ay >= 1 && r.ay <= 12) {
            carpanlar[r.ay - 1] = r.carpan;
        }
    });
    return carpanlar;
}

function saveMevsimselCarpanlar(gorevId, carpanlar) {
    // Önce mevcut kayıtları sil
    db.run("DELETE FROM is_yuku_donem WHERE gorev_id = ?", [gorevId]);

    // Yeni kayıtları ekle
    carpanlar.forEach((carpan, index) => {
        const ay = index + 1;
        db.run(
            "INSERT INTO is_yuku_donem (gorev_id, ay, carpan) VALUES (?, ?, ?)",
            [gorevId, ay, carpan]
        );
    });

    saveDB();
    return { success: true };
}

function deleteMevsimselCarpanlar(gorevId) {
    db.run("DELETE FROM is_yuku_donem WHERE gorev_id = ?", [gorevId]);
    saveDB();
    return { success: true };
}

function hasMevsimselCarpan(gorevId) {
    const count = executeQuery(`
        SELECT COUNT(*) as c FROM is_yuku_donem WHERE gorev_id = ?
    `, [gorevId])[0]?.c || 0;
    return count > 0;
}

// ===== GÖREV ÖNCELİK FONKSİYONLARI =====

function updateGorevOncelik(gorevId, oncelik) {
    return update('gorevler', gorevId, { oncelik: oncelik });
}

function getGorevlerWithOncelik() {
    return executeQuery(`
        SELECT g.*, p.pozisyon_adi,
               COALESCE(g.oncelik, 3) as oncelik
        FROM gorevler g 
        LEFT JOIN pozisyonlar p ON g.pozisyon_id = p.id
        ORDER BY g.oncelik DESC, g.gorev_adi
    `);
}

// ===== GELİŞMİŞ HESAPLAMA VERİLERİ =====

function getNormKadroDataAdvanced(ay = null, oncelikFilter = null) {
    // Temel veriyi al
    let baseData = executeQuery(`
        SELECT p.id as pozisyon_id, p.pozisyon_adi, p.mevcut_kisi_sayisi, p.departman,
               g.id as gorev_id, g.gorev_adi, g.oncelik,
               iy.hacim, iy.birim as hacim_birim, iy.periyot, 
               sz.standart_sure, sz.birim as zaman_birim
        FROM pozisyonlar p
        LEFT JOIN gorev_pozisyon gp ON p.id = gp.pozisyon_id
        LEFT JOIN gorevler g ON gp.gorev_id = g.id
        LEFT JOIN is_yuku iy ON g.id = iy.gorev_id
        LEFT JOIN standart_zaman sz ON g.id = sz.gorev_id
        ORDER BY p.pozisyon_adi, g.oncelik DESC, g.gorev_adi
    `);

    // Öncelik filtresi uygula
    if (oncelikFilter && oncelikFilter.length > 0) {
        baseData = baseData.filter(d =>
            d.gorev_id === null || oncelikFilter.includes(d.oncelik)
        );
    }

    // Mevsimsel çarpan uygula
    if (ay !== null && ay >= 1 && ay <= 12) {
        baseData = baseData.map(d => {
            if (d.gorev_id) {
                const carpanlar = getMevsimselCarpanlar(d.gorev_id);
                const carpan = carpanlar[ay - 1];
                return { ...d, mevsimsel_carpan: carpan };
            }
            return { ...d, mevsimsel_carpan: 1.0 };
        });
    }

    return baseData;
}
