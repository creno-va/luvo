import { openDB, type IDBPDatabase } from "idb";
import { migrateStore, type Household } from "./household.ts";

let connection: Promise<IDBPDatabase> | undefined;
function db() {
  return (connection ??= openDB("luvo-local", 1, {
    upgrade(database) {
      database.createObjectStore("state");
      database.createObjectStore("files");
    },
  }));
}
export async function readState(): Promise<Household> {
  const transaction = (await db()).transaction("state", "readwrite");
  const stored = await transaction.store.get("current");
  const migrated = migrateStore(stored);
  if (!stored || stored.version !== 2)
    await transaction.store.put(migrated, "current");
  await transaction.done;
  return migrated;
}
export async function writeState(
  state: Household,
  file?: { id: string; blob: Blob },
  reset = false,
  removeFileId?: string,
) {
  const database = await db();
  const transaction = database.transaction(["state", "files"], "readwrite");
  if (reset) await transaction.objectStore("files").clear();
  if (removeFileId) await transaction.objectStore("files").delete(removeFileId);
  if (file) await transaction.objectStore("files").put(file.blob, file.id);
  await transaction.objectStore("state").put(state, "current");
  await transaction.done;
}
export async function readFile(id: string): Promise<Blob | undefined> {
  return (await db()).get("files", id);
}
export async function fingerprint(file: File): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
