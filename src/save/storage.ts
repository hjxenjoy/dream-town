import Dexie, { type Table } from 'dexie';
import { migrateSave, validateSave, type GameState } from '../sim/world.ts';

export const SAVE_SLOTS = ['autosave', 'slot-1', 'slot-2', 'slot-3'] as const;
type SaveSlot = (typeof SAVE_SLOTS)[number];

export interface SaveSummary {
  slot: string;
  savedAt: number;
  level: number;
  population: number;
}

interface SaveRecord extends SaveSummary {
  contents: string;
}

interface SaveEnvelope {
  format: 'dream-town-save';
  formatVersion: 1;
  checksum: string;
  data: GameState;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const db = new Dexie('dream-town-v2');
db.version(1).stores({ saves: '&slot,savedAt' });
const saves: Table<SaveRecord, string> = db.table('saves');

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

function crc32(text: string): string {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function checkedSlot(slot: string): SaveSlot {
  if (!(SAVE_SLOTS as readonly string[]).includes(slot)) {
    throw new SaveError('存档槽位无效。请选择自动存档或手动槽位 1～3。');
  }
  return slot as SaveSlot;
}

function slotLabel(slot: string): string {
  return slot === 'autosave' ? '自动存档' : `手动存档 ${slot.slice(-1)}`;
}

function storageError(error: unknown, action: string): SaveError {
  if (error instanceof SaveError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') {
    return new SaveError('浏览器存储空间不足，存档未写入。请导出备份，再清理浏览器空间。原存档已保留。');
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return new SaveError('浏览器不允许访问本地存档。请允许网站存储，或使用普通浏览窗口。原存档已保留。');
  }
  return new SaveError(`${action}失败，浏览器存储暂时不可用。请重试；原存档已保留。`);
}

function encodeSave(state: GameState): string {
  if (!validateSave(state)) {
    throw new SaveError('当前游戏数据不完整，无法保存。原存档已保留。');
  }
  let data: GameState;
  try {
    // Keep runtime references and the caller's savedAt untouched.
    data = JSON.parse(JSON.stringify(state)) as GameState;
  } catch {
    throw new SaveError('当前游戏数据无法序列化，无法保存。原存档已保留。');
  }
  data.savedAt = Date.now();
  const payload = JSON.stringify(data);
  const envelope: SaveEnvelope = {
    format: 'dream-town-save',
    formatVersion: 1,
    checksum: crc32(payload),
    data,
  };
  return JSON.stringify(envelope);
}

/** Validate both the file wrapper and all gameplay data before accepting a save. */
export function parseSave(text: string): GameState {
  if (typeof text !== 'string') {
    throw new SaveError('存档内容缺失或格式不正确，无法读取。原存档已保留。');
  }
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    throw new SaveError('存档文件过大，最多支持 8 MB 的 JSON 存档。');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SaveError('存档不是有效的 JSON 文件，无法读取。原存档已保留。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SaveError('存档格式不正确，请选择本游戏导出的 JSON 存档。');
  }
  const envelope = value as Record<string, unknown>;
  const keys = Object.keys(envelope);
  if (
    keys.length !== 4 ||
    !keys.every((key) => ['format', 'formatVersion', 'checksum', 'data'].includes(key)) ||
    envelope.format !== 'dream-town-save' ||
    envelope.formatVersion !== 1
  ) {
    throw new SaveError('存档格式或版本不兼容，请选择新版小镇导出的存档。原存档已保留。');
  }
  if (typeof envelope.checksum !== 'string' || !/^[a-f0-9]{8}$/.test(envelope.checksum)) {
    throw new SaveError('存档缺少有效校验码，无法确认文件完整性。原存档已保留。');
  }
  let payload: string;
  try {
    payload = JSON.stringify(envelope.data);
  } catch {
    throw new SaveError('存档数据结构异常，无法读取。原存档已保留。');
  }
  if (crc32(payload) !== envelope.checksum) {
    throw new SaveError('存档完整性校验失败，文件可能已损坏或被修改。原存档已保留。');
  }
  const restored = migrateSave(envelope.data);
  if (!restored) {
    throw new SaveError('存档中的小镇数据不完整或数值无效，无法恢复。原存档已保留。');
  }
  return restored;
}

/** Load leaves savedAt intact so the simulation can settle elapsed offline time once. */
export async function loadGame(slot = 'autosave'): Promise<GameState | null> {
  const key = checkedSlot(slot);
  try {
    const record = await saves.get(key);
    if (!record) return null;
    try {
      return parseSave(record.contents);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '数据无法识别。';
      throw new SaveError(`${slotLabel(key)}读取失败：${detail}`);
    }
  } catch (error) {
    throw storageError(error, '读取存档');
  }
}

export async function saveGame(state: GameState, slot = 'autosave'): Promise<void> {
  const key = checkedSlot(slot);
  const contents = encodeSave(state);
  const snapshot = parseSave(contents);
  const record: SaveRecord = {
    slot: key,
    savedAt: snapshot.savedAt,
    level: snapshot.level,
    population: snapshot.population,
    contents,
  };
  try {
    await db.transaction('rw', saves, async () => {
      const temporaryKey = `__pending__:${key}`;
      await saves.put({ ...record, slot: temporaryKey });
      const staged = await saves.get(temporaryKey);
      if (!staged) throw new SaveError('存档写入校验失败，原存档已保留。');
      parseSave(staged.contents);
      await saves.put({ ...staged, slot: key });
      await saves.delete(temporaryKey);
    });
  } catch (error) {
    throw storageError(error, '保存小镇');
  }
}

export async function listSaves(): Promise<SaveSummary[]> {
  try {
    const records = await saves.bulkGet([...SAVE_SLOTS]);
    return records.flatMap((record) => {
      if (!record) return [];
      let state: GameState;
      try {
        state = parseSave(record.contents);
      } catch (error) {
        const detail = error instanceof Error ? error.message : '数据无法识别。';
        throw new SaveError(`${slotLabel(record.slot)}读取失败：${detail}`);
      }
      return [{
        slot: record.slot,
        savedAt: state.savedAt,
        level: state.level,
        population: state.population,
      }];
    });
  } catch (error) {
    throw storageError(error, '读取存档列表');
  }
}

export function exportSave(state: GameState): void {
  const contents = encodeSave(state);
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dream-town-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Leave enough time for browsers to pick up the object URL for the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/** Import validates only; the UI chooses when to replace the active town and save it. */
export async function importSave(file: File): Promise<GameState> {
  if (file.size > MAX_FILE_BYTES) {
    throw new SaveError('存档文件过大，最多支持 8 MB 的 JSON 存档。');
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new SaveError('无法读取所选文件，请重新选择存档。原存档已保留。');
  }
  return parseSave(text);
}
