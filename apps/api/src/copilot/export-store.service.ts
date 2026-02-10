import { Injectable } from '@nestjs/common';
import { CopilotTable } from './copilot-response.schema';

interface StoredExport {
  tables: CopilotTable[];
  createdAt: number;
}

@Injectable()
export class ExportStoreService {
  private readonly store = new Map<string, StoredExport>();
  private readonly TTL_MS = 60 * 60 * 1000;

  set(queryId: string, tables: CopilotTable[]): void {
    this.store.set(queryId, { tables, createdAt: Date.now() });
  }

  get(queryId: string): CopilotTable[] | null {
    const entry = this.store.get(queryId);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.TTL_MS) {
      this.store.delete(queryId);
      return null;
    }
    return entry.tables;
  }
}
