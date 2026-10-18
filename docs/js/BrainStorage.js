class BrainStorage {
    static STORAGE_KEY = "neuroevolution-racing-brains-v1";
    static BACKUP_KEY = "neuroevolution-racing-brains-v1-corrupted-backup";
    static MAX_BRAINS = 40;

    constructor(storage = localStorage) {
        this.storage = storage;
        this.recoveredFromCorruption = false; // une écriture a écarté des données abîmées
        this.backupSaved = false;             // ...et leur copie brute a été conservée
    }

    // Lecture tolérante, sans aucune écriture : renvoie les entrées valides et indique si
    // l'archive contient des données abîmées (JSON illisible, mauvais format, entrée invalide).
    inspect() {
        const raw = this.storage.getItem(BrainStorage.STORAGE_KEY);
        if (raw === null) return { records: [], corrupted: false, raw };

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            return { records: [], corrupted: true, raw };
        }
        if (!Array.isArray(parsed)) return { records: [], corrupted: true, raw };

        const records = parsed.filter(record => {
            try {
                BrainStorage.validateRecord(record);
                return true;
            } catch (error) {
                return false;
            }
        });
        return { records, corrupted: records.length !== parsed.length, raw };
    }

    // Les entrées valides de l'archive. Ne lève plus d'erreur sur une archive abîmée et ne
    // la modifie pas : la réparation est explicite (repair) ou liée à une écriture (save, import).
    list() {
        return this.inspect().records;
    }

    isCorrupted() {
        return this.inspect().corrupted;
    }

    save(record) {
        BrainStorage.validateRecord(record);
        const records = this.listForWrite().filter(saved => saved.id !== record.id);
        records.unshift(record);
        return this.commit(records);
    }

    clear() {
        this.storage.removeItem(BrainStorage.STORAGE_KEY);
        this.storage.removeItem(BrainStorage.BACKUP_KEY); // effacement explicite : tout part
    }

    importJSON(text) {
        let document;
        try {
            document = JSON.parse(text);
        } catch (error) {
            throw new Error("Le fichier JSON n’est pas valide.", { cause: error });
        }
        if (!document || document.format !== "neuroevolution-brains" ||
            document.version !== 1 || !Array.isArray(document.brains)) {
            throw new Error("Ce fichier n’est pas une archive de cerveaux compatible.");
        }

        document.brains.forEach(BrainStorage.validateRecord);
        // Une archive locale corrompue ne bloque pas l'import : ses entrées valides sont
        // gardées et sa copie brute est sauvegardée avant l'écriture (voir listForWrite).
        const merged = [...document.brains, ...this.listForWrite()];
        const unique = merged.filter((record, index, all) =>
            all.findIndex(candidate => candidate.id === record.id) === index
        ).slice(0, BrainStorage.MAX_BRAINS);
        return this.commit(unique);
    }

    // Lecture avant écriture (save, import) : si l'archive est abîmée, sa copie brute est
    // conservée sous BACKUP_KEY AVANT que l'écriture ne l'écrase, puis les entrées valides
    // sont reprises. `recoveredFromCorruption` et `backupSaved` décrivent ce qui s'est passé.
    listForWrite() {
        const { records, corrupted, raw } = this.inspect();
        this.recoveredFromCorruption = corrupted;
        this.backupSaved = corrupted ? this.backupRaw(raw) : false;
        return records;
    }

    // Répare l'archive : sauvegarde la copie brute, puis réécrit uniquement les entrées valides.
    repair() {
        return this.commit(this.listForWrite());
    }

    // UNIQUE point d'écriture de l'archive (save, importJSON, repair passent tous par ici).
    // Il garantit que ce qui est stocké est valide, sans jamais laisser d'état à moitié écrit :
    //  1. chaque entrée est validée ;
    //  2. le texte sérialisé est relu et revalidé (ce qui est écrit est exactement ce qui
    //     sera relu : un NaN devenu `null` par JSON.stringify, par exemple, est refusé ici) ;
    //  3. après écriture, la valeur stockée est relue et comparée ;
    //  4. au moindre échec, l'ancienne valeur est restaurée et l'erreur est propagée.
    commit(records) {
        const kept = records.slice(0, BrainStorage.MAX_BRAINS);
        kept.forEach(BrainStorage.validateRecord);

        const text = JSON.stringify(kept);
        const reread = JSON.parse(text);
        if (!Array.isArray(reread) || reread.length !== kept.length) {
            throw new Error("L’archive des cerveaux n’a pas pu être sérialisée correctement.");
        }
        reread.forEach(BrainStorage.validateRecord);

        const previous = this.storage.getItem(BrainStorage.STORAGE_KEY);
        try {
            this.storage.setItem(BrainStorage.STORAGE_KEY, text);
            if (this.storage.getItem(BrainStorage.STORAGE_KEY) !== text) {
                throw new Error("L’archive écrite ne correspond pas à ce qui devait être enregistré.");
            }
        } catch (error) {
            this.restore(previous);
            throw error;
        }
        return kept;
    }

    // Remet l'archive dans son état d'avant une écriture ratée (best effort).
    restore(previous) {
        try {
            if (previous === null) this.storage.removeItem(BrainStorage.STORAGE_KEY);
            else this.storage.setItem(BrainStorage.STORAGE_KEY, previous);
        } catch (error) {
            // rien de plus à faire : l'erreur d'origine est propagée par commit()
        }
    }

    // Conserve la dernière copie brute d'une archive abîmée. Retourne false si elle n'a pas
    // pu être écrite (quota plein...) : l'écriture qui suit a lieu quand même.
    backupRaw(raw) {
        try {
            this.storage.setItem(BrainStorage.BACKUP_KEY, raw);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Texte brut de la dernière archive abîmée sauvegardée (ou null).
    getCorruptedBackup() {
        return this.storage.getItem(BrainStorage.BACKUP_KEY);
    }

    exportJSON() {
        return JSON.stringify({
            format: "neuroevolution-brains",
            version: 1,
            brains: this.list()
        }, null, 2);
    }

    static validateRecord(record) {
        if (!record || typeof record.id !== "string" || typeof record.name !== "string" ||
            !Number.isFinite(record.score) || !record.brain) {
            throw new Error("Une entrée de l’archive des cerveaux est invalide.");
        }
        NeuralNetwork.validateJSON(record.brain);
    }
}
