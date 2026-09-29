/* Calendario — IndexedDB storage layer */

const DB = (() => {
  const NAME = "calendario";
  const VERSION = 1;
  const STORES = ["profiles", "tasks", "events", "groceries", "meals"];
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
          }
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function strip(obj) {
    const out = {};
    for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
  }

  async function all(store) {
    const db = await open();
    return new Promise((res, rej) => {
      const r = db.transaction(store, "readonly").objectStore(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function get(store, id) {
    const db = await open();
    return new Promise((res, rej) => {
      const r = db.transaction(store, "readonly").objectStore(store).get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function create(store, data) {
    const clean = strip({ ...data });
    delete clean.id;
    if (!clean.created_at) clean.created_at = new Date().toISOString();
    const db = await open();
    const key = await new Promise((res, rej) => {
      const t = db.transaction(store, "readwrite");
      const r = t.objectStore(store).add(clean);
      t.oncomplete = () => res(r.result);
      t.onerror = () => rej(t.error);
    });
    return get(store, key);
  }

  async function update(store, id, patch) {
    const current = await get(store, id);
    if (!current) throw new Error("Not found: " + store + " #" + id);
    const merged = strip({ ...current, ...patch, id });
    const db = await open();
    await new Promise((res, rej) => {
      const t = db.transaction(store, "readwrite");
      t.objectStore(store).put(merged);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    return merged;
  }

  async function remove(store, id) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, "readwrite");
      t.objectStore(store).delete(id);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }

  async function clear(store) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, "readwrite");
      t.objectStore(store).clear();
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }

  async function loadAll() {
    const [profiles, tasks, events, groceries, meals] = await Promise.all(
      STORES.map(all)
    );
    return { profiles, tasks, events, groceries, meals };
  }

  async function exportAll() {
    const data = await loadAll();
    return {
      app: "calendario",
      version: 1,
      exported_at: new Date().toISOString(),
      data,
    };
  }

  function naturalKey(store, item) {
    if (store === "profiles") return item.name || "";
    if (store === "tasks") return [item.title, item.due_date, item.profile_id].join("|");
    if (store === "events") return [item.title, item.day, item.time].join("|");
    if (store === "groceries") return [item.name, item.purchased].join("|");
    if (store === "meals") return [item.title, item.day, item.slot].join("|");
    return JSON.stringify(item);
  }

  async function importAll(payload, mode = "merge") {
    if (!payload || !payload.data) throw new Error("Invalid backup file");
    const existing = await loadAll();
    const existingKeys = {};
    for (const s of STORES) {
      existingKeys[s] = new Set(existing[s].map((x) => naturalKey(s, x)));
    }
    let added = 0, skipped = 0;
    for (const s of STORES) {
      const incoming = payload.data[s] || [];
      for (const item of incoming) {
        const k = naturalKey(s, item);
        if (existingKeys[s].has(k) && mode === "merge") { skipped++; continue; }
        const clean = strip({ ...item });
        delete clean.id;
        await create(s, clean);
        existingKeys[s].add(k);
        added++;
      }
    }
    return { added, skipped };
  }

  async function wipe() {
    for (const s of STORES) await clear(s);
  }

  async function seedDemo() {
    const existing = await loadAll();
    if (existing.profiles.length > 0) return { seeded: false };

    const me = await create("profiles", { name: "Me", avatar: "🦊", color: "#6ea8fe" });
    const partner = await create("profiles", { name: "Partner", avatar: "🐻", color: "#6bdba0" });
    const today = new Date().toISOString().slice(0, 10);

    await create("tasks", {
      title: "Take out trash", due_date: today, priority: "high",
      status: "todo", recurrence: "weekly", profile_id: me.id,
    });
    await create("tasks", {
      title: "Wash dishes", due_date: today, priority: "normal",
      status: "todo", recurrence: "daily", profile_id: partner.id,
    });
    await create("groceries", { name: "Oat milk", quantity: "2", category: "dairy", purchased: false });
    await create("groceries", { name: "Bananas", quantity: "1 bunch", category: "produce", purchased: false });
    await create("meals", { day: today, slot: "dinner", title: "Pasta night", cook_profile_id: me.id });

    const in3 = new Date(); in3.setDate(in3.getDate() + 3);
    await create("events", {
      title: "Dentist", day: in3.toISOString().slice(0, 10),
      time: "14:30", important: true, profile_id: me.id,
    });

    return { seeded: true };
  }

  return {
    open, all, get, create, update, remove, clear,
    loadAll, exportAll, importAll, wipe, seedDemo, STORES,
  };
})();
