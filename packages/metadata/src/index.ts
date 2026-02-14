export class MetadataRepository {
  tables = new Map();
  
  getTable(name: string) {
    return this.tables.get(name);
  }
}

export default MetadataRepository;
