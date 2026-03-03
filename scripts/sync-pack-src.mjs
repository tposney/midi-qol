/**
 * Sync pack-src JSON files into the sampleitems compendium.
 *
 * Run this as a Foundry world macro to update the compendium from pack-src
 * without needing to compilePacks + return to setup.
 *
 * Prerequisites:
 *   A symlink from dist/pack-src -> pack-src must exist so Foundry serves the files.
 *   Create it with: ln -s ../pack-src dist/pack-src
 */

const PACK_ID = "midi-qol.midiqol-sample-items";
const BASE_PATH = "modules/midi-qol/pack-src/sampleitems";

async function browseRecursive(path) {
  const result = await FilePicker.browse("data", path, { extensions: [".json"] });
  let files = result.files ?? [];
  for (const dir of result.dirs ?? []) {
    files = files.concat(await browseRecursive(dir));
  }
  return files;
}

async function syncPackSrc() {
  const pack = game.packs.get(PACK_ID);
  if (!pack) {
    ui.notifications.error(`Pack ${PACK_ID} not found`);
    return;
  }

  // Unlock the pack if locked
  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });

  try {
    // Discover all JSON files
    console.log("sync-pack-src | Discovering files...");
    const files = await browseRecursive(BASE_PATH);
    console.log(`sync-pack-src | Found ${files.length} files`);

    const sourceIds = new Set();
    let created = 0, updated = 0, folders = 0, skipped = 0, errors = 0;

    for (const filePath of files) {
      try {
        const response = await fetch(filePath);
        if (!response.ok) {
          console.warn(`sync-pack-src | Failed to fetch ${filePath}: ${response.status}`);
          errors++;
          continue;
        }
        const data = await response.json();

        // Handle folder definitions
        if (filePath.endsWith("_Folder.json")) {
          const existing = pack.folders.get(data._id);
          if (existing) {
            const diff = foundry.utils.diffObject(existing.toObject(), data);
            if (!foundry.utils.isEmpty(diff)) {
              await Folder.updateDocuments([{ ...diff, _id: data._id }], { pack: PACK_ID });
              folders++;
            } else {
              skipped++;
            }
          } else {
            await Folder.create(data, { pack: PACK_ID, keepId: true });
            folders++;
          }
          continue;
        }

        // Handle item documents
        if (!data._id) {
          console.warn(`sync-pack-src | No _id in ${filePath}, skipping`);
          skipped++;
          continue;
        }

        sourceIds.add(data._id);

        const existing = pack.index.get(data._id);
        if (existing) {
          const doc = await pack.getDocument(data._id);
          const diff = foundry.utils.diffObject(doc.toObject(), data);
          if (!foundry.utils.isEmpty(diff)) {
            await doc.update(data, { diff: false, recursive: false });
            updated++;
            console.log(`sync-pack-src | Updated: ${data.name}`);
          } else {
            skipped++;
          }
        } else {
          await Item.create(data, { pack: PACK_ID, keepId: true });
          created++;
          console.log(`sync-pack-src | Created: ${data.name}`);
        }
      } catch (err) {
        console.error(`sync-pack-src | Error processing ${filePath}:`, err);
        errors++;
      }
    }

    // Handle deletions — items in pack but not in source
    let deleted = 0;
    for (const entry of pack.index) {
      if (!sourceIds.has(entry._id)) {
        const doc = await pack.getDocument(entry._id);
        await doc.delete();
        deleted++;
        console.log(`sync-pack-src | Deleted: ${entry.name} (not in pack-src)`);
      }
    }

    const msg = `sync-pack-src | Done: ${created} created, ${updated} updated, ${deleted} deleted, ${folders} folders, ${skipped} unchanged, ${errors} errors`;
    console.log(msg);
    ui.notifications.info(msg);
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
}

await syncPackSrc();
