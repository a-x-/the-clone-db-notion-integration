import { describe, it, expect } from 'vitest';

// Import the functions (this is a simplified test, actual functions are inside the main file)
function filterDatabaseSchemaProperties(properties: any): any {
  const filteredProperties: any = {};
  
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as any;
    
    // Skip relation properties as they reference other databases and can cause validation errors
    if (prop.type === 'relation') {
      console.log(`Skipping relation property in schema: ${key}`);
      continue;
    }
    
    // Skip rollup properties as they depend on relations
    if (prop.type === 'rollup') {
      console.log(`Skipping rollup property in schema: ${key}`);
      continue;
    }
    
    // Include all other property types (title, rich_text, number, select, etc.)
    filteredProperties[key] = value;
  }
  
  return filteredProperties;
}

function filterPropertiesForCreation(properties: any): any {
  const filteredProperties: any = {};
  
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as any;
    
    // Skip relation properties
    if (prop.type === 'relation') {
      continue;
    }
    
    // Skip rollup properties
    if (prop.type === 'rollup') {
      continue;
    }
    
    // Skip formula properties
    if (prop.type === 'formula') {
      continue;
    }
    
    // Skip system properties
    if (prop.type === 'created_by' || prop.type === 'last_edited_by') {
      continue;
    }
    
    if (prop.type === 'created_time' || prop.type === 'last_edited_time') {
      continue;
    }
    
    filteredProperties[key] = value;
  }
  
  return filteredProperties;
}

describe('Property Filtering', () => {
  describe('filterDatabaseSchemaProperties', () => {
    it('should filter out relation properties', () => {
      const input = {
        'Name': { type: 'title' },
        'Related Items': { type: 'relation', relation: { database_id: 'some-id' } },
        'Status': { type: 'select' },
        'Count': { type: 'rollup' }
      };

      const result = filterDatabaseSchemaProperties(input);

      expect(result).toEqual({
        'Name': { type: 'title' },
        'Status': { type: 'select' }
      });
    });

    it('should keep all other property types', () => {
      const input = {
        'Title': { type: 'title' },
        'Description': { type: 'rich_text' },
        'Priority': { type: 'select' },
        'Due Date': { type: 'date' },
        'Completed': { type: 'checkbox' },
        'Price': { type: 'number' }
      };

      const result = filterDatabaseSchemaProperties(input);

      expect(result).toEqual(input);
    });
  });

  describe('filterPropertiesForCreation', () => {
    it('should filter out problematic properties for page creation', () => {
      const input = {
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        'Related Items': { type: 'relation', relation: [{ id: 'page-id' }] },
        'Status': { type: 'select', select: { name: 'In Progress' } },
        'Total Count': { type: 'rollup', rollup: { number: 5 } },
        'Auto Calc': { type: 'formula', formula: { string: 'computed' } },
        'Created By': { type: 'created_by', created_by: { id: 'user-id' } },
        'Last Edited': { type: 'last_edited_time', last_edited_time: '2023-01-01T00:00:00.000Z' }
      };

      const result = filterPropertiesForCreation(input);

      expect(result).toEqual({
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        'Status': { type: 'select', select: { name: 'In Progress' } }
      });
    });

    it('should handle empty properties object', () => {
      const result = filterPropertiesForCreation({});
      expect(result).toEqual({});
    });
  });
}); 
